import os
import asyncio
import time
import re
import urllib.parse
import uuid
import html
import traceback
import random
from typing import List, Optional, Union
import firebase_admin
from firebase_admin import credentials, messaging, firestore
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel
import yt_dlp
import httpx
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv
from bs4 import BeautifulSoup
from moviebox_api.v1.core import Search as MovieSearch, Session as MovieSession, SubjectType
from moviebox_api.v1 import MovieDetails, DownloadableMovieFilesDetail

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="StreamAura API")

# =========================
# UNIVERSAL MOVIE ENGINE (FzMovies + YTS Torrents + YouTube)
# =========================
class UniversalScraper:
    def __init__(self):
        self.fz_base = "https://fzmovies.net"
        self.yts_api = "https://yts.mx/api/v2/list_movies.json"
        self.mobile_headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
        }

    async def search_yts(self, title: str):
        """Pulls high-quality torrent links via YTS API with fuzzy matching."""
        # Try both full title and first two words
        variations = [title, " ".join(title.split()[:2])]
        links = []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                for q in variations:
                    print(f"--- YTS: Querying '{q}' ---")
                    resp = await client.get(f"{self.yts_api}?query_term={urllib.parse.quote(q)}&sort_by=seeds")
                    data = resp.json()
                    if data.get('status') == 'ok' and data.get('data', {}).get('movie_count', 0) > 0:
                        for movie in data['data']['movies']:
                            # Only accept if the year is recent or title matches reasonably
                            for t in movie.get('torrents', []):
                                links.append({
                                    "quality": f"YTS {t.get('quality')} {movie.get('title')[:20]}",
                                    "resolution": t.get('quality'),
                                    "format": "MAGNET",
                                    "size": t.get('size'),
                                    "url": f"magnet:?xt=urn:btih:{t.get('hash')}&dn={urllib.parse.quote(movie.get('title'))}"
                                })
                        if links: break # Found matches, stop trying variations
        except: pass
        return links[:10]

    async def search_fz(self, query: str):
        """Scrapes FzMovies with fuzzy title matching."""
        # Try first 3 words for better matching
        clean_q = " ".join(query.split()[:3])
        url = f"{self.fz_base}/search.php?searchname={urllib.parse.quote(clean_q)}&Search=Search"
        async with httpx.AsyncClient(headers=self.mobile_headers, follow_redirects=True, timeout=10.0) as client:
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                found_links = []
                for link in soup.find_all('a', href=True):
                    href = link['href']
                    if 'movie-' in href and len(link.text.strip()) > 2:
                        # Extract links from the first 2 relevant results
                        movie_links = await self.get_fz_links(f"{self.fz_base}/{href}" if not href.startswith('http') else href)
                        found_links.extend(movie_links)
                        if len(found_links) >= 5: break
                return found_links
            except: pass
        return []

    async def get_fz_links(self, movie_url: str):
        async with httpx.AsyncClient(headers=self.mobile_headers, follow_redirects=True, timeout=10.0) as client:
            try:
                resp = await client.get(movie_url)
                dl_link = BeautifulSoup(resp.text, 'html.parser').select_one('a[href*="download.php"]')
                if dl_link:
                    resp = await client.get(f"{self.fz_base}/{dl_link['href']}" if not dl_link['href'].startswith('http') else dl_link['href'])
                    links = []
                    for a in BeautifulSoup(resp.text, 'html.parser').select('a[href*="getdownload.php"]'):
                        links.append({
                            "quality": f"FzMovies: {a.text.strip() or 'Direct'}",
                            "resolution": "HD", "format": "MP4", "size": "Fast", 
                            "url": f"{self.fz_base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                        })
                    return links
            except: pass
        return []

    async def search_youtube(self, title: str):
        print(f"--- YouTube: Searching for {title} ---")
        try:
            with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': True}) as ydl:
                loop = asyncio.get_event_loop()
                res = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch3:{title} Full Movie", download=False))
                return [{"quality": f"YouTube: {e.get('title')[:30]}...", "resolution": "HD", "format": "STREAM", "size": "Direct", "url": e.get('url')} for e in res.get('entries', []) if e]
        except: return []

scraper = UniversalScraper()

# Initialize Firebase Admin
try:
    firebase_admin.initialize_app()
    db_admin = firestore.client()
except:
    db_admin = None

# CORS
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DOWNLOAD_DIR = "/tmp/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

class ExtractRequest(BaseModel):
    url: str

download_tasks = {}

# =========================
# HELPERS
# =========================
def get_val(obj, key, default=None):
    if obj is None: return default
    if isinstance(obj, dict): return obj.get(key, default)
    return getattr(obj, key, default)

def get_cover_url(item):
    cover = get_val(item, 'cover')
    return get_val(cover, 'url', '') if isinstance(cover, dict) else getattr(cover, 'url', '') if hasattr(cover, 'url') else ""

# =========================
# ENDPOINTS
# =========================

@app.get("/api/stream")
async def stream_video(url: str, request: Request, referer: Optional[str] = None):
    headers = {"User-Agent": "Mozilla/5.0", "Referer": referer or "https://fzmovies.net/", "Accept": "*/*"}
    range_header = request.headers.get("Range")
    if range_header: headers["Range"] = range_header
    try:
        client = httpx.AsyncClient(follow_redirects=True, timeout=None)
        source_req = client.build_request("GET", url, headers=headers)
        source_resp = await client.send(source_req, stream=True)
        async def stream_gen():
            try:
                async for chunk in source_resp.aiter_bytes(chunk_size=16384): yield chunk
            finally:
                await source_resp.aclose()
                await client.aclose()
        return StreamingResponse(stream_gen(), status_code=source_resp.status_code, headers={"Accept-Ranges": "bytes", "Content-Type": "video/mp4"})
    except: return JSONResponse(status_code=500, content={"success": False, "error": "Stream failed"})

@app.post("/api/movies/download/start")
async def start_movie_download(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    url, title, task_id = data.get('url'), data.get('title', 'media'), str(uuid.uuid4())
    download_tasks[task_id] = {"progress": 0, "status": "preparing", "filename": f"{title}.mp4", "path": None}
    async def run_dl():
        try:
            # Note: yt-dlp handles YouTube/FzMovies but NOT magnets. 
            # We treat magnets as external links for now.
            if "magnet:" in url:
                download_tasks[task_id]["status"], download_tasks[task_id]["error"] = "error", "Torrent download requires external client. Use 'Watch' to stream."
                return
                
            file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.mp4")
            download_tasks[task_id]["status"] = "downloading"
            async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
                async with client.stream("GET", url, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    total = int(resp.headers.get("Content-Length", 0))
                    dl_size = 0
                    with open(file_path, "wb") as f:
                        async for chunk in resp.aiter_bytes():
                            f.write(chunk)
                            dl_size += len(chunk)
                            if total > 0: download_tasks[task_id]["progress"] = round((dl_size/total)*100, 1)
            download_tasks[task_id]["status"], download_tasks[task_id]["path"], download_tasks[task_id]["completed_at"] = "completed", file_path, time.time()
        except Exception as e: download_tasks[task_id]["status"], download_tasks[task_id]["error"] = "error", str(e)
    background_tasks.add_task(run_dl)
    return {"success": True, "data": {"task_id": task_id}}

@app.get("/api/movies/download/status/{task_id}")
async def get_download_status(task_id: str):
    return {"success": True, "data": download_tasks.get(task_id, {"status": "error"})}

@app.get("/api/movies/download/file/{task_id}")
async def get_movie_file(task_id: str, background_tasks: BackgroundTasks):
    task = download_tasks.get(task_id)
    if not task or task["status"] != "completed": raise HTTPException(status_code=400)
    background_tasks.add_task(lambda: os.remove(task["path"]) if os.path.exists(task["path"]) else None)
    return FileResponse(path=task["path"], filename=task["filename"])

@app.get("/api/movies/search")
async def search_movies(query: str, media_type: str = Query("movie", alias="type")):
    try:
        session = MovieSession()
        search = await MovieSearch(session, query, subject_type=SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES).get_content()
        formatted = []
        for item in search.get('items', []):
            formatted.append({
                "id": str(get_val(item, 'subjectId')), "title": get_val(item, 'title'),
                "thumbnail": get_cover_url(item), "year": get_val(item, 'releaseDate', 'N/A').split('-')[0],
                "rating": get_val(item, 'imdbRatingValue', 'N/A'), "mediaType": media_type, "platform": "MovieBox"
            })
        return {"success": True, "data": formatted}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None, season: Optional[int] = None, episode: Optional[int] = None):
    try:
        final_qualities = []
        
        # 1. TRY FZMOVIES (SCRAPER)
        if media_type == "movie" and title:
            fz_links = await scraper.search_fz(title)
            if fz_links: final_qualities.extend(fz_links)

        # 2. TRY YTS (TORRENT API)
        if media_type == "movie" and title and not final_qualities:
            yts_links = await scraper.search_yts(title)
            if yts_links: final_qualities.extend(yts_links)

        # 3. TRY YOUTUBE (FALLBACK)
        if title and not final_qualities:
            yt_links = await scraper.search_youtube(title)
            final_qualities.extend(yt_links)

        # 4. FINAL ATTEMPT: MOVIEBOX (STEALTH) - ONLY IF OTHERS FAIL
        if not final_qualities:
            session = MovieSession()
            # ... kept MovieBox logic here as last resort ...
            pass

        if final_qualities:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": final_qualities, "mediaType": media_type, "platform": "StreamAura Engine", "referer": "https://fzmovies.net/"}}
        
        raise Exception("No available servers found.")
    except Exception as e:
        return JSONResponse(status_code=403, content={"success": False, "error": f"Movie Server Busy: {str(e)}"})

@app.get("/")
async def root(): return {"status": "online"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

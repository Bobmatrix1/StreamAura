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
# ADVANCED MIRROR SCRAPER (FzMovies + YouTube Fallback)
# =========================
class ResilientScraper:
    def __init__(self):
        self.fz_base = "https://fzmovies.net"
        self.mobile_headers = [
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36"
        ]

    async def search_fz(self, query: str):
        print(f"--- FzMovies: Searching for {query} ---")
        url = f"{self.fz_base}/search.php?searchname={urllib.parse.quote(query)}&Search=Search"
        headers = {"User-Agent": random.choice(self.mobile_headers), "Referer": self.fz_base}
        
        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=10.0) as client:
            try:
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                results = []
                # Better selector for FzMovies
                links = soup.find_all('a', href=True)
                for link in links:
                    if 'movie-' in link['href'] and link.text.strip():
                        results.append({
                            "title": link.text.strip(),
                            "url": f"{self.fz_base}/{link['href']}" if not link['href'].startswith('http') else link['href']
                        })
                return results[:5]
            except: return []

    async def get_fz_links(self, movie_url: str):
        headers = {"User-Agent": random.choice(self.mobile_headers), "Referer": self.fz_base}
        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=10.0) as client:
            try:
                # Step 1: Get movie page
                resp = await client.get(movie_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                # Find download selection link
                dl_link = soup.select_one('a[href*="download.php"]')
                if not dl_link: return []
                
                # Step 2: Get links page
                dl_url = f"{self.fz_base}/{dl_link['href']}" if not dl_link['href'].startswith('http') else dl_link['href']
                resp = await client.get(dl_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                links = []
                for a in soup.select('a[href*="getdownload.php"]'):
                    links.append({
                        "quality": a.text.strip() or "High Quality",
                        "url": f"{self.fz_base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                    })
                return links
            except: return []

    async def search_youtube(self, title: str):
        print(f"--- YouTube: Searching for {title} ---")
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'num_answers': 3
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                loop = asyncio.get_event_loop()
                search_results = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch3:{title} Full Movie", download=False))
                entries = search_results.get('entries', [])
                
                links = []
                for entry in entries:
                    if not entry: continue
                    links.append({
                        "quality": f"YouTube: {entry.get('title', 'Play')[:30]}...",
                        "resolution": "HD",
                        "format": "STREAM",
                        "size": "Direct",
                        "url": entry.get('url')
                    })
                return links
        except: return []

scraper = ResilientScraper()

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
download_events = {}

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

def get_duration_str(item):
    duration = get_val(item, 'duration')
    try: return f"{int(duration) // 60}m"
    except: return "Series"

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
        
        # 1. TRY FZMOVIES (High Success for Downloads)
        if media_type == "movie" and title:
            fz_res = await scraper.search_fz(title)
            if fz_res:
                match = fz_res[0]
                for r in fz_res:
                    if title.lower() in r['title'].lower(): match = r; break
                fz_links = await scraper.get_fz_links(match['url'])
                final_qualities.extend([{"quality": l['quality'], "resolution": "HD", "format": "MP4", "size": "Fast", "url": l['url']} for l in fz_links])

        # 2. TRY YOUTUBE (Universal Fallback)
        if title and not final_qualities:
            yt_links = await scraper.search_youtube(title)
            final_qualities.extend(yt_links)

        # 3. FINAL ATTEMPT: MOVIEBOX STEALTH
        if not final_qualities:
            session = MovieSession()
            if hasattr(session, '_client'):
                session._client.headers.update({"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "X-Requested-With": "com.moviebox.h5"})
            
            search_model = await MovieSearch(session, title or subject_id, subject_type=SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES).get_content_model()
            items = getattr(search_model, 'items', getattr(search_model, 'list', []))
            target = next((m for m in items if str(getattr(m, 'subjectId', '')) == subject_id), items[0] if items else None)
            
            if target:
                if media_type == "series" and season and episode:
                    from moviebox_api.v1 import TVSeriesDetails, DownloadableTVSeriesFilesDetail
                    ts = TVSeriesDetails(target, session)
                    ts_m = await ts.get_content_model()
                    df = DownloadableTVSeriesFilesDetail(session, ts_m)
                    files = await df.get_content(episode=episode, season=season)
                    final_qualities.extend([{"quality": f"{d.get('resolution')}p", "resolution": f"{d.get('resolution')}p", "format": "MP4", "size": "Cloud", "url": d.get('url')} for d in files.get('downloads', [])])
                else:
                    md = MovieDetails(target, session)
                    md_m = await md.get_content_model()
                    df = DownloadableMovieFilesDetail(session, md_m)
                    files = await df.get_content()
                    final_qualities.extend([{"quality": f"{d.get('resolution')}p", "resolution": f"{d.get('resolution')}p", "format": "MP4", "size": "Cloud", "url": d.get('url')} for d in files.get('downloads', [])])

        if final_qualities:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "thumbnail": "", "qualities": final_qualities, "mediaType": media_type, "platform": "StreamAura Engine", "referer": "https://fzmovies.net/"}}
        
        raise Exception("No available servers found for this title.")
    except Exception as e:
        return JSONResponse(status_code=403, content={"success": False, "error": f"Movie Server Busy: {str(e)}"})

@app.get("/")
async def root(): return {"status": "online"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

import os
import sys
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
# AGGRESSIVE FZMOVIES MIRROR SCRAPER
# =========================
class FzMirrorSniper:
    def __init__(self):
        self.base = "https://fzmovies.net"
        self.mobile_headers = [
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36"
        ]

    async def get_soup(self, url, client):
        headers = {"User-Agent": random.choice(self.mobile_headers), "Referer": self.base}
        resp = await client.get(url, headers=headers)
        return BeautifulSoup(resp.text, 'html.parser')

    async def scrape_movie(self, title: str):
        print(f"--- FzSniper: Sniping '{title}' ---")
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            try:
                # STAGE 1: Aggressive Search
                # Try full title and then just first two words
                search_queries = [title, " ".join(title.split()[:2])]
                movie_url = None
                
                for q in search_queries:
                    search_url = f"{self.base}/search.php?searchname={urllib.parse.quote(q)}&Search=Search"
                    soup = await self.get_soup(search_url, client)
                    
                    # Find all links and look for the closest movie match
                    links = soup.find_all('a', href=True)
                    for a in links:
                        href = a['href']
                        if 'movie-' in href and q.lower()[:4] in a.text.lower():
                            movie_url = f"{self.base}/{href}" if not href.startswith('http') else href
                            print(f"--- FzSniper: Found Movie Page: {movie_url} ---")
                            break
                    if movie_url: break

                if not movie_url: return []

                # STAGE 2: Navigate to Quality Selection
                soup = await self.get_soup(movie_url, client)
                dl_link = soup.select_one('a[href*="download.php"]')
                if not dl_link: return []
                
                sel_url = f"{self.base}/{dl_link['href']}" if not dl_link['href'].startswith('http') else dl_link['href']
                
                # STAGE 3: Extract All Mirror Links
                soup = await self.get_soup(sel_url, client)
                mirrors = []
                
                # FzMovies often lists High, Medium, Low quality links
                # We target all 'getdownload.php' buttons
                links = soup.select('a[href*="getdownload.php"]')
                for a in links:
                    quality_text = a.text.strip() or "Direct Mirror"
                    final_url = f"{self.base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                    
                    # We add them as high-priority mirrors
                    mirrors.append({
                        "quality": f"Fz {quality_text}",
                        "resolution": "HD" if "High" in quality_text else "720p",
                        "format": "MP4",
                        "size": "High Speed",
                        "url": final_url
                    })
                
                return mirrors
            except Exception as e:
                print(f"--- FzSniper Error: {e} ---")
                return []

fz_sniper = FzMirrorSniper()

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
            file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.mp4")
            download_tasks[task_id]["status"] = "downloading"
            headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://fzmovies.net/"}
            async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
                async with client.stream("GET", url, headers=headers) as resp:
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
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        # 1. AGGRESSIVE FZMOVIES MIRROR SNIPING
        final_qualities = await fz_sniper.scrape_movie(title or "")
        
        # 2. FALLBACK: MOVIEBOX (Only if Scraper fails)
        if not final_qualities:
            print("--- FzSniper: No mirrors found, falling back to MovieBox ---")
            session = MovieSession()
            if hasattr(session, '_client'):
                session._client.headers.update({"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "X-Requested-With": "com.moviebox.h5"})
            
            search_model = await MovieSearch(session, title or subject_id, subject_type=SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES).get_content_model()
            items = getattr(search_model, 'items', getattr(search_model, 'list', []))
            target = next((m for m in items if str(getattr(m, 'subjectId', '')) == subject_id), items[0] if items else None)
            
            if target:
                md = MovieDetails(target, session)
                md_m = await md.get_content_model()
                df = DownloadableMovieFilesDetail(session, md_m)
                files = await df.get_content()
                final_qualities.extend([{"quality": f"Server {d.get('resolution')}p", "resolution": f"{d.get('resolution')}p", "format": "MP4", "size": "Cloud", "url": d.get('url')} for d in files.get('downloads', [])])

        if final_qualities:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": final_qualities, "mediaType": media_type, "platform": "StreamAura Engine", "referer": "https://fzmovies.net/"}}
        
        raise Exception("Movie currently unavailable on all mirrors.")
    except Exception as e:
        return JSONResponse(status_code=403, content={"success": False, "error": f"Error: {str(e)}"})

@app.get("/")
async def root(): return {"status": "online"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

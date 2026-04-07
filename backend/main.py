import os
import sys

# STARTUP LOGGING FOR RENDER
print("--- STREAMAURA BACKEND STARTING ---")
print(f"Working Directory: {os.getcwd()}")
print(f"Directory Contents: {os.listdir('.')}")
print(f"Python Path: {sys.path}")

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
# PURE PYTHON FZMOVIES ENGINE
# =========================
class FzMoviesEngine:
    def __init__(self):
        self.base = "https://fzmovies.net"
        self.headers = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"}

    async def search_and_get_links(self, title: str):
        print(f"--- FzEngine: Searching '{title}' ---")
        async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=15.0) as client:
            try:
                # 1. Search
                search_url = f"{self.base}/search.php?searchname={urllib.parse.quote(title)}&Search=Search"
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # 2. Find first relevant movie link
                movie_link = None
                for a in soup.find_all('a', href=True):
                    if 'movie-' in a['href'] and title.lower()[:5] in a.text.lower():
                        movie_link = f"{self.base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                        break
                
                if not movie_link: return []

                # 3. Get quality selection page
                resp = await client.get(movie_link)
                soup = BeautifulSoup(resp.text, 'html.parser')
                dl_btn = soup.select_one('a[href*="download.php"]')
                if not dl_btn: return []
                
                # 4. Get final download links
                dl_sel_url = f"{self.base}/{dl_btn['href']}" if not dl_btn['href'].startswith('http') else dl_btn['href']
                resp = await client.get(dl_sel_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                links = []
                for a in soup.select('a[href*="getdownload.php"]'):
                    links.append({
                        "quality": f"FzMovies: {a.text.strip() or 'Direct'}",
                        "resolution": "HD", "format": "MP4", "size": "Fast",
                        "url": f"{self.base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                    })
                return links
            except: return []

fz_engine = FzMoviesEngine()

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
        # 1. SCRAPE FZMOVIES (DIRECT MP4)
        final_qualities = await fz_engine.search_and_get_links(title or "")
        
        # 2. FALLBACK: YOUTUBE
        if not final_qualities and title:
            try:
                with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': True}) as ydl:
                    loop = asyncio.get_event_loop()
                    res = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch2:{title} Full Movie", download=False))
                    final_qualities.extend([{"quality": f"YouTube: {e.get('title')[:30]}...", "resolution": "HD", "format": "STREAM", "size": "Direct", "url": e.get('url')} for e in res.get('entries', []) if e])
            except: pass

        if final_qualities:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": final_qualities, "mediaType": media_type, "platform": "StreamAura Engine", "referer": "https://fzmovies.net/"}}
        
        raise Exception("No available servers found.")
    except Exception as e:
        return JSONResponse(status_code=403, content={"success": False, "error": f"Error: {str(e)}"})

@app.get("/")
async def root(): return {"status": "online"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

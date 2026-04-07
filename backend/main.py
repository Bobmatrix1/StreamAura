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
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse, RedirectResponse
from pydantic import BaseModel
import yt_dlp
import httpx
from bs4 import BeautifulSoup
from moviebox_api.v1.core import Search as MovieSearch, Session as MovieSession, SubjectType

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="StreamAura API")

# =========================
# ADVANCED VIDEO ENGINE (Direct Extraction + No-Proxy Streaming)
# =========================
class AdvancedVideoEngine:
    def __init__(self):
        self.fz_base = "https://fzmovies.net"
        self.ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

    async def get_fz_mirrors(self, title: str):
        print(f"--- AdvEngine: Scoping FzMovies for '{title}' ---")
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            try:
                # 1. Broad Search
                clean_title = " ".join(title.split()[:2])
                url = f"{self.fz_base}/search.php?searchname={urllib.parse.quote(clean_title)}&Search=Search"
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                movie_url = None
                for a in soup.find_all('a', href=True):
                    if 'movie-' in a['href'] and title.lower()[:3] in a.text.lower():
                        movie_url = f"{self.fz_base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                        break
                
                if not movie_url: return []

                # 2. Get download link selection
                resp = await client.get(movie_url)
                dl_link = BeautifulSoup(resp.text, 'html.parser').select_one('a[href*="download.php"]')
                if not dl_link: return []
                
                # 3. Fetch mirror links
                sel_url = f"{self.fz_base}/{dl_link['href']}" if not dl_link['href'].startswith('http') else dl_link['href']
                resp = await client.get(sel_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                links = []
                for a in soup.select('a[href*="getdownload.php"]'):
                    quality = a.text.strip() or "Standard"
                    raw_url = f"{self.fz_base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                    links.append({
                        "quality": f"Mirror: {quality}",
                        "resolution": "HD" if "High" in quality else "720p",
                        "format": "MP4",
                        "size": "Fast",
                        "url": raw_url
                    })
                return links
            except: return []

    async def resolve_raw_url(self, final_fz_url: str):
        """Recursively follows FzMovies redirects to find the ACTUAL .mp4 or .mkv file URL."""
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            try:
                resp = await client.get(final_fz_url)
                # Look for the final redirect or a link ending in .mp4/.mkv
                match = re.search(r'href=["\'](http[^"\']+\.(?:mp4|mkv|mov)[^"\']*)["\']', resp.text, re.I)
                if match: return match.group(1)
                return final_fz_url # Fallback to original
            except: return final_fz_url

    async def get_yt_links(self, title: str):
        try:
            with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': True}) as ydl:
                loop = asyncio.get_event_loop()
                res = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch2:{title} Full Movie", download=False))
                return [{"quality": f"Source: {e.get('title')[:25]}...", "resolution": "HD", "format": "STREAM", "size": "Direct", "url": e.get('url')} for e in res.get('entries', []) if e]
        except: return []

engine = AdvancedVideoEngine()

# Global state for background downloads
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

def get_duration_str(item):
    duration = get_val(item, 'duration')
    try: return f"{int(duration) // 60}m"
    except: return "Series"

# Initialize Firebase
try:
    firebase_admin.initialize_app()
    db_admin = firestore.client()
except:
    db_admin = None

# CORS
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DOWNLOAD_DIR = "/tmp/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# =========================
# ENDPOINTS
# =========================

@app.get("/api/stream")
async def stream_video(url: str, request: Request, referer: Optional[str] = None):
    """Bypasses 429 errors by redirecting to the direct video source when possible."""
    if "youtube.com" in url or "youtu.be" in url:
        # For YouTube, we MUST use yt-dlp to get the direct stream URL
        try:
            with yt_dlp.YoutubeDL({'format': 'best', 'quiet': True}) as ydl:
                info = ydl.extract_info(url, download=False)
                direct_url = info.get('url')
                if direct_url: return RedirectResponse(url=direct_url)
        except: pass
    
    # For FzMovies mirrors, find the raw file and redirect
    if "fzmovies.net" in url:
        raw_url = await engine.resolve_raw_url(url)
        return RedirectResponse(url=raw_url)

    # Absolute Fallback: Proxy (only for small/unsupported links)
    return RedirectResponse(url=url)

@app.post("/api/movies/download/start")
async def start_movie_download(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    url, title, task_id = data.get('url'), data.get('title', 'media'), str(uuid.uuid4())
    download_tasks[task_id] = {"progress": 0, "status": "preparing", "filename": f"{title}.mp4", "path": None}
    
    async def run_dl():
        try:
            # Resolve the raw video file first
            raw_url = url
            if "fzmovies.net" in url: raw_url = await engine.resolve_raw_url(url)
            elif "youtube.com" in url:
                with yt_dlp.YoutubeDL({'format': 'best', 'quiet': True}) as ydl:
                    info = ydl.extract_info(url, download=False)
                    raw_url = info.get('url')

            file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.mp4")
            download_tasks[task_id]["status"] = "downloading"
            
            async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
                async with client.stream("GET", raw_url, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    total = int(resp.headers.get("Content-Length", 0))
                    if total < 1000000: # Less than 1MB is likely a placeholder/error page
                         raise Exception("Mirror returned invalid file. Try another mirror.")
                    
                    dl_size = 0
                    with open(file_path, "wb") as f:
                        async for chunk in resp.aiter_bytes():
                            f.write(chunk)
                            dl_size += len(chunk)
                            if total > 0: download_tasks[task_id]["progress"] = round((dl_size/total)*100, 1)
            
            download_tasks[task_id]["status"], download_tasks[task_id]["path"], download_tasks[task_id]["completed_at"] = "completed", file_path, time.time()
        except Exception as e: 
            download_tasks[task_id]["status"], download_tasks[task_id]["error"] = "error", str(e)
            
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
                "thumbnail": get_val(get_val(item, 'cover'), 'url', ''), "year": get_val(item, 'releaseDate', 'N/A').split('-')[0],
                "rating": get_val(item, 'imdbRatingValue', 'N/A'), "mediaType": media_type, "platform": "MovieBox"
            })
        return {"success": True, "data": formatted}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        fz_links = await engine.get_fz_mirrors(title or "")
        yt_links = await engine.get_yt_links(title or "")
        final = fz_links + yt_links
        if final:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": final, "mediaType": media_type, "platform": "StreamAura Engine"}}
        raise Exception("Title not found on mirrors.")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

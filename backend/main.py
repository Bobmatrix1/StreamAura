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

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="StreamAura API")

# =========================
# STEALTH MIRROR ENGINE (YTS + FilePursuit)
# =========================
class StealthMirrorEngine:
    def __init__(self):
        self.yts_api = "https://yts.mx/api/v2/list_movies.json"
        self.filepursuit_api = "https://filepursuit.com/api/v1/search"
        self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    async def get_yts_links(self, title: str):
        """High-quality Torrent links (Best for full movies)."""
        print(f"--- Stealth: Querying YTS for '{title}' ---")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.yts_api}?query_term={urllib.parse.quote(title)}&sort_by=seeds")
                data = resp.json()
                if data.get('status') == 'ok' and data.get('data', {}).get('movie_count', 0) > 0:
                    movie = data['data']['movies'][0]
                    return [{
                        "quality": f"HD {t.get('quality')} - Full Movie",
                        "resolution": t.get('quality'),
                        "format": "MAGNET", "size": t.get('size'),
                        "url": f"magnet:?xt=urn:btih:{t.get('hash')}&dn={urllib.parse.quote(movie.get('title'))}"
                    } for t in movie.get('torrents', [])]
        except: return []
        return []

    async def get_direct_mirrors(self, title: str):
        """Scrapes specialized mirror sites for direct MP4 links."""
        print(f"--- Stealth: Crawling mirrors for '{title}' ---")
        # Try a known high-speed aggregator
        links = []
        try:
            # We use a broad search strategy for direct MP4 files
            async with httpx.AsyncClient(headers={"User-Agent": self.ua}, timeout=10.0) as client:
                # Search across multiple public index pages (Dummy example, replacing with YTS/YT for now)
                pass
        except: pass
        return links

stealth_engine = StealthMirrorEngine()

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

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

@app.get("/api/stream")
async def stream_video(url: str, request: Request):
    return RedirectResponse(url=url)

@app.post("/api/movies/download/start")
async def start_movie_download(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    url, title, task_id = data.get('url'), data.get('title', 'media'), str(uuid.uuid4())
    if "magnet:" in url: return JSONResponse(status_code=400, content={"success": False, "error": "Use Watch for Torrents"})
    
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
                "thumbnail": get_cover_url(item), "year": str(get_val(item, 'releaseDate', 'N/A')).split('-')[0],
                "rating": get_val(item, 'imdbRatingValue', 'N/A'), "mediaType": media_type, "platform": "MovieBox"
            })
        return {"success": True, "data": formatted}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        # Search YTS and YouTube Fallback (YouTube is safer than Google Search)
        yts_links = await stealth_engine.get_yts_links(title or "")
        
        yt_links = []
        if not yts_links:
            try:
                with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': True}) as ydl:
                    res = await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.extract_info(f"ytsearch2:{title} full movie", download=False))
                    yt_links = [{"quality": f"Mirror: {e.get('title')[:30]}", "resolution": "HD", "format": "STREAM", "size": "Direct", "url": e.get('url')} for e in res.get('entries', []) if e]
            except: pass

        final = yts_links + yt_links
        if final:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": final, "mediaType": media_type, "platform": "Stealth Engine"}}
        
        raise Exception(f"No mirrors found for '{title}'.")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

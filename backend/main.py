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
from fzmovies_api import Search as FzSearch, Download as FzDownload

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="StreamAura API")

# Initialize Firebase Admin
try:
    service_account_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
    if os.path.exists(service_account_path):
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()
    db_admin = firestore.client()
except:
    db_admin = None

# CORS
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DOWNLOAD_DIR = "/tmp/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Middlewares
@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

class ExtractRequest(BaseModel):
    url: str

download_tasks = {}

# =========================
# HELPERS
# =========================
def format_size(size_bytes):
    if not size_bytes: return "Unknown"
    try:
        size_bytes = float(size_bytes)
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024: return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"
    except: return "Unknown"

# =========================
# ENDPOINTS
# =========================

@app.get("/api/stream")
async def stream_video(url: str, request: Request, referer: Optional[str] = None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Referer": referer or "https://fzmovies.net/",
        "Accept": "*/*"
    }
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
    url, title = data.get('url'), data.get('title', 'media')
    task_id = str(uuid.uuid4())
    download_tasks[task_id] = {"progress": 0, "status": "preparing", "filename": f"{title}.mp4", "path": None}
    
    async def run_dl():
        try:
            file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.mp4")
            download_tasks[task_id]["status"] = "downloading"
            headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://fzmovies.net/"}
            async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
                async with client.stream("GET", url, headers=headers) as resp:
                    if resp.status_code >= 400: raise Exception(f"HTTP {resp.status_code}")
                    total = int(resp.headers.get("Content-Length", 0))
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
    if task_id not in download_tasks: return {"success": False, "error": "Not found"}
    return {"success": True, "data": download_tasks[task_id]}

@app.get("/api/movies/download/file/{task_id}")
async def get_movie_file(task_id: str, background_tasks: BackgroundTasks):
    task = download_tasks.get(task_id)
    if not task or task["status"] != "completed": raise HTTPException(status_code=400)
    background_tasks.add_task(lambda: os.remove(task["path"]) if os.path.exists(task["path"]) else None)
    return FileResponse(path=task["path"], filename=task["filename"])

@app.get("/api/movies/search")
async def search_movies(query: str, media_type: str = Query("movie", alias="type")):
    try:
        # Map frontend 'movie'/'series' to FzMovies categories if possible
        # Library usually handles general search
        search_engine = FzSearch(query=query)
        results = search_engine.results
        
        formatted = []
        for res in results:
            # Use URL as ID for FzMovies since it's unique
            formatted.append({
                "id": urllib.parse.quote_plus(res.url),
                "title": res.title,
                "thumbnail": "", # FzMovies search doesn't always provide thumbnails
                "year": "N/A",
                "rating": "N/A",
                "mediaType": "movie", # FzMovies is mostly movies
                "platform": "FzMovies"
            })
        return {"success": True, "data": formatted}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        movie_url = urllib.parse.unquote_plus(subject_id)
        downloader = FzDownload(url=movie_url)
        metadata = downloader.metadata
        
        # Extract quality links from the library's metadata structure
        # The library maps download links to its internal model
        final_qualities = []
        
        # Try to find download links in metadata
        # Based on fzmovies-api structure
        if hasattr(metadata, 'links') and metadata.links:
            for link in metadata.links:
                final_qualities.append({
                    "quality": getattr(link, 'quality', 'HD'),
                    "resolution": getattr(link, 'quality', '720p'),
                    "format": "MP4",
                    "size": "Fast",
                    "url": getattr(link, 'url', '')
                })
        
        # Fallback if links list is empty but main url exists
        if not final_qualities and hasattr(metadata, 'url'):
            final_qualities.append({
                "quality": "Direct Link",
                "resolution": "HD",
                "format": "MP4",
                "size": "Fast",
                "url": metadata.url
            })

        return {
            "success": True,
            "data": {
                "id": subject_id,
                "title": getattr(metadata, 'title', title or "Media"),
                "thumbnail": getattr(metadata, 'cover', ""),
                "description": getattr(metadata, 'description', ""),
                "qualities": final_qualities,
                "mediaType": "movie",
                "platform": "FzMovies",
                "referer": "https://fzmovies.net/"
            }
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": f"FzMovies Error: {str(e)}"})

# Other app logic...
@app.get("/")
async def root(): return {"status": "online"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

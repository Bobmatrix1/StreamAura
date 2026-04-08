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

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="StreamAura API")

# =========================
# GOOGLE SNIPER META-ENGINE
# =========================
class GoogleSniperEngine:
    def __init__(self):
        self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    async def get_google_links(self, title: str):
        """Searches the open web for direct MP4/MKV download links."""
        print(f"--- Sniper: Launching Meta-Search for '{title}' ---")
        
        # Power Queries
        queries = [
            f'"{title}" index of mp4',
            f'"{title}" direct download link mp4',
            f'"{title}" fzmovies download'
        ]
        
        found_links = []
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            for q in queries:
                try:
                    # 1. Search Google
                    search_url = f"https://www.google.com/search?q={urllib.parse.quote(q)}"
                    resp = await client.get(search_url)
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    
                    # 2. Extract results
                    for link in soup.select('div.g a'):
                        url = link.get('href', '')
                        if not url.startswith('http') or "google.com" in url: continue
                        
                        # 3. Simple crawl of result page to find .mp4 files
                        try:
                            page_resp = await client.get(url, timeout=5.0)
                            # Look for raw video extensions
                            raw_links = re.findall(r'href=["\'](http[^"\']+\.(?:mp4|mkv|mov|avi)[^"\']*)["\']', page_resp.text, re.I)
                            for raw in raw_links:
                                if title.split()[0].lower() in raw.lower():
                                    found_links.append({
                                        "quality": f"Web Mirror: {urllib.parse.urlparse(raw).netloc}",
                                        "resolution": "HD",
                                        "format": "MP4",
                                        "size": "Direct",
                                        "url": raw
                                    })
                        except: continue
                        if len(found_links) >= 8: break
                except: continue
                if found_links: break
        
        return found_links

    async def get_fz_meta(self, title: str):
        """Still uses FzMovies for the search results/metadata."""
        base = "https://fzmovies.net"
        try:
            async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=10.0) as client:
                search_url = f"{base}/search.php?searchname={urllib.parse.quote(title)}&Search=Search"
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                results = []
                for a in soup.find_all('a', href=True):
                    if 'movie-' in a['href']:
                        results.append({
                            "id": urllib.parse.quote_plus(f"{base}/{a['href']}"),
                            "title": a.text.strip(),
                            "thumbnail": "",
                            "year": "N/A",
                            "mediaType": "movie",
                            "platform": "FzMovies"
                        })
                return results
        except: return []

sniper = GoogleSniperEngine()

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

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): 
    return {"country": "Unknown", "device": "Desktop"}

@app.get("/api/stream")
async def stream_video(url: str, request: Request):
    return RedirectResponse(url=url)

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
        results = await sniper.get_fz_meta(query)
        return {"success": True, "data": results}
    except: return JSONResponse(status_code=500, content={"success": False, "error": "Search failed"})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        # SNIPER META-SEARCH: Search the whole internet for this title
        links = await sniper.get_google_links(title or "")
        
        if links:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": links, "mediaType": media_type, "platform": "Sniper Engine"}}
        
        raise Exception(f"Sniper could not find working web mirrors for '{title}'.")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

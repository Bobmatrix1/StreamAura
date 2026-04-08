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
# UNIVERSAL SEARCH & SNIPER ENGINE
# =========================
class UniversalEngine:
    def __init__(self):
        self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        self.fz_base = "https://fzmovies.net"
        self.yts_api = "https://yts.mx/api/v2/list_movies.json"

    async def search_movies(self, query: str):
        """Searches across multiple providers to ensure results always appear."""
        print(f"--- Universal: Searching '{query}' ---")
        
        # 1. TRY YTS API (Best for posters and years)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.yts_api}?query_term={urllib.parse.quote(query)}&limit=15")
                data = resp.json()
                if data.get('status') == 'ok' and data.get('data', {}).get('movie_count', 0) > 0:
                    results = []
                    for m in data['data']['movies']:
                        results.append({
                            "id": f"yts_{m['id']}",
                            "title": m['title'],
                            "thumbnail": m.get('medium_cover_image', ''),
                            "year": str(m.get('year', 'N/A')),
                            "rating": str(m.get('rating', 'N/A')),
                            "mediaType": "movie",
                            "platform": "YTS"
                        })
                    return results
        except: pass

        # 2. FALLBACK TO FZMOVIES (SCRAPER)
        try:
            async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=10.0) as client:
                # FzMovies often uses a specific search URL
                url = f"{self.fz_base}/search.php?searchname={urllib.parse.quote(query)}&Search=Search"
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                results = []
                for a in soup.find_all('a', href=True):
                    if 'movie-' in a['href'] and len(a.text.strip()) > 2:
                        results.append({
                            "id": urllib.parse.quote_plus(f"{self.fz_base}/{a['href']}"),
                            "title": a.text.strip(),
                            "thumbnail": "",
                            "year": "N/A",
                            "mediaType": "movie",
                            "platform": "FzMovies"
                        })
                if results: return results[:15]
        except: pass

        return []

    async def get_google_mirrors(self, title: str):
        """Searches the open web for direct MP4/MKV download links."""
        print(f"--- Sniper: Crawling for '{title}' ---")
        
        queries = [
            f'"{title}" index of mp4',
            f'"{title}" direct download mp4',
            f'"{title}" direct link mkv'
        ]
        
        found_links = []
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            for q in queries:
                try:
                    search_url = f"https://www.google.com/search?q={urllib.parse.quote(q)}"
                    resp = await client.get(search_url)
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    
                    for link in soup.select('div.g a'):
                        url = link.get('href', '')
                        if not url.startswith('http') or "google.com" in url: continue
                        
                        try:
                            # Quick scan of the result page for raw links
                            page_resp = await client.get(url, timeout=5.0)
                            raw_links = re.findall(r'href=["\'](http[^"\']+\.(?:mp4|mkv|mov|avi)[^"\']*)["\']', page_resp.text, re.I)
                            for raw in raw_links:
                                # Simple relevance check
                                if title.split()[0].lower() in raw.lower():
                                    domain = urllib.parse.urlparse(raw).netloc
                                    found_links.append({
                                        "quality": f"Web Mirror: {domain}",
                                        "resolution": "HD",
                                        "format": "MP4",
                                        "size": "Direct",
                                        "url": raw
                                    })
                        except: continue
                        if len(found_links) >= 10: break
                except: continue
                if found_links: break
        
        return found_links

universal_engine = UniversalEngine()

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
        results = await universal_engine.search_movies(query)
        return {"success": True, "data": results}
    except: return JSONResponse(status_code=500, content={"success": False, "error": "Search engine error"})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        # SNIPER: Search the open web for direct mirrors
        links = await universal_engine.get_google_mirrors(title or "")
        
        if links:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": links, "mediaType": media_type, "platform": "Universal Engine"}}
        
        raise Exception(f"No direct web mirrors found for '{title}'.")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

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
import httpx
from bs4 import BeautifulSoup
from moviebox_api.v1.core import Search as MovieSearch, Session as MovieSession, SubjectType

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="StreamAura API")

# =========================
# DEEP REDIRECT SNIPER ENGINE
# =========================
class DeepRedirectSniper:
    def __init__(self):
        self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        self.sources = [
            {"name": "Net9ja", "base": "https://www.net9ja.com.ng", "search": "/?s="},
            {"name": "NaijaPrey", "base": "https://www.naijaprey.tv", "search": "/?s="},
            {"name": "MyNetNaija", "base": "https://mynetnaija.ng", "search": "/?s="},
            {"name": "NollySauce", "base": "https://nollysauce.com.ng", "search": "/?s="}
        ]

    async def resolve_final_video_url(self, url: str, client: httpx.AsyncClient):
        """Recursively follows redirects and peeks at headers to find the REAL video file."""
        try:
            # Step 1: Head request to check if it's already a video
            resp = await client.head(url, follow_redirects=True, timeout=5.0)
            ctype = resp.headers.get("Content-Type", "").lower()
            size = int(resp.headers.get("Content-Length", 0))
            
            if "video" in ctype or size > 10000000: # Found it!
                return url, size
            
            # Step 2: If it's a page, look for a 'Download' button inside it
            resp = await client.get(url, timeout=8.0)
            soup = BeautifulSoup(resp.text, 'html.parser')
            # Look for common 'Final Download' button patterns
            final_btn = soup.select_one('a[href*="download"], a.btn-success, a.download-link')
            if final_btn and final_btn['href'] != url:
                return await self.resolve_final_video_url(final_btn['href'], client)
                
            return None, 0
        except: return None, 0

    async def scrape_source(self, source, title: str):
        print(f"--- Sniper: Deep Crawling {source['name']} for '{title}' ---")
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            try:
                search_url = f"{source['base']}{source['search']}{urllib.parse.quote(title)}"
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                mirrors = []
                # Look for movie page links
                for a in soup.find_all('a', href=True):
                    if title.lower()[:4] in a.text.lower() and source['base'] in a['href']:
                        # visit the movie page
                        try:
                            page_resp = await client.get(a['href'])
                            page_soup = BeautifulSoup(page_resp.text, 'html.parser')
                            # Find all potential download links
                            potentials = page_soup.select('a[href*="download"], a.btn-primary, a.btn-success')
                            for p in potentials:
                                # Deep Resolve: Follow the link to see if it's a real file
                                final_url, size = await self.resolve_final_video_url(p['href'], client)
                                if final_url:
                                    mirrors.append({
                                        "quality": f"{source['name']} ({p.text.strip()[:15]})",
                                        "resolution": "HD", "format": "MP4",
                                        "size": f"{round(size / 1024 / 1024)} MB" if size > 0 else "High Speed",
                                        "url": final_url
                                    })
                                if len(mirrors) >= 3: break
                        except: continue
                        if mirrors: break
                return mirrors
            except: return []

    async def get_all_mirrors(self, title: str):
        tasks = [self.scrape_source(src, title) for src in self.sources]
        results = await asyncio.gather(*tasks)
        return [link for sublist in results for link in sublist]

sniper = DeepRedirectSniper()

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
    download_tasks[task_id] = {"progress": 0, "status": "preparing", "filename": f"{title}.mp4", "path": None}
    
    async def run_dl():
        try:
            file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.mp4")
            download_tasks[task_id]["status"] = "downloading"
            async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
                async with client.stream("GET", url, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    total = int(resp.headers.get("Content-Length", 0))
                    # FAIL-SAFE: If it's still a tiny file, it's not the movie
                    if total < 5000000:
                        raise Exception("Mirror provided invalid file. Please choose a different mirror.")
                    
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
    except: return JSONResponse(status_code=500, content={"success": False, "error": "Search failed"})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        # Launch the Deep Redirect Sniper
        links = await sniper.get_all_mirrors(title or "")
        
        if links:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": links, "mediaType": media_type, "platform": "Deep Sniper Engine"}}
        
        raise Exception(f"No valid movie mirrors found for '{title}'.")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

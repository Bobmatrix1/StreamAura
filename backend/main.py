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
# HARDENED REDIRECT CRACKER
# =========================
class HardenedSniper:
    def __init__(self):
        self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        self.sources = [
            {"name": "NollySauce", "base": "https://nollysauce.com.ng", "search": "/?s="},
            {"name": "NaijaPrey", "base": "https://www.naijaprey.tv", "search": "/?s="},
            {"name": "Net9ja", "base": "https://www.net9ja.com.ng", "search": "/?s="},
            {"name": "MyNetNaija", "base": "https://mynetnaija.ng", "search": "/?s="}
        ]

    async def resolve_final_direct_link(self, url: str):
        """Recursively resolves redirects to find the ACTUAL .mkv or .mp4 file."""
        print(f"--- Cracker: Resolving {url[:50]}... ---")
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            try:
                # 1. Peeking at headers first
                resp = await client.head(url)
                ctype = resp.headers.get("Content-Type", "").lower()
                size = int(resp.headers.get("Content-Length", 0))
                
                # If we hit a direct video file, we're done
                if "video" in ctype or size > 50000000 or url.lower().endswith(('.mkv', '.mp4')):
                    return url, size

                # 2. If it's a page (WildShare, Sabishare, etc.), we need to scrape the 'Download' button inside it
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # Search for 'Download' buttons or direct file links in the HTML
                # This covers WildShare, Sabishare and MediaFire style pages
                patterns = [
                    'a[href*="download"]', 'a.btn-success', 'a.download-link', 
                    'a[href*=".mkv"]', 'a[href*=".mp4"]', 'button[onclick*="window.location"]'
                ]
                
                for p in patterns:
                    btn = soup.select_one(p)
                    if btn and btn.get('href') and btn['href'] != url:
                        # Recursive call to resolve the link found on the button
                        return await self.resolve_final_direct_link(btn['href'])
                
                # If no button found but URL looks like a final share link, return it
                if "wildshare.net" in url or "sabishare.com" in url:
                    return url, 0
                    
                return None, 0
            except: return None, 0

    async def scrape_source(self, source, title: str):
        print(f"--- Sniper: Searching {source['name']} for '{title}' ---")
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            try:
                # LOOSE SEARCH (to ensure we get results)
                query = title.split()[0] # Just search first word
                search_url = f"{source['base']}{source['search']}{urllib.parse.quote(query)}"
                
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                mirrors = []
                for a in soup.find_all('a', href=True):
                    # Check if at least 3 letters of the title match the link text
                    if title.lower()[:3] in a.text.lower() and source['base'] in a['href']:
                        try:
                            # Visit movie page
                            p_resp = await client.get(a['href'])
                            p_soup = BeautifulSoup(p_resp.text, 'html.parser')
                            
                            # Find all "potential" download links on the movie page
                            potentials = p_soup.select('a[href*="download"], a.btn-primary, a.btn-success')
                            for p in potentials:
                                # CRITICAL: Resolve the link to the final .mkv file
                                final_url, size = await self.resolve_final_direct_link(p['href'])
                                if final_url:
                                    mirrors.append({
                                        "quality": f"{source['name']} ({p.text.strip()[:12]})",
                                        "resolution": "HD", "format": "MKV/MP4",
                                        "size": f"{round(size / 1024 / 1024)} MB" if size > 0 else "Full Movie",
                                        "url": final_url
                                    })
                                if len(mirrors) >= 2: break
                        except: continue
                        if mirrors: break
                return mirrors
            except: return []

    async def get_all_mirrors(self, title: str):
        tasks = [self.scrape_source(src, title) for src in self.sources]
        results = await asyncio.gather(*tasks)
        return [link for sublist in results for link in sublist]

sniper = HardenedSniper()

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
    
    download_tasks[task_id] = {"progress": 0, "status": "preparing", "filename": f"{title}.mkv", "path": None}
    async def run_dl():
        try:
            file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.mkv")
            download_tasks[task_id]["status"] = "downloading"
            
            # Using custom headers to bypass protection during download
            headers = {"User-Agent": "Mozilla/5.0", "Referer": "https://wildshare.net/"}
            async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
                async with client.stream("GET", url, headers=headers) as resp:
                    total = int(resp.headers.get("Content-Length", 0))
                    # FAIL-SAFE: If it's still a tiny file, it's not the movie
                    if total > 0 and total < 5000000:
                        raise Exception("Mirror invalid. Choose another.")
                    
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
    except: return JSONResponse(status_code=500, content={"success": False, "error": "Search engine busy."})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        # Launch the Hardened Sniper
        links = await sniper.get_all_mirrors(title or "")
        
        if links:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": links, "mediaType": media_type, "platform": "StreamAura Engine"}}
        
        raise Exception(f"No valid movie mirrors found for '{title}'.")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

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
# ULTIMATE MULTI-SOURCE SNIPER
# =========================
class UltimateSniper:
    def __init__(self):
        self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        self.yts_api = "https://yts.mx/api/v2/list_movies.json"
        self.fz_base = "https://fzmovies.net"
        self.sources = [
            {"name": "Net9ja", "base": "https://www.net9ja.com.ng", "search": "/?s="},
            {"name": "NaijaPrey", "base": "https://www.naijaprey.tv", "search": "/?s="},
            {"name": "MyNetNaija", "base": "https://mynetnaija.ng", "search": "/?s="},
            {"name": "NollySauce", "base": "https://nollysauce.com.ng", "search": "/?s="}
        ]

    def normalize(self, text: str):
        return re.sub(r'[^a-z0-9]', '', text.lower())

    async def get_yts_links(self, title: str):
        """High-quality Torrent links (Best for new releases like Sonic 3)."""
        print(f"--- Sniper: Querying YTS for '{title}' ---")
        try:
            # Try variations: "Sonic the Hedgehog 3" -> "Sonic 3"
            q = title
            if "the" in title.lower():
                words = title.split()
                if len(words) > 2: q = f"{words[0]} {words[-1]}"
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.yts_api}?query_term={urllib.parse.quote(q)}&sort_by=seeds")
                data = resp.json()
                if data.get('status') == 'ok' and data.get('data', {}).get('movie_count', 0) > 0:
                    movie = data['data']['movies'][0]
                    return [{
                        "quality": f"YTS HD {t.get('quality')} (Full Movie)",
                        "resolution": t.get('quality'),
                        "format": "MAGNET", "size": t.get('size'),
                        "url": f"magnet:?xt=urn:btih:{t.get('hash')}&dn={urllib.parse.quote(movie.get('title'))}"
                    } for t in movie.get('torrents', [])]
        except: return []
        return []

    async def resolve_final_video_url(self, url: str, client: httpx.AsyncClient):
        try:
            # peek at headers using GET with stream=True (more reliable than HEAD)
            async with client.stream("GET", url, follow_redirects=True, timeout=5.0) as resp:
                ctype = resp.headers.get("Content-Type", "").lower()
                size = int(resp.headers.get("Content-Length", 0))
                if "video" in ctype or size > 15000000:
                    return url, size
            
            # If it's a page, try one level deeper
            resp = await client.get(url, timeout=8.0)
            btn = BeautifulSoup(resp.text, 'html.parser').select_one('a[href*="download"], a.btn-success, a[href*=".mp4"]')
            if btn and btn['href'] != url:
                return await self.resolve_final_video_url(btn['href'], client)
            return None, 0
        except: return None, 0

    async def scrape_naija(self, source, title: str):
        print(f"--- Sniper: Scoping {source['name']} for '{title}' ---")
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            try:
                # Try search with variations
                clean_target = self.normalize(title)
                first_word = title.split()[0]
                
                search_url = f"{source['base']}{source['search']}{urllib.parse.quote(title)}"
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                mirrors = []
                for a in soup.find_all('a', href=True):
                    if first_word.lower() in a.text.lower() and source['base'] in a['href']:
                        try:
                            p_resp = await client.get(a['href'])
                            p_soup = BeautifulSoup(p_resp.text, 'html.parser')
                            btns = p_soup.select('a[href*="download"], a.btn-primary, a.btn-success')
                            for b in btns:
                                f_url, size = await self.resolve_final_video_url(b['href'], client)
                                if f_url:
                                    mirrors.append({
                                        "quality": f"{source['name']} Mirror",
                                        "resolution": "720p", "format": "MP4",
                                        "size": f"{round(size / 1024 / 1024)} MB" if size > 0 else "High Speed",
                                        "url": f_url
                                    })
                                if len(mirrors) >= 2: break
                        except: continue
                        if mirrors: break
                return mirrors
            except: return []

    async def get_all_mirrors(self, title: str):
        # 1. Start YTS Search (Parallel)
        yts_task = self.get_yts_links(title)
        
        # 2. Start Naija Searches (Parallel)
        naija_tasks = [self.scrape_naija(src, title) for src in self.sources]
        
        results = await asyncio.gather(yts_task, *naija_tasks)
        # Flatten and return
        return [link for sublist in results for link in sublist]

sniper = UltimateSniper()

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
                    if total < 10000000: raise Exception("Invalid mirror. Try another one.")
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
        # Launch the Ultimate Multi-Source Sniper
        links = await sniper.get_all_mirrors(title or "")
        
        if links:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": links, "mediaType": media_type, "platform": "Ultimate Engine"}}
        
        raise Exception(f"No mirrors found for '{title}'. Try a shorter search.")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

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
# PRECISION MULTI-SOURCE SNIPER
# =========================
class PrecisionSniper:
    def __init__(self):
        self.ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        self.yts_api = "https://yts.mx/api/v2/list_movies.json"
        self.sources = [
            {"name": "Net9ja", "base": "https://www.net9ja.com.ng", "search": "/?s="},
            {"name": "NaijaPrey", "base": "https://www.naijaprey.tv", "search": "/?s="},
            {"name": "MyNetNaija", "base": "https://mynetnaija.ng", "search": "/?s="},
            {"name": "NollySauce", "base": "https://nollysauce.com.ng", "search": "/?s="}
        ]

    def normalize(self, text: str):
        return re.sub(r'[^a-z0-9]', '', text.lower())

    async def get_yts_links(self, title: str, year: Optional[str] = None):
        """High-quality Torrent links with year precision."""
        print(f"--- Sniper: YTS Search for '{title}' ({year or 'Any Year'}) ---")
        try:
            # Query variations: "Us 2019", "Us"
            query = f"{title} {year}" if year and len(title) < 5 else title
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.yts_api}?query_term={urllib.parse.quote(query)}&sort_by=seeds")
                data = resp.json()
                if data.get('status') == 'ok' and data.get('data', {}).get('movie_count', 0) > 0:
                    links = []
                    for movie in data['data']['movies'][:2]:
                        # Strict title match for short names
                        if len(title) <= 3 and self.normalize(title) != self.normalize(movie.get('title', '')):
                            continue
                        for t in movie.get('torrents', []):
                            links.append({
                                "quality": f"YTS {t.get('quality')} (Full Movie)",
                                "resolution": t.get('quality'),
                                "format": "MAGNET", "size": t.get('size'),
                                "url": f"magnet:?xt=urn:btih:{t.get('hash')}&dn={urllib.parse.quote(movie.get('title'))}"
                            })
                    return links
        except: return []
        return []

    async def resolve_final_video_url(self, url: str, client: httpx.AsyncClient):
        try:
            async with client.stream("GET", url, follow_redirects=True, timeout=5.0) as resp:
                ctype = resp.headers.get("Content-Type", "").lower()
                size = int(resp.headers.get("Content-Length", 0))
                if "video" in ctype or size > 15000000:
                    return url, size
            
            # One-level deep button extraction
            resp = await client.get(url, timeout=8.0)
            soup = BeautifulSoup(resp.text, 'html.parser')
            btn = soup.select_one('a[href*="download"], a.btn-success, a[href*=".mp4"]')
            if btn and btn['href'] != url:
                # If it's another page, try one more time
                f_url, f_size = await self.resolve_final_video_url(btn['href'], client)
                return f_url, f_size
            return None, 0
        except: return None, 0

    async def scrape_naija(self, source, title: str, year: Optional[str] = None):
        """Scrapes mirrors with year-aware precision search."""
        print(f"--- Sniper: {source['name']} Search for '{title}' ---")
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            try:
                # Better query: "Us 2019 movie download"
                query = f"{title} {year} movie download" if year else f"{title} movie download"
                search_url = f"{source['base']}{source['search']}{urllib.parse.quote(query)}"
                
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                mirrors = []
                title_norm = self.normalize(title)
                
                for a in soup.find_all('a', href=True):
                    link_text = a.text.lower()
                    # Check if title and year are both in the link text
                    if title_norm in self.normalize(link_text) and (not year or year in link_text):
                        if source['base'] in a['href'] or a['href'].startswith('/'):
                            target_url = f"{source['base']}{a['href']}" if a['href'].startswith('/') else a['href']
                            try:
                                p_resp = await client.get(target_url)
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

    async def get_all_mirrors(self, title: str, year: Optional[str] = None):
        # Parallel Execution
        yts_task = self.get_yts_links(title, year)
        naija_tasks = [self.scrape_naija(src, title, year) for src in self.sources]
        
        results = await asyncio.gather(yts_task, *naija_tasks)
        return [link for sublist in results for link in sublist]

sniper = PrecisionSniper()

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
                    if int(resp.headers.get("Content-Length", 0)) < 10000000: raise Exception("Mirror Invalid.")
                    dl_size = 0
                    with open(file_path, "wb") as f:
                        async for chunk in resp.aiter_bytes():
                            f.write(chunk)
                            dl_size += len(chunk)
                            total = int(resp.headers.get("Content-Length", 0))
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
        # Step 1: Recover Year from MovieBox Search (To fix short titles like 'Us')
        year = None
        try:
            session = MovieSession()
            search = await MovieSearch(session, title or subject_id, subject_type=SubjectType.MOVIES).get_content()
            for item in search.get('items', []):
                if str(get_val(item, 'subjectId')) == subject_id:
                    year = str(get_val(item, 'releaseDate', 'N/A')).split('-')[0]
                    break
        except: pass

        # Step 2: Precision Sniper with Year
        links = await sniper.get_all_mirrors(title or "", year)
        
        if links:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": links, "mediaType": media_type, "platform": "Precision Engine"}}
        
        raise Exception(f"No mirrors found for '{title}'. Try a longer search.")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

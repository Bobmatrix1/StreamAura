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
# FINAL ULTIMATE SCRAPER
# =========================
class UltimateScraper:
    def __init__(self):
        self.fz_base = "https://fzmovies.net"
        self.yts_api = "https://yts.mx/api/v2/list_movies.json"
        self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    async def get_fz_mirrors(self, title: str):
        print(f"--- Ultimate: Scoping FzMovies for '{title}' ---")
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            try:
                # 1. Search with broad query
                search_q = title.split()[0] # Just search the first word for maximum hits
                url = f"{self.fz_base}/search.php?searchname={urllib.parse.quote(search_q)}&Search=Search"
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # 2. Find BEST match in results
                movie_url = None
                best_score = 0
                target_clean = title.lower()
                
                for a in soup.find_all('a', href=True):
                    if 'movie-' in a['href']:
                        link_text = a.text.lower()
                        # Simple overlap score
                        score = len(set(target_clean.split()) & set(link_text.split()))
                        if score > best_score:
                            best_score = score
                            movie_url = f"{self.fz_base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                
                if not movie_url: return []

                # 3. Fetch mirrors
                resp = await client.get(movie_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                dl_link = soup.select_one('a[href*="download.php"]')
                if not dl_link: return []
                
                resp = await client.get(f"{self.fz_base}/{dl_link['href']}" if not dl_link['href'].startswith('http') else dl_link['href'])
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                links = []
                for a in soup.select('a[href*="getdownload.php"]'):
                    txt = a.text.strip() or "Standard"
                    links.append({
                        "quality": f"Fz Mirror: {txt}",
                        "resolution": "720p", "format": "MP4", "size": "Fast",
                        "url": f"{self.fz_base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                    })
                return links
            except: return []

    async def get_yts_links(self, title: str):
        print(f"--- Ultimate: Scoping YTS for '{title}' ---")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.yts_api}?query_term={urllib.parse.quote(title)}&sort_by=seeds")
                data = resp.json()
                if data.get('status') == 'ok' and data.get('data', {}).get('movie_count', 0) > 0:
                    links = []
                    for m in data['data']['movies'][:3]:
                        for t in m.get('torrents', []):
                            links.append({
                                "quality": f"YTS {t.get('quality')} Full Movie",
                                "resolution": t.get('quality'),
                                "format": "MAGNET", "size": t.get('size'),
                                "url": f"magnet:?xt=urn:btih:{t.get('hash')}&dn={urllib.parse.quote(m.get('title'))}"
                            })
                    return links
        except: pass
        return []

    async def resolve_raw(self, url: str):
        async with httpx.AsyncClient(headers={"User-Agent": self.ua}, follow_redirects=True, timeout=15.0) as client:
            try:
                resp = await client.get(url)
                match = re.search(r'href=["\'](http[^"\']+\.(?:mp4|mkv|mov)[^"\']*)["\']', resp.text, re.I)
                return match.group(1) if match else url
            except: return url

scraper_engine = UltimateScraper()

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

@app.get("/api/stream")
async def stream_video(url: str, request: Request):
    if "magnet:" in url: return JSONResponse(status_code=400, content={"success": False, "error": "Magnets not streamable."})
    if "fzmovies.net" in url: url = await scraper_engine.resolve_raw(url)
    return RedirectResponse(url=url)

@app.post("/api/movies/download/start")
async def start_movie_download(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    url, title, task_id = data.get('url'), data.get('title', 'media'), str(uuid.uuid4())
    if "magnet:" in url: return JSONResponse(status_code=400, content={"success": False, "error": "Magnets not supported."})
    
    download_tasks[task_id] = {"progress": 0, "status": "preparing", "filename": f"{title}.mp4", "path": None}
    async def run_dl():
        try:
            raw_url = url
            if "fzmovies.net" in url: raw_url = await scraper_engine.resolve_raw(url)
            file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.mp4")
            download_tasks[task_id]["status"] = "downloading"
            async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
                async with client.stream("GET", raw_url, headers={"User-Agent": "Mozilla/5.0"}) as resp:
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
    except: return JSONResponse(status_code=500, content={"success": False, "error": "Search failed"})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        fz_task = scraper_engine.get_fz_mirrors(title or "")
        yts_task = scraper_engine.get_yts_links(title or "")
        fz_links, yts_links = await asyncio.gather(fz_task, yts_task)
        final = fz_links + yts_links
        if final: return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": final, "mediaType": media_type, "platform": "StreamAura Engine"}}
        raise Exception(f"Mirrors not found for '{title}'.")
    except Exception as e: return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

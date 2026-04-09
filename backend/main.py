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
from moviebox_api.v1 import MovieDetails, DownloadableMovieFilesDetail

# Load environment
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="StreamAura API")

# Stealth Headers for all provider calls
STEALTH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "X-Requested-With": "com.moviebox.h5"
}

# =========================
# SUPER SNIPER ENGINE
# =========================
class SuperSniper:
    def __init__(self):
        self.yts_api = "https://yts.mx/api/v2/list_movies.json"
        self.naija_sources = [
            {"name": "NollySauce", "base": "https://nollysauce.com.ng"},
            {"name": "NaijaPrey", "base": "https://www.naijaprey.tv"},
            {"name": "Net9ja", "base": "https://www.net9ja.com.ng"}
        ]

    async def resolve_direct_file(self, url: str):
        """Follows redirects to find the final video file URL."""
        async with httpx.AsyncClient(headers=STEALTH_HEADERS, follow_redirects=True, timeout=15.0) as client:
            try:
                # 1. Try HEAD request to see if it's already a file
                resp = await client.head(url)
                if "video" in resp.headers.get("Content-Type", "") or url.lower().endswith(('.mkv', '.mp4')):
                    return url, int(resp.headers.get("Content-Length", 0))
                
                # 2. Scrape page for download button
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                btn = soup.select_one('a[href*="wildshare"], a[href*="sabishare"], a[href*="download"], a.btn-success')
                if btn and btn['href'] != url:
                    return btn['href'], 0
                return url, 0
            except: return url, 0

    async def scrape_naija(self, source, title: str):
        print(f"--- Sniper: Scoping {source['name']} for '{title}' ---")
        async with httpx.AsyncClient(headers=STEALTH_HEADERS, follow_redirects=True, timeout=12.0) as client:
            try:
                # Search
                search_url = f"{source['base']}/?s={urllib.parse.quote(title)}"
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # Find first match
                for a in soup.find_all('a', href=True):
                    if title.lower()[:4] in a.text.lower() and source['base'] in a['href']:
                        # Visit movie page
                        p_resp = await client.get(a['href'])
                        p_soup = BeautifulSoup(p_resp.text, 'html.parser')
                        # Find download buttons
                        btns = p_soup.select('a[href*="download"], a.btn-primary, a.btn-success')
                        links = []
                        for b in btns[:2]:
                            final_url, _ = await self.resolve_direct_file(b['href'])
                            links.append({
                                "quality": f"{source['name']} ({b.text.strip()[:10]})",
                                "resolution": "HD", "format": "MP4/MKV", "size": "Fast",
                                "url": final_url
                            })
                        return links
            except: pass
        return []

    async def get_yts_links(self, title: str):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.yts_api}?query_term={urllib.parse.quote(title)}")
                data = resp.json()
                if data.get('status') == 'ok' and data.get('data', {}).get('movie_count', 0) > 0:
                    return [{
                        "quality": f"YTS HD {t['quality']}",
                        "resolution": t['quality'], "format": "MAGNET", "size": t['size'],
                        "url": f"magnet:?xt=urn:btih:{t['hash']}&dn={urllib.parse.quote(title)}"
                    } for t in data['data']['movies'][0].get('torrents', [])]
        except: pass
        return []

sniper_engine = SuperSniper()

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

# Helpers
def get_val(obj, key, default=None):
    if obj is None: return default
    return obj.get(key, default) if isinstance(obj, dict) else getattr(obj, key, default)

def get_cover_url(item):
    cover = get_val(item, 'cover')
    return get_val(cover, 'url', '') if isinstance(cover, dict) else getattr(cover, 'url', '') if hasattr(cover, 'url') else ""

def get_duration_str(item):
    duration = get_val(item, 'duration')
    try: return f"{int(duration) // 60}m"
    except: return "Series"

# =========================
# ENDPOINTS
# =========================

@app.get("/api/analytics/country")
async def get_visitor_country(): return {"country": "Unknown", "device": "Mobile"}

@app.get("/api/stream")
async def stream_video(url: str): return RedirectResponse(url=url)

@app.post("/api/movies/download/start")
async def start_movie_download(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    url, title, task_id = data.get('url'), data.get('title', 'media'), str(uuid.uuid4())
    download_tasks = {} # Local tracker
    async def run_dl():
        try:
            file_path = os.path.join(DOWNLOAD_DIR, f"{task_id}.mp4")
            async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
                async with client.stream("GET", url, headers={"User-Agent": "Mozilla/5.0"}) as resp:
                    with open(file_path, "wb") as f:
                        async for chunk in resp.aiter_bytes(): f.write(chunk)
        except: pass
    background_tasks.add_task(run_dl)
    return {"success": True, "data": {"task_id": task_id}}

@app.get("/api/movies/search")
async def search_movies(query: str, media_type: str = Query("movie", alias="type")):
    try:
        session = MovieSession()
        if hasattr(session, '_client'): session._client.headers.update(STEALTH_HEADERS)
        search = await MovieSearch(session, query, subject_type=SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES).get_content()
        formatted = []
        for item in search.get('items', []):
            formatted.append({
                "id": str(get_val(item, 'subjectId')), "title": get_val(item, 'title'),
                "thumbnail": get_cover_url(item), "year": str(get_val(item, 'releaseDate', 'N/A')).split('-')[0],
                "rating": get_val(item, 'imdbRatingValue', 'N/A'), "mediaType": media_type, "platform": "MovieBox"
            })
        return {"success": True, "data": formatted}
    except: return JSONResponse(status_code=500, content={"success": False, "error": "Search engine error"})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        print(f"--- Global Sniper Launch: '{title}' ---")
        
        # 1. Search all mirrors in parallel
        tasks = [sniper_engine.get_yts_links(title or "")]
        for src in sniper_engine.naija_sources:
            tasks.append(sniper_engine.scrape_naija(src, title or ""))
        
        results = await asyncio.gather(*tasks)
        final_links = [link for sublist in results for link in sublist]

        # 2. Fallback to MovieBox (Only as metadata backup)
        if final_links:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": final_links, "mediaType": media_type, "platform": "Super Sniper Engine"}}
        
        raise Exception("No mirrors found. Try a different title.")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

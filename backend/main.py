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

# Load environment
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="StreamAura API")

# Stealth Headers for all provider calls
STEALTH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "X-Requested-With": "com.moviebox.h5"
}

# =========================
# SCRAPER ENGINE
# =========================
class SniperEngine:
    def __init__(self):
        self.fz_base = "https://fzmovies.net"
        self.yts_api = "https://yts.mx/api/v2/list_movies.json"

    async def get_fz_links(self, title: str):
        async with httpx.AsyncClient(headers=STEALTH_HEADERS, follow_redirects=True, timeout=12.0) as client:
            try:
                search_url = f"{self.fz_base}/search.php?searchname={urllib.parse.quote(title.split()[0])}"
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                for a in soup.find_all('a', href=True):
                    if 'movie-' in a['href'] and title.lower()[:3] in a.text.lower():
                        m_url = f"{self.fz_base}/{a['href']}" if not a['href'].startswith('http') else a['href']
                        m_resp = await client.get(m_url)
                        dl_link = BeautifulSoup(m_resp.text, 'html.parser').select_one('a[href*="download.php"]')
                        if dl_link:
                            sel_url = f"{self.fz_base}/{dl_link['href']}" if not dl_link['href'].startswith('http') else dl_link['href']
                            sel_resp = await client.get(sel_url)
                            return [{
                                "quality": f"Mirror: {b.text.strip() or 'Direct'}",
                                "resolution": "720p", "format": "MP4", "size": "Fast",
                                "url": f"{self.fz_base}/{b['href']}" if not b['href'].startswith('http') else b['href']
                            } for b in BeautifulSoup(sel_resp.text, 'html.parser').select('a[href*="getdownload.php"]')]
            except: pass
        return []

    async def get_yts_links(self, title: str):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.yts_api}?query_term={urllib.parse.quote(title)}")
                data = resp.json()
                if data.get('status') == 'ok' and data.get('data', {}).get('movie_count', 0) > 0:
                    return [{
                        "quality": f"HD Torrent - {t['quality']}",
                        "resolution": t['quality'], "format": "MAGNET", "size": t['size'],
                        "url": f"magnet:?xt=urn:btih:{t['hash']}&dn={urllib.parse.quote(title)}"
                    } for t in data['data']['movies'][0].get('torrents', [])]
        except: pass
        return []

sniper = SniperEngine()

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
    download_tasks = {} # Internal tracking
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
        # Patch session with stealth headers
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
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        # Search mirrors in parallel
        yts_links = await sniper.get_yts_links(title or "")
        fz_links = await sniper.get_fz_links(title or "")
        final = yts_links + fz_links
        
        if final:
            return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": final, "mediaType": media_type, "platform": "StreamAura Engine"}}
        
        raise Exception("No mirrors found")
    except Exception as e:
        return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

@app.get("/")
async def root(): return {"status": "online"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

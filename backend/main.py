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

# Stealth Headers
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
        async with httpx.AsyncClient(headers=STEALTH_HEADERS, follow_redirects=True, timeout=15.0) as client:
            try:
                resp = await client.head(url)
                if "video" in resp.headers.get("Content-Type", "") or url.lower().endswith(('.mkv', '.mp4')):
                    return url, int(resp.headers.get("Content-Length", 0))
                resp = await client.get(url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                btn = soup.select_one('a[href*="wildshare"], a[href*="sabishare"], a[href*="download"], a.btn-success')
                if btn and btn['href'] != url: return btn['href'], 0
                return url, 0
            except: return url, 0

    async def scrape_naija(self, source, title: str):
        async with httpx.AsyncClient(headers=STEALTH_HEADERS, follow_redirects=True, timeout=12.0) as client:
            try:
                search_url = f"{source['base']}/?s={urllib.parse.quote(title)}"
                resp = await client.get(search_url)
                soup = BeautifulSoup(resp.text, 'html.parser')
                for a in soup.find_all('a', href=True):
                    if title.lower()[:4] in a.text.lower() and source['base'] in a['href']:
                        p_resp = await client.get(a['href'])
                        p_soup = BeautifulSoup(p_resp.text, 'html.parser')
                        btns = p_soup.select('a[href*="download"], a.btn-primary, a.btn-success')
                        links = []
                        for b in btns[:2]:
                            final_url, _ = await self.resolve_direct_file(b['href'])
                            links.append({"quality": f"{source['name']} Mirror", "resolution": "HD", "format": "MP4", "size": "Fast", "url": final_url})
                        return links
            except: pass
        return []

    async def get_yts_links(self, title: str):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.yts_api}?query_term={urllib.parse.quote(title)}")
                data = resp.json()
                if data.get('status') == 'ok' and data.get('data', {}).get('movie_count', 0) > 0:
                    return [{"quality": f"YTS HD {t['quality']}", "resolution": t['quality'], "format": "MAGNET", "size": t['size'], "url": f"magnet:?xt=urn:btih:{t['hash']}&dn={urllib.parse.quote(title)}"} for t in data['data']['movies'][0].get('torrents', [])]
        except: pass
        return []

sniper_engine = SuperSniper()

# Initialize Firebase Admin
try:
    # 1. Check for manual Env Vars first (Render)
    if os.getenv("FIREBASE_PRIVATE_KEY"):
        firebase_creds = {
            "type": "service_account",
            "project_id": os.getenv("FIREBASE_PROJECT_ID"),
            "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID"),
            "private_key": os.getenv("FIREBASE_PRIVATE_KEY", "").replace('\\n', '\n'),
            "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
            "client_id": os.getenv("FIREBASE_CLIENT_ID"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": os.getenv("FIREBASE_CLIENT_X509_CERT_URL")
        }
        cred = credentials.Certificate(firebase_creds)
        firebase_admin.initialize_app(cred)
        print("--- Firebase Admin: Manual Env Initialized ---")
    
    # 2. Fallback to Local File
    elif os.path.exists("serviceAccountKey.json"):
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
        print("--- Firebase Admin: Local File Initialized ---")
    
    # 3. Last Resort: Default (Will likely fail on Render)
    else:
        firebase_admin.initialize_app()
        print("--- Firebase Admin: Default Credentials Initialized ---")

    db_admin = firestore.client()
except Exception as e:
    print(f"--- Firebase Admin Init Error: {e} ---")
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

@app.get("/")
@app.head("/")
async def root(): return {"status": "online", "service": "StreamAura"}

@app.get("/api/analytics/country")
async def get_visitor_country(): return {"country": "Unknown", "device": "Mobile"}

@app.post("/api/admin/broadcast")
async def broadcast_notification(request: Request):
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase not initialized"})
    try:
        data = await request.json()
        title, message = data.get('title'), data.get('message')
        users_docs = db_admin.collection('users').stream()
        user_ids = [doc.id for doc in users_docs]
        for i in range(0, len(user_ids), 500):
            batch = db_admin.batch()
            for uid in user_ids[i:i + 500]:
                batch.set(db_admin.collection('users').document(uid).collection('notifications').document(), {"title": title, "message": message, "timestamp": firestore.SERVER_TIMESTAMP, "read": False, "type": "update"})
            batch.commit()
        return {"success": True, "data": {"delivered_to": len(user_ids)}}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/search")
async def search_movies(query: str, media_type: str = Query("movie", alias="type")):
    try:
        session = MovieSession()
        if hasattr(session, '_client'): session._client.headers.update(STEALTH_HEADERS)
        search = await MovieSearch(session, query, subject_type=SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES).get_content()
        formatted = []
        if search and 'items' in search:
            for item in search['items']:
                rd = get_val(item, 'releaseDate')
                formatted.append({"id": str(get_val(item, 'subjectId')), "title": get_val(item, 'title'), "thumbnail": get_cover_url(item), "year": str(rd).split('-')[0] if rd else 'N/A', "rating": get_val(item, 'imdbRatingValue', 'N/A'), "mediaType": media_type, "platform": "MovieBox"})
        return {"success": True, "data": formatted}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        tasks = [sniper_engine.get_yts_links(title or "")]
        for src in sniper_engine.naija_sources: tasks.append(sniper_engine.scrape_naija(src, title or ""))
        results = await asyncio.gather(*tasks)
        final = [link for sublist in results for link in sublist]
        if final: return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": final, "mediaType": media_type, "platform": "Super Sniper Engine"}}
        raise Exception("No mirrors found.")
    except Exception as e: return JSONResponse(status_code=404, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

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

# Initialize Firebase Admin
try:
    # 1. Try initializing with serviceAccountKey.json (Local)
    service_account_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
    if os.path.exists(service_account_path):
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred)
        print("--- Firebase Admin: Local File Initialized ---")
    else:
        # 2. Try initializing with Environment Variables (Production/Render)
        try:
            firebase_admin.initialize_app()
            print("--- Firebase Admin: Default Credentials Initialized ---")
        except:
            # 3. Last resort: Manual Credential reconstruction from Env Vars
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
            if firebase_creds["project_id"] and firebase_creds["private_key"]:
                cred = credentials.Certificate(firebase_creds)
                firebase_admin.initialize_app(cred)
                print("--- Firebase Admin: Manual Env Initialized ---")
            else:
                print("--- Firebase Admin: Missing Credentials in Env ---")

    db_admin = firestore.client()
except Exception as e:
    print(f"--- Firebase Admin Critical Error: {e} ---")
    traceback.print_exc()
    db_admin = None

# CORS
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DOWNLOAD_DIR = "/tmp/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Helpers
def get_val(obj, key, default=None):
    if obj is None: return default
    if isinstance(obj, dict): return obj.get(key, default)
    return getattr(obj, key, default)

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

@app.post("/api/admin/broadcast")
async def broadcast_notification(request: Request):
    print("--- Broadcast Request Received ---")
    if not db_admin: 
        print("Error: db_admin is None")
        return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Admin not initialized"})
    
    try:
        data = await request.json()
        title, message = data.get('title'), data.get('message')
        if not title or not message: raise HTTPException(status_code=400, detail="Title and message required")
        print(f"Broadcasting: {title}")
        
        users_docs = db_admin.collection('users').stream()
        user_ids = [doc.id for doc in users_docs]
        print(f"Total users to deliver: {len(user_ids)}")
        
        for i in range(0, len(user_ids), 500):
            batch = db_admin.batch()
            for uid in user_ids[i:i + 500]:
                notif_ref = db_admin.collection('users').document(uid).collection('notifications').document()
                batch.set(notif_ref, {
                    "title": title, 
                    "message": message, 
                    "timestamp": firestore.SERVER_TIMESTAMP, 
                    "read": False, 
                    "type": "update"
                })
            batch.commit()
        
        return {"success": True, "data": {"delivered_to": len(user_ids)}}
    except Exception as e: 
        print(f"Broadcast Endpoint Error: {e}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.delete("/api/admin/notifications/clear")
async def clear_all_notifications():
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Admin not initialized"})
    try:
        users_docs = db_admin.collection('users').stream()
        cleared_count = 0
        for user_doc in users_docs:
            notifs = db_admin.collection('users').document(user_doc.id).collection('notifications').stream()
            batch = db_admin.batch()
            count = 0
            for n in notifs:
                batch.delete(n.reference)
                count += 1
                cleared_count += 1
                if count >= 400:
                    batch.commit()
                    batch = db_admin.batch()
                    count = 0
            batch.commit()
        return {"success": True, "data": {"total_cleared": cleared_count}}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/stream")
async def stream_video(url: str): return RedirectResponse(url=url)

@app.post("/api/movies/download/start")
async def start_movie_download(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    url, title, task_id = data.get('url'), data.get('title', 'media'), str(uuid.uuid4())
    download_tasks = {} # Local tracker placeholder
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
        if search and isinstance(search, dict) and 'items' in search:
            for item in search.get('items', []):
                rd = get_val(item, 'releaseDate')
                formatted.append({
                    "id": str(get_val(item, 'subjectId')), "title": get_val(item, 'title'),
                    "thumbnail": get_cover_url(item), "year": str(rd).split('-')[0] if rd else 'N/A',
                    "rating": get_val(item, 'imdbRatingValue', 'N/A'), "mediaType": media_type, "platform": "MovieBox"
                })
        return {"success": True, "data": formatted}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        print(f"--- Global Sniper Launch: '{title}' ---")
        tasks = [sniper_engine.get_yts_links(title or "")]
        for src in sniper_engine.naija_sources:
            tasks.append(sniper_engine.scrape_naija(src, title or ""))
        
        results = await asyncio.gather(*tasks)
        final_links = [link for sublist in results for link in sublist]

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

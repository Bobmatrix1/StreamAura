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
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from moviebox_api.v1.core import Search as MovieSearch, Session as MovieSession, SubjectType

# Load environment
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="StreamAura API Master")

# Stealth Headers
STEALTH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
}

# =========================
# SNIPER ENGINE
# =========================
class SuperSniper:
    def __init__(self):
        self.naija_sources = [
            {"name": "NollySauce", "base": "https://nollysauce.com.ng"},
            {"name": "NaijaPrey", "base": "https://www.naijaprey.tv"},
            {"name": "Net9ja", "base": "https://www.net9ja.com.ng"}
        ]

    async def scrape_mirrors(self, title: str):
        links = []
        async with httpx.AsyncClient(headers=STEALTH_HEADERS, follow_redirects=True, timeout=12.0) as client:
            for source in self.naija_sources:
                try:
                    search_url = f"{source['base']}/?s={urllib.parse.quote(title)}"
                    resp = await client.get(search_url)
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    for a in soup.find_all('a', href=True):
                        if title.lower()[:4] in a.text.lower():
                            p_resp = await client.get(a['href'])
                            p_soup = BeautifulSoup(p_resp.text, 'html.parser')
                            btns = p_soup.select('a[href*="download"], a.btn-success')
                            for b in btns[:2]:
                                links.append({"quality": f"{source['name']} HD", "resolution": "720p", "format": "MP4", "size": "Fast", "url": b['href']})
                            break
                except: continue
        return links

sniper = SuperSniper()

# Initialize Firebase
try:
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
    elif os.path.exists("serviceAccountKey.json"):
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()
    db_admin = firestore.client()
except:
    db_admin = None

# Initialize Spotify
sp = None
if os.getenv("SPOTIFY_CLIENT_ID"):
    try:
        sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(client_id=os.getenv("SPOTIFY_CLIENT_ID"), client_secret=os.getenv("SPOTIFY_CLIENT_SECRET")))
    except: pass

# CORS
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DOWNLOAD_DIR = "/tmp/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

class ExtractRequest(BaseModel):
    url: str

def format_size(size_bytes):
    if not size_bytes: return "Fast"
    try:
        size_bytes = float(size_bytes)
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024: return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"
    except: return "Fast"

# =========================
# ENDPOINTS
# =========================

@app.get("/")
@app.head("/")
async def root(): return {"status": "online", "service": "StreamAura"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request):
    country = request.headers.get("cf-ipcountry") or "Unknown"
    ua = request.headers.get("user-agent", "").lower()
    device = "Mobile" if any(x in ua for x in ["iphone", "android", "mobile"]) else "Desktop"
    return {"country": country, "device": device}

@app.post("/api/admin/broadcast")
async def broadcast_notification(request: Request):
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    try:
        data = await request.json()
        title, message = data.get('title'), data.get('message')
        users = db_admin.collection('users').get()
        for u in users:
            notif_ref = db_admin.collection('users').document(u.id).collection('notifications').document()
            notif_ref.set({"title": title, "message": message, "timestamp": firestore.SERVER_TIMESTAMP, "read": False, "type": "update"})
            db_admin.collection('users').document(u.id).update({"unreadCount": firestore.Increment(1)})
        return {"success": True, "data": {"delivered_to": len(users)}}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/extract")
async def extract_info(request: ExtractRequest):
    url = request.url.strip()
    search_query = url
    platform = "Video"
    if "spotify.com" in url and sp:
        try:
            track_id = url.split("track/")[1].split("?")[0]
            track = sp.track(track_id)
            search_query = f"ytsearch1:{track['artists'][0]['name']} {track['name']} official"
            platform = "Spotify"
        except: pass
    elif "audiomack.com" in url: platform = "Audiomack"

    ydl_opts = {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 'format': 'bestaudio/best'}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, lambda: ydl.extract_info(search_query, download=False))
            if 'entries' in info: info = info['entries'][0]
            formats = [{"quality": f.get("format_note") or "HQ", "format": f.get("ext", "mp4").upper(), "resolution": "Audio", "size": format_size(f.get('filesize') or f.get('filesize_approx')), "url": f.get("url")} for f in info.get("formats", []) if f.get("url")]
            return {"success": True, "data": {"id": str(info.get("id")), "url": url, "title": info.get("title", "Media"), "thumbnail": info.get("thumbnail"), "duration": f"{int(info.get('duration', 0)) // 60}m", "author": info.get("uploader", "Unknown"), "platform": platform, "mediaType": "music", "qualities": formats[:10]}}
    except Exception as e: return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.get("/api/movies/search")
async def search_movies(query: str, media_type: str = Query("movie", alias="type")):
    try:
        session = MovieSession()
        search = await MovieSearch(session, query, subject_type=SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES).get_content()
        formatted = [{"id": str(item.get('subjectId')), "title": item.get('title'), "thumbnail": item.get('cover', {}).get('url', ''), "year": str(item.get('releaseDate', 'N/A')).split('-')[0], "rating": item.get('imdbRatingValue', 'N/A'), "mediaType": media_type, "platform": "MovieBox"} for item in search.get('items', [])]
        return {"success": True, "data": formatted}
    except: return JSONResponse(status_code=500, content={"success": False, "error": "Search failed"})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None):
    try:
        mirrors = await sniper.scrape_mirrors(title or "")
        return {"success": True, "data": {"id": subject_id, "title": title or "Media", "qualities": mirrors, "mediaType": media_type, "platform": "StreamAura Sniper"}}
    except: return JSONResponse(status_code=200, content={"success": True, "data": {"id": subject_id, "title": title, "qualities": [], "mediaType": media_type, "platform": "StreamAura"}})

@app.post("/api/movies/download/start")
async def start_movie_download(request: Request):
    return {"success": True, "data": {"task_id": str(uuid.uuid4())}}

@app.get("/api/download")
async def download_media(url: str, background_tasks: BackgroundTasks, filename: str = "file.mp4"):
    temp_path = os.path.join(DOWNLOAD_DIR, f"{uuid.uuid4()}.mp4")
    ydl_opts = {'format': 'best', 'outtmpl': temp_path, 'quiet': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.download([url]))
        background_tasks.add_task(os.remove, temp_path)
        return FileResponse(path=temp_path, filename=filename)
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

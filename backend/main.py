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
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Query, Header
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
# MIRROR ENGINE
# =========================
async def try_cloud_mirror(video_id: str):
    mirrors = [
        f"https://pipedapi.kavin.rocks/streams/{video_id}",
        f"https://api.invidious.io/api/v1/videos/{video_id}",
    ]
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        for mirror_url in mirrors:
            try:
                resp = await client.get(mirror_url)
                if resp.status_code == 200:
                    data = resp.json()
                    formats = []
                    if "videoStreams" in data:
                        for s in data["videoStreams"]:
                            if not s.get("videoOnly"):
                                formats.append({"quality": s.get("quality", "HD"), "format": "MP4", "resolution": s.get("quality", "720p"), "size": "Fast", "url": s.get("url")})
                    if formats:
                        return {"id": video_id, "title": data.get("title", "YouTube Video"), "thumbnail": data.get("thumbnailUrl") or "", "duration": "Mirror", "author": data.get("uploader", "Artist"), "platform": "YouTube Mirror", "qualities": formats[:10]}
            except: continue
    return None

# =========================
# ENDPOINTS
# =========================

@app.get("/")
@app.head("/")
async def root(): return {"status": "online", "service": "StreamAura"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request):
    country = request.headers.get("cf-ipcountry") or request.headers.get("x-vercel-ip-country") or "Unknown"
    ua = request.headers.get("user-agent", "").lower()
    device = "Mobile" if any(x in ua for x in ["iphone", "android", "mobile"]) else "Desktop"
    return {"country": country, "device": device}

@app.get("/api/stream")
async def stream_media(url: str, request: Request, range: Optional[str] = Header(None)):
    """Advanced Media Proxy with Range Request support for instant playback."""
    headers = {"User-Agent": "Mozilla/5.0"}
    if range: headers["Range"] = range

    async def stream_generator():
        async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
            async with client.stream("GET", url, headers=headers) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk

    # Pre-fetch headers to get content type and size
    async with httpx.AsyncClient(follow_redirects=True) as client:
        head_resp = await client.head(url, headers=headers)
        
    response_headers = {
        "Content-Type": head_resp.headers.get("Content-Type", "video/mp4"),
        "Accept-Ranges": "bytes",
    }
    if "Content-Range" in head_resp.headers:
        response_headers["Content-Range"] = head_resp.headers["Content-Range"]
    if "Content-Length" in head_resp.headers:
        response_headers["Content-Length"] = head_resp.headers["Content-Length"]

    return StreamingResponse(
        stream_generator(), 
        status_code=head_resp.status_code,
        headers=response_headers
    )

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
    is_youtube = "youtube.com" in url or "youtu.be" in url
    
    if is_youtube:
        video_id = ""
        if "v=" in url: video_id = url.split("v=")[1].split("&")[0]
        elif "youtu.be/" in url: video_id = url.split("youtu.be/")[1].split("?")[0]
        if video_id:
            mirror_data = await try_cloud_mirror(video_id)
            if mirror_data: return {"success": True, "data": mirror_data}

    ydl_opts = {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 'user_agent': 'Mozilla/5.0'}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, lambda: ydl.extract_info(url, download=False))
            formats = [{"quality": f.get("format_note") or "HQ", "format": f.get("ext", "mp4").upper(), "resolution": f"{f.get('width','?')}x{f.get('height','?')}", "size": format_size(f.get('filesize') or f.get('filesize_approx')), "url": f.get("url")} for f in info.get("formats", []) if f.get("url")]
            return {"success": True, "data": {"id": str(info.get("id")), "url": url, "title": info.get("title", "Media"), "thumbnail": info.get("thumbnail"), "duration": f"{int(info.get('duration', 0)) // 60}m", "author": info.get("uploader", "Artist"), "platform": info.get('extractor_key', 'Video'), "mediaType": "video", "qualities": formats[:10]}}
    except Exception as e: return JSONResponse(status_code=400, content={"success": False, "error": "Extraction failed"})

@app.get("/api/download")
async def download_media(url: str, background_tasks: BackgroundTasks, filename: str = "file.mp4"):
    temp_path = os.path.join(DOWNLOAD_DIR, f"{uuid.uuid4()}.mp4")
    ydl_opts = {'format': 'best', 'outtmpl': temp_path, 'quiet': True, 'nocheckcertificate': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.download([url]))
        background_tasks.add_task(os.remove, temp_path)
        return FileResponse(path=temp_path, filename=filename)
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

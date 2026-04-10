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

# Load environment
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="StreamAura API Master")

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
except Exception as e:
    db_admin = None

# Initialize Spotify
sp = None
if os.getenv("SPOTIFY_CLIENT_ID"):
    try:
        sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
            client_id=os.getenv("SPOTIFY_CLIENT_ID"), 
            client_secret=os.getenv("SPOTIFY_CLIENT_SECRET")
        ))
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

async def resolve_mirror(url: str):
    """Internal helper to convert Spotify/Protected links to working mirrors."""
    search_query = url
    is_spotify = "spotify.com" in url
    if is_spotify and sp:
        try:
            track_id = url.split("track/")[1].split("?")[0]
            track = sp.track(track_id)
            search_query = f"scsearch1:{track['artists'][0]['name']} {track['name']} official"
        except: pass
    
    ydl_opts = {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 'format': 'bestaudio/best'}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.extract_info(search_query, download=False))
            if 'entries' in info: info = info['entries'][0]
            return info.get('url'), info
        except:
            # Fallback to direct SoundCloud search
            try:
                info = await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.extract_info(f"scsearch1:{url}", download=False))
                if 'entries' in info: info = info['entries'][0]
                return info.get('url'), info
            except: return None, None

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
async def stream_audio(url: str):
    """Proxies audio streams so the browser can play them directly."""
    if "spotify.com" in url:
        resolved_url, _ = await resolve_mirror(url)
        if resolved_url: return RedirectResponse(url=resolved_url)
    return RedirectResponse(url=url)

@app.post("/api/admin/broadcast")
async def broadcast_notification(request: Request):
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    try:
        data = await request.json()
        title, message = data.get('title'), data.get('message')
        users = db_admin.collection('users').get()
        user_ids = [u.id for u in users]
        for i in range(0, len(user_ids), 500):
            batch = db_admin.batch()
            for uid in user_ids[i:i + 500]:
                notif_ref = db_admin.collection('users').document(uid).collection('notifications').document()
                batch.set(notif_ref, {"title": title, "message": message, "timestamp": firestore.SERVER_TIMESTAMP, "read": False, "type": "update"})
                user_ref = db_admin.collection('users').document(uid)
                batch.update(user_ref, {"unreadCount": firestore.Increment(1), "lastNotificationAt": firestore.SERVER_TIMESTAMP})
            batch.commit()
        return {"success": True, "data": {"delivered_to": len(user_ids)}}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/extract")
async def extract_info(request: ExtractRequest):
    url = request.url.strip()
    url = re.sub(r'https?$', '', url)
    is_spotify = "spotify.com" in url
    
    resolved_url, info = await resolve_mirror(url)
    if not info:
        return JSONResponse(status_code=400, content={"success": False, "error": "Could not find a working mirror for this song."})

    formats = []
    for f in info.get("formats", []):
        if f.get("url"):
            formats.append({
                "quality": f.get("format_note") or "HQ",
                "format": f.get("ext", "mp3").upper(),
                "resolution": "Audio",
                "size": format_size(f.get('filesize') or f.get('filesize_approx')),
                "url": f.get("url")
            })
    
    return {
        "success": True, 
        "data": {
            "id": str(info.get("id")),
            "url": url, # Keep original URL for the frontend
            "title": info.get("title", "Song"),
            "thumbnail": info.get("thumbnail"),
            "duration": f"{int(info.get('duration', 0)) // 60}m",
            "author": info.get("uploader", "Artist"),
            "platform": "Spotify" if is_spotify else info.get("extractor_key", "Audio"),
            "mediaType": "music",
            "qualities": formats[:10]
        }
    }

@app.get("/api/download")
async def download_media(url: str, background_tasks: BackgroundTasks, filename: str = "file.mp4"):
    temp_path = os.path.join(DOWNLOAD_DIR, f"{uuid.uuid4()}.mp4")
    
    # CRITICAL: Resolve mirror before downloading if it's a Spotify link
    download_url = url
    if "spotify.com" in url:
        resolved_url, _ = await resolve_mirror(url)
        if resolved_url: download_url = resolved_url

    ydl_opts = {'format': 'best', 'outtmpl': temp_path, 'quiet': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.download([download_url]))
        background_tasks.add_task(os.remove, temp_path)
        return FileResponse(path=temp_path, filename=filename)
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

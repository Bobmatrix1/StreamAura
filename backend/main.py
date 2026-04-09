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
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "X-Requested-With": "com.moviebox.h5"
}

# Initialize Firebase Admin
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
    print(f"--- Firebase Error: {e} ---")
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

# =========================
# ENDPOINTS
# =========================

@app.get("/")
@app.head("/")
async def root(): return {"status": "online", "service": "StreamAura"}

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request):
    # Try to get country from headers (Render/Cloudflare usually provide this)
    country = request.headers.get("cf-ipcountry") or request.headers.get("x-vercel-ip-country") or "Unknown"
    ua = request.headers.get("user-agent", "").lower()
    device = "Mobile" if any(x in ua for x in ["iphone", "android", "mobile"]) else "Desktop"
    return {"country": country, "device": device}

@app.post("/api/admin/broadcast")
async def broadcast_notification(request: Request):
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    try:
        data = await request.json()
        title, message = data.get('title'), data.get('message')
        users_docs = db_admin.collection('users').stream()
        user_ids = [doc.id for doc in users_docs]
        
        for i in range(0, len(user_ids), 500):
            batch = db_admin.batch()
            for uid in user_ids[i:i + 500]:
                # 1. Add notification record
                notif_ref = db_admin.collection('users').document(uid).collection('notifications').document()
                batch.set(notif_ref, {
                    "title": title, "message": message, 
                    "timestamp": firestore.SERVER_TIMESTAMP, 
                    "read": False, "type": "update"
                })
                # 2. Update badge count and timestamp
                user_ref = db_admin.collection('users').document(uid)
                batch.update(user_ref, {
                    "unreadCount": firestore.Increment(1),
                    "lastNotificationAt": firestore.SERVER_TIMESTAMP
                })
            batch.commit()
            
        # Simplified response to fix "undefined" on frontend
        return {"success": True, "data": {"delivered_to": len(user_ids)}, "delivered_to": len(user_ids)}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/extract")
async def extract_info(request: ExtractRequest):
    url = request.url.strip()
    search_query = url
    is_spotify = "spotify.com" in url
    
    if is_spotify and sp:
        try:
            track_id = url.split("track/")[1].split("?")[0]
            track = sp.track(track_id)
            search_query = f"ytsearch1:{track['artists'][0]['name']} {track['name']} official audio"
        except: pass

    # THE ABSOLUTE BEST BOT BYPASS CONFIG
    ydl_opts = {
        'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['android'], # Android client is the least likely to get bot-blocked
                'skip': ['hls', 'dash']
            }
        },
        'user_agent': 'com.google.android.youtube/19.05.36 (Linux; U; Android 14; en_US; SM-S928B) gzip'
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            loop = asyncio.get_event_loop()
            try:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(search_query, download=False))
                if info and 'entries' in info:
                    if not info['entries']: raise Exception("No results found.")
                    info = info['entries'][0]
            except Exception as e:
                # If bot detected, try one last search fallback with different client
                if any(x in str(e).lower() for x in ["bot", "confirm", "403"]):
                    print("--- Bot Detected, trying MWEB fallback ---")
                    ydl_opts['extractor_args']['youtube']['player_client'] = ['mweb']
                    info = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch1:{url}", download=False))
                    if info and 'entries' in info and info['entries']:
                        info = info['entries'][0]
                    else: raise e
                else: raise e

            formats = []
            for f in info.get("formats", []):
                if f.get("vcodec") != "none" and f.get("url"):
                    formats.append({
                        "quality": f.get("format_note", "HD"), "format": f.get("ext", "mp4").upper(), 
                        "resolution": f"{f.get('width','?')}x{f.get('height','?')}", 
                        "size": format_size(f.get('filesize') or f.get('filesize_approx') or 0), "url": f.get("url")
                    })
            
            return {"success": True, "data": {
                "id": str(info.get("id")), "url": url, "title": info.get("title", "Media"), 
                "thumbnail": info.get("thumbnail"), "duration": f"{int(info.get('duration', 0)) // 60}m", 
                "author": info.get("uploader", "Unknown"), "platform": "Spotify Mirror" if is_spotify else info.get("extractor_key", "Video"), 
                "mediaType": "music" if is_spotify else "video", "qualities": formats[:15]
            }}
    except Exception as e: return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

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

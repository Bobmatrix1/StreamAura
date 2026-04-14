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
    """Bypasses YouTube bot checks by using a public Invidious/Piped mirror API."""
    mirrors = [
        f"https://pipedapi.kavin.rocks/streams/{video_id}",
        f"https://api.invidious.io/api/v1/videos/{video_id}",
        f"https://inv.tux.rs/api/v1/videos/{video_id}"
    ]
    
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        for mirror_url in mirrors:
            try:
                resp = await client.get(mirror_url)
                if resp.status_code == 200:
                    data = resp.json()
                    formats = []
                    # Handle Piped API format
                    if "videoStreams" in data:
                        for s in data["videoStreams"]:
                            if not s.get("videoOnly"):
                                formats.append({
                                    "quality": s.get("quality", "HD"),
                                    "format": "MP4",
                                    "resolution": s.get("quality", "720p"),
                                    "size": "Fast",
                                    "url": s.get("url")
                                })
                    # Handle Invidious API format
                    elif "formatStreams" in data:
                        for s in data["formatStreams"]:
                            formats.append({
                                "quality": s.get("qualityLabel", "HD"),
                                "format": "MP4",
                                "resolution": s.get("resolution", "720p"),
                                "size": s.get("size", "Fast"),
                                "url": s.get("url")
                            })
                    
                    if formats:
                        return {
                            "id": video_id,
                            "title": data.get("title", "YouTube Video"),
                            "thumbnail": data.get("thumbnailUrl") or (data.get("videoThumbnails")[0]["url"] if data.get("videoThumbnails") else ""),
                            "duration": "Mirror",
                            "author": data.get("uploader", "Artist"),
                            "platform": "YouTube Mirror",
                            "qualities": formats[:10]
                        }
            except: continue
    return None

# =========================
# ENDPOINTS
# =========================

@app.get("/")
@app.head("/")
async def root(): return {"status": "online", "service": "StreamAura"}

@app.post("/api/extract")
async def extract_info(request: ExtractRequest):
    url = request.url.strip()
    search_query = url
    is_youtube = "youtube.com" in url or "youtu.be" in url
    platform = "Video"
    
    if "spotify.com" in url and sp:
        try:
            track_id = url.split("track/")[1].split("?")[0]
            track = sp.track(track_id)
            search_query = f"scsearch1:{track['artists'][0]['name']} {track['name']} official"
            platform = "Spotify"
        except: pass
    elif "audiomack.com" in url:
        search_query = f"scsearch1:{url}"
        platform = "Audiomack"

    # THE BOT BYPASS CONFIG
    ydl_opts = {
        'quiet': True, 'no_warnings': True, 'nocheckcertificate': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'ios', 'mweb'],
                'skip': ['hls', 'dash']
            }
        },
        'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            loop = asyncio.get_event_loop()
            try:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(search_query, download=False))
                if info and 'entries' in info:
                    if not info['entries']: raise Exception("No matching mirrors found.")
                    info = info['entries'][0]
            except Exception as e:
                # CRITICAL FALLBACK: If YouTube blocks Render, use the Cloud Mirror Sniper
                if is_youtube or "ytsearch" in search_query:
                    print("--- Bot Detected, launching Cloud Mirror Sniper ---")
                    video_id = ""
                    if "v=" in url: video_id = url.split("v=")[1].split("&")[0]
                    elif "youtu.be/" in url: video_id = url.split("youtu.be/")[1].split("?")[0]
                    
                    if video_id:
                        mirror_data = await try_cloud_mirror(video_id)
                        if mirror_data:
                            return {"success": True, "data": mirror_data}
                raise e

            formats = [{"quality": f.get("format_note") or "HQ", "format": f.get("ext", "mp4").upper(), "resolution": "Audio" if f.get("vcodec") == "none" else f"{f.get('width','?')}x{f.get('height','?')}", "size": format_size(f.get('filesize') or f.get('filesize_approx')), "url": f.get("url")} for f in info.get("formats", []) if f.get("url")]
            
            return {
                "success": True, 
                "data": {
                    "id": str(info.get("id")),
                    "url": url,
                    "title": info.get("title", "Media"),
                    "thumbnail": info.get("thumbnail"),
                    "duration": f"{int(info.get('duration', 0)) // 60}m",
                    "author": info.get("uploader") or info.get("artist") or "Artist",
                    "platform": platform if platform != "Video" else info.get('extractor_key', 'Video'),
                    "mediaType": "music" if platform in ["Spotify", "Audiomack"] else "video",
                    "qualities": formats[:15]
                }
            }
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

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

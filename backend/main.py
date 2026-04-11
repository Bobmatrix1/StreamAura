import os
import sys
import asyncio
import time
import re
import urllib.parse
import uuid
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

async def get_metadata_stealth(url: str):
    """Deep scrapes metadata for Audiomack/Web links."""
    try:
        async with httpx.AsyncClient(headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True, timeout=10.0) as client:
            resp = await client.get(url)
            soup = BeautifulSoup(resp.text, 'html.parser')
            title = soup.find("meta", property="og:title")
            artist = soup.find("meta", property="og:description") or soup.find("meta", property="twitter:creator")
            t_str = title["content"] if title else ""
            a_str = artist["content"] if artist else "Unknown Artist"
            t_str = t_str.replace(" | Audiomack", "").strip()
            if t_str: return f"{a_str} {t_str}"
    except: pass
    return url

# =========================
# ENDPOINTS
# =========================

@app.get("/")
@app.head("/")
async def root(): return {"status": "online", "service": "StreamAura"}

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
    platform = "Music"
    
    # 1. SOUNDCLOUD MIRROR ENGINE
    if "spotify.com" in url and sp:
        try:
            track_id = url.split("track/")[1].split("?")[0]
            track = sp.track(track_id)
            # Switch to SoundCloud Search (scsearch1) for stability
            search_query = f"scsearch1:{track['artists'][0]['name']} {track['name']} official"
            platform = "Spotify"
        except: 
            search_query = f"scsearch1:{url}"
            platform = "Spotify"
    elif "audiomack.com" in url:
        meta = await get_metadata_stealth(url)
        search_query = f"scsearch1:{meta}"
        platform = "Audiomack"

    ydl_opts = {
        'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 
        'format': 'bestaudio/best',
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, lambda: ydl.extract_info(search_query, download=False))
            
            if 'entries' in info:
                if not info['entries']: raise Exception("No matching mirrors found on SoundCloud.")
                info = info['entries'][0]

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
                    "url": url,
                    "title": info.get("title", "Media"),
                    "thumbnail": info.get("thumbnail"),
                    "duration": f"{int(info.get('duration', 0)) // 60}m",
                    "author": info.get("uploader", "Unknown"),
                    "platform": platform,
                    "mediaType": "music",
                    "qualities": formats[:10]
                }
            }
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.get("/api/download")
async def download_media(url: str, background_tasks: BackgroundTasks, filename: str = "file.mp4"):
    temp_path = os.path.join(DOWNLOAD_DIR, f"{uuid.uuid4()}.mp4")
    # For music, we try to download the SoundCloud mirror
    ydl_opts = {'format': 'bestaudio/best', 'outtmpl': temp_path, 'quiet': True}
    try:
        download_target = url
        if "spotify.com" in url or "audiomack.com" in url:
            # Re-resolve link to SoundCloud for actual download
            with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
                info = await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.extract_info(f"scsearch1:{url}", download=False))
                if 'entries' in info: download_target = info['entries'][0]['url']

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.download([download_target]))
        
        background_tasks.add_task(os.remove, temp_path)
        return FileResponse(path=temp_path, filename=filename)
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

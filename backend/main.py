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
from moviebox_api.v1.core import Search, Session, SubjectType
from moviebox_api.v1 import MovieDetails, DownloadableMovieFilesDetail

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
    platform = "Unknown"
    media_type = "video" # Default to video as it's more common for general links
    
    # Platform Detection
    if "youtube.com" in url or "youtu.be" in url: platform = "YouTube"
    elif "tiktok.com" in url: platform = "TikTok"
    elif "instagram.com" in url: platform = "Instagram"
    elif "facebook.com" in url or "fb.watch" in url: platform = "Facebook"
    elif "twitter.com" in url or "x.com" in url: platform = "Twitter"
    elif "soundcloud.com" in url: 
        platform = "SoundCloud"
        media_type = "music"
    elif "spotify.com" in url:
        platform = "Spotify"
        media_type = "music"
    elif "audiomack.com" in url:
        platform = "Audiomack"
        media_type = "music"
    
    # 1. SoundCloud Mirror Engine (Most Stable on Render)
    if platform in ["Spotify", "Audiomack"]:
        try:
            if platform == "Spotify" and sp:
                track_id = url.split("track/")[1].split("?")[0]
                track = sp.track(track_id)
                search_query = f"scsearch1:{track['artists'][0]['name']} {track['name']} official"
            else:
                search_query = f"scsearch1:{url}"
        except Exception as e: 
            print(f"Platform search extraction failed: {str(e)}")
            search_query = f"scsearch1:{url}"

    # Format Selection: Try to be smart but allow fallbacks
    format_opt = 'bestaudio/best' if media_type == "music" else 'bestvideo+bestaudio/best'
    
    ydl_opts = {
        'quiet': True, 
        'no_warnings': True, 
        'nocheckcertificate': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        'extract_flat': False,
        'skip_download': True
    }
    
    try:
        print(f"--- Extraction Start ---")
        print(f"Platform: {platform} | Media Type: {media_type}")
        print(f"Query: {search_query}")
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            loop = asyncio.get_event_loop()
            try:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(search_query, download=False))
            except Exception as ydl_err:
                # If specialized search fails, try raw URL as last resort
                print(f"Primary extraction failed, trying raw URL: {str(ydl_err)}")
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(url, download=False))
            
            if info and 'entries' in info:
                if not info['entries']: raise Exception(f"No results found.")
                info = info['entries'][0]

            if not info:
                raise Exception("Could not retrieve media info.")

            # Process formats
            raw_formats = info.get("formats", [])
            formats = []
            seen_qualities = set()

            for f in raw_formats:
                url_val = f.get("url")
                if not url_val: continue
                
                res = f.get("resolution")
                note = f.get("format_note")
                ext = f.get("ext", "mp4").upper()
                vcodec = f.get('vcodec', 'none')
                
                is_audio = vcodec == 'none' or 'audio' in (note or '').lower() or 'audio' in (res or '').lower()
                
                # If we're strictly in music mode, we prefer audio-only formats
                if media_type == "music" and not is_audio:
                    continue 
                
                quality = note or res or ("HQ Audio" if is_audio else "Standard")
                q_key = f"{quality}_{ext}_{'A' if is_audio else 'V'}"
                if q_key in seen_qualities: continue
                seen_qualities.add(q_key)
                
                formats.append({
                    "quality": quality,
                    "format": ext,
                    "resolution": "Audio" if is_audio else "Video",
                    "size": format_size(f.get('filesize') or f.get('filesize_approx')),
                    "url": url_val
                })

            # If no formats found after filtering, provide at least one
            if not formats and info.get('url'):
                formats.append({
                    "quality": "Standard",
                    "format": info.get("ext", "MP4").upper(),
                    "resolution": "Default",
                    "size": "Fast",
                    "url": info.get("url")
                })

            return {
                "success": True, 
                "data": {
                    "id": str(info.get("id")),
                    "url": url,
                    "title": info.get("title", "Media Content"),
                    "thumbnail": info.get("thumbnail") or info.get('cover'),
                    "duration": f"{int(info.get('duration', 0)) // 60}m" if info.get("duration") else "0m",
                    "author": info.get("uploader") or info.get("artist") or platform,
                    "platform": platform,
                    "mediaType": media_type,
                    "qualities": formats[:15]
                }
            }
    except Exception as e:
        print(f"!!! EXTRACTION ERROR !!!")
        print(traceback.format_exc())
        error_msg = str(e)
        if "403" in error_msg:
            error_msg = f"This {platform} link is protected or restricted in your region."
        return JSONResponse(status_code=400, content={"success": False, "error": error_msg})

@app.get("/api/download")
async def download_media(url: str, background_tasks: BackgroundTasks, filename: str = "file.mp4"):
    temp_path = os.path.join(DOWNLOAD_DIR, f"{uuid.uuid4()}.mp4")
    ydl_opts = {'format': 'bestaudio/best' if filename.endswith('.mp3') else 'best', 'outtmpl': temp_path, 'quiet': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.download([url]))
        background_tasks.add_task(os.remove, temp_path)
        return FileResponse(path=temp_path, filename=filename)
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

# =========================
# MOVIE ENDPOINTS
# =========================

@app.get("/api/movies/search")
async def search_movies(query: str = Query(...), type: str = "movie"):
    try:
        client_session = Session()
        subject_type = SubjectType.MOVIES if type == "movie" else SubjectType.TV_SHOWS
        search = Search(client_session, query, subject_type=subject_type)
        results = await search.get_content()
        
        items = results.get('items', [])
        formatted_results = []
        
        for item in items:
            # Map correctly from the actual API response structure
            movie_id = str(item.get('subjectId'))
            poster_data = item.get('cover') or {}
            poster_url = poster_data.get('url') if isinstance(poster_data, dict) else None
            
            # Fallbacks
            if not poster_url:
                poster_url = item.get('poster') or item.get('thumbnail')

            formatted_results.append({
                "id": movie_id,
                "title": item.get('title') or item.get('name') or "Unknown Title",
                "thumbnail": poster_url,
                "year": item.get('releaseDate', '').split('-')[0] if item.get('releaseDate') else "N/A",
                "rating": str(item.get('imdbRatingValue', '0.0')),
                "description": item.get('description', 'No description available.'),
                "mediaType": type
            })
            
        return {"success": True, "data": formatted_results}
    except Exception as e:
        print(f"Movie Search Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str = Query(...), type: str = "movie"):
    try:
        client_session = Session()
        subject_type = SubjectType.MOVIES if type == "movie" else SubjectType.TV_SHOWS
        search = Search(client_session, subject_id, subject_type=subject_type)
        search_model = await search.get_content_model()
        
        target_item = None
        if hasattr(search_model, 'items') and search_model.items:
            target_item = search_model.items[0]
        elif hasattr(search_model, 'list') and search_model.list:
            target_item = search_model.list[0]
            
        if not target_item:
            return JSONResponse(status_code=404, content={"success": False, "error": "Content not found"})

        md_instance = MovieDetails(target_item, client_session)
        details = await md_instance.get_content()
        
        md_model = await md_instance.get_content_model()
        downloadable_files = DownloadableMovieFilesDetail(client_session, md_model)
        files_data = await downloadable_files.get_content()
        
        qualities = []
        raw_files = files_data.get('list', [])
        for f in raw_files:
            qualities.append({
                "quality": f.get('quality', '720p'),
                "format": "MP4",
                "size": format_size(f.get('size')),
                "url": f.get('path') or f.get('url')
            })

        return {
            "success": True,
            "data": {
                "id": subject_id,
                "title": details.get('name') or details.get('title'),
                "description": details.get('description'),
                "thumbnail": details.get('poster'),
                "year": details.get('year'),
                "rating": str(details.get('rating', '0.0')),
                "qualities": qualities,
                "mediaType": type
            }
        }
    except Exception as e:
        print(f"Movie Details Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

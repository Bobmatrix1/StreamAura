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
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse, RedirectResponse, HTMLResponse
from pydantic import BaseModel
import yt_dlp
import httpx
from bs4 import BeautifulSoup
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from moviebox_api.v1.core import Search, Session, SubjectType
from moviebox_api.v1 import MovieDetails, DownloadableMovieFilesDetail, TVSeriesDetails, DownloadableTVSeriesFilesDetail

# Load environment
from dotenv import load_dotenv
load_dotenv()

# =========================
# INITIALIZE FIREBASE FIRST
# =========================
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
    print(f"Firebase Init Error: {e}")
    db_admin = None

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the periodic cleanup worker
    from websockets.game_sync import start_periodic_cleanup
    asyncio.create_task(start_periodic_cleanup())
    yield

# =========================
# APP INITIALIZATION
# =========================
app = FastAPI(title="StreamAura API Master", lifespan=lifespan)

# Cinema Routers (Must be imported AFTER Firebase init because they call firestore.client() at module level)
from routers import cinema as cinema_router
from routers import games as games_router
from websockets import room_sync as websocket_router
from websockets import game_sync as game_ws_router

app.include_router(cinema_router.router, prefix="/api/cinema", tags=["cinema"])
app.include_router(games_router.router, prefix="/api/games", tags=["games"])
app.include_router(websocket_router.router, prefix="/api/ws/cinema", tags=["cinema-ws"])
app.include_router(game_ws_router.router, prefix="/api/ws/games", tags=["games-ws"])

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

async def try_smvd_api(url: str, platform: str):
    """
    Attempts to extract media info using the Social Media Video Downloader API.
    Returns (formatted_data, status_code).
    """
    smvd_url = os.getenv("SMVD_API_URL")
    smvd_key = os.getenv("SMVD_API_KEY")
    
    if not smvd_url:
        print(f"SMVD API skipped: SMVD_API_URL not configured.")
        return None, None
        
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Standardize headers for NestJS AuthGuard
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-API-Key": smvd_key,
                "x-api-key": smvd_key,
                "Authorization": f"Bearer {smvd_key}"
            }
            
            # Try multiple payload formats (NestJS can be picky)
            payload = {
                "url": url,
                "video_url": url,
                "type": platform.lower(),
                "with_metadata": True
            }
            
            # Attempt 1: /info route (from logs)
            endpoint = f"{smvd_url.rstrip('/')}/info"
            print(f"Attempting SMVD Info: {endpoint}...")
            
            response = await client.post(endpoint, json=payload, headers=headers)
            
            # If /info fails, attempt 2: /download/video (from README)
            if response.status_code not in [200, 201]:
                print(f"SMVD Info failed ({response.status_code}), trying /download/video...")
                endpoint = f"{smvd_url.rstrip('/')}/download/video"
                response = await client.post(endpoint, json=payload, headers=headers)

            if response.status_code in [200, 201]:
                result = response.json()
                
                # Format A: Raw yt-dlp info object (often returned by /info)
                if isinstance(result, dict) and (result.get("formats") or result.get("url")):
                    info = result
                    formats = []
                    seen_qualities = set()
                    
                    # Some versions return media in a 'media' key, some in 'formats'
                    raw_formats = info.get("formats") or info.get("media") or []
                    
                    for f in raw_formats:
                        url_val = f.get("url")
                        if not url_val: continue
                        res = f.get("resolution") or f.get("label")
                        note = f.get("format_note")
                        ext = f.get("ext", "mp4").upper()
                        is_audio = f.get('vcodec') == 'none' or 'audio' in str(res).lower()
                        
                        quality = str(note or res or "STD")
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
                    
                    # Fallback for single URL results
                    if not formats and info.get("url"):
                        formats.append({"quality": "HD", "format": "MP4", "resolution": "Video", "size": "Fast", "url": info["url"]})

                    return {
                        "id": str(uuid.uuid4()),
                        "url": url,
                        "title": info.get("title") or info.get("description", "Media Content")[:50],
                        "thumbnail": info.get("thumbnail") or info.get("cover"),
                        "duration": f"{int(info.get('duration', 0)) // 60}m" if info.get('duration') else "0m",
                        "author": info.get("uploader") or info.get("author", platform),
                        "platform": platform,
                        "mediaType": "video",
                        "qualities": formats[:15]
                    }, response.status_code
                
                # Format B: The structured 'success/data' format
                elif isinstance(result, dict) and result.get("success") and result.get("data"):
                    raw_data = result["data"]
                    formats = []
                    for m in raw_data.get("media", []):
                        meta = m.get("metadata", {})
                        formats.append({
                            "quality": meta.get("quality") or m.get("label", "Standard"),
                            "format": (meta.get("extension") or "MP4").upper(),
                            "resolution": "Video" if meta.get("hasAudio", True) else "Video (No Audio)",
                            "size": meta.get("size") or "Fast",
                            "url": m.get("url")
                        })
                        
                    return {
                        "id": str(uuid.uuid4()),
                        "url": url,
                        "title": raw_data.get("title") or "Media Content",
                        "thumbnail": raw_data.get("thumbnail"),
                        "duration": raw_data.get("duration") or "0m",
                        "author": platform,
                        "platform": platform,
                        "mediaType": "video",
                        "qualities": formats[:15]
                    }, response.status_code
                    
            print(f"SMVD API reached but returned unknown format: {response.text[:200]}")
            return None, response.status_code
    except Exception as e:
        print(f"SMVD API Request Exception: {str(e)}")
        return None, 500
        
    return None, None

# =========================
# ENDPOINTS
# =========================

@app.get("/")
@app.head("/")
async def root(): return {"status": "online", "service": "StreamAura"}

@app.get("/api/analytics/location")
async def get_visitor_location(request: Request):
    country = request.headers.get("cf-ipcountry") or "Unknown"
    region = request.headers.get("cf-region") or "Unknown" # Cloudflare region header
    ua = request.headers.get("user-agent", "").lower()
    
    if "iphone" in ua or "ipad" in ua: device = "iOS"
    elif "android" in ua: device = "Android"
    elif "mobile" in ua: device = "Mobile"
    else: device = "Desktop"
    
    return {
        "country": country, 
        "region": region,
        "device": device
    }

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
    
    # 0. Primary API Attempt (Social Media Video Downloader API)
    smvd_status = "Skipped"
    if media_type == "video" or platform == "YouTube":
        if not os.getenv("SMVD_API_URL"):
            smvd_status = "Not configured (Missing SMVD_API_URL in Render)"
        else:
            smvd_data, smvd_status_code, smvd_error = await try_smvd_api(url, platform)
            if smvd_data:
                print(f"SMVD API Success for {platform}")
                return {"success": True, "data": smvd_data}
            
            if smvd_status_code:
                smvd_status = f"Failed (HTTP {smvd_status_code}: {smvd_error})"
            else:
                smvd_status = f"Connection Timeout ({smvd_error})"
    
    # 1. SoundCloud Mirror Engine (Most Stable on Render) fallback
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
        'skip_download': True,
        'ignoreerrors': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['web_embedded', 'android', 'ios'],
                'skip': ['dash', 'hls']
            }
        }
    }
    
    try:
        print(f"--- Fallback Extraction Start (SMVD: {smvd_status}) ---")
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
                raise Exception(f"Could not retrieve media info. (Engine: {smvd_status})")

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

        async def perform_search(search_type_str):
            st = SubjectType.MOVIES if search_type_str == "movie" else SubjectType.TV_SERIES
            search = Search(client_session, query, subject_type=st)
            try:
                res = await search.get_content()
                if isinstance(res, list): return res
                if isinstance(res, dict):
                    return res.get('items') or res.get('list') or res.get('resData', {}).get('list') or []
                return getattr(res, 'items', []) or getattr(res, 'list', [])
            except:
                try:
                    model = await search.get_content_model()
                    return getattr(model, 'items', []) or getattr(model, 'list', [])
                except: return []

        items = await perform_search(type)
        if not items:
            other = "series" if type == "movie" else "movie"
            items = await perform_search(other)

        # 3. Final Fallback: Trending (If still empty)
        if not items:
            from moviebox_api.v1 import Trending
            tr = Trending(client_session)
            tr_res = await tr.get_content()
            items = tr_res.get('subjectList', [])[:12]
            print(f"Search found nothing, returning trending items instead.")

        def get_val(obj, key, default=None):
            if isinstance(obj, dict): return obj.get(key, default)
            return getattr(obj, key, default)

        formatted_results = []
        for item in items:
            movie_id = str(get_val(item, 'subjectId', ''))
            if not movie_id: continue

            poster_data = get_val(item, 'cover') or get_val(item, 'poster') or {}
            poster_url = get_val(poster_data, 'url') if isinstance(poster_data, dict) else poster_data
            if not poster_url or not isinstance(poster_url, str):
                poster_url = get_val(item, 'poster') or get_val(item, 'thumbnail')

            formatted_results.append({
                "id": movie_id,
                "title": get_val(item, 'title') or get_val(item, 'name') or "Unknown Title",
                "thumbnail": poster_url,
                "year": str(get_val(item, 'releaseDate', 'N/A')).split('-')[0],
                "rating": str(get_val(item, 'imdbRatingValue', '0.0')),
                "description": get_val(item, 'description', 'No description available.'),
                "mediaType": "movie" if type == "movie" else "series"
            })

        return {"success": True, "data": formatted_results}
    except Exception as e:
        print(f"Movie Search Critical Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(
    subject_id: str = Query(...), 
    type: str = "movie",
    title: Optional[str] = Query(None),
    season: Optional[int] = None,
    episode: Optional[int] = None
):
    try:
        client_session = Session()

        if type == "series":
            # Initialize with string ID for v0.5.3 compatibility
            md_instance = TVSeriesDetails(subject_id, client_session)
            details = await md_instance.get_content()
            resData = details.get('resData', {})
            subject = resData.get('subject', {})
            resource = resData.get('resource', {})
            seasons_raw = resource.get('seasons', [])

            seasons_info = []
            for s in seasons_raw:
                se_num = s.get('se')
                max_ep = s.get('maxEp', 0)
                seasons_info.append({"season": se_num, "episodes": list(range(1, max_ep + 1))})

            if season is not None and episode is not None:
                md_model = await md_instance.get_content_model()
                files_instance = DownloadableTVSeriesFilesDetail(client_session, md_model)
                files_data = await files_instance.get_content(season=season, episode=episode)
            else:
                files_data = {"list": []}

            details_data = subject
        else:
            # Initialize with string ID for v0.5.3 compatibility
            md_instance = MovieDetails(subject_id, client_session)
            details_data = await md_instance.get_content()
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
                "title": details_data.get('name') or details_data.get('title'),
                "description": details_data.get('description'),
                "thumbnail": details_data.get('poster') or details_data.get('cover'),
                "year": details_data.get('year') or details_data.get('releaseDate', '').split('-')[0],
                "rating": str(details_data.get('rating', details_data.get('imdbRatingValue', '0.0'))),
                "qualities": qualities,
                "seasons": seasons_info if type == "series" else [],
                "mediaType": type
            }
        }
    except Exception as e:
        print(f"Movie Details Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})
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
                "title": details_data.get('name') or details_data.get('title'),
                "description": details_data.get('description'),
                "thumbnail": details_data.get('poster') or details_data.get('cover'),
                "year": details_data.get('year') or details_data.get('releaseDate', '').split('-')[0],
                "rating": str(details_data.get('rating', details_data.get('imdbRatingValue', '0.0'))),
                "qualities": qualities,
                "seasons": seasons_info,
                "mediaType": type
            }
        }
    except Exception as e:
        print(f"Movie Details Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/share", response_class=HTMLResponse)
async def dynamic_share_preview(
    title: str = "StreamAura", 
    desc: str = "Your Premium Media Access", 
    img: str = "https://streamaura.site/icons/icon-512x512.png",
    target: str = "/"
):
    """
    Serves a simple HTML page with dynamic OG tags for professional link previews.
    Redirects the user to the actual app target.
    """
    # Ensure image is absolute
    if img.startswith('/'):
        img = f"https://streamaura.site{img}"
        
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>{title}</title>
        <meta property="og:title" content="{title}" />
        <meta property="og:description" content="{desc}" />
        <meta property="og:image" content="{img}" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="{title}">
        <meta name="twitter:description" content="{desc}">
        <meta name="twitter:image" content="{img}">
        <meta http-equiv="refresh" content="0; url=https://streamaura.site{target}">
    </head>
    <body style="background: #0f0f23; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
        <div style="text-align: center;">
            <img src="https://streamaura.site/icons/icon-192x192.png" width="80" style="margin-bottom: 20px;">
            <p>Entering StreamAura...</p>
            <script>window.location.href = "https://streamaura.site{target}";</script>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

class OrderItem(BaseModel):
    productId: str
    name: str
    quantity: int
    price: float

class OrderRequest(BaseModel):
    orderId: str
    vendorId: str
    vendorName: str
    telegramGroupId: Optional[str]
    customerName: str
    customerPhone: str
    customerAddress: str
    items: List[OrderItem]
    total: float

@app.post("/api/store/order")
async def process_store_order(order: OrderRequest):
    try:
        bot_token = "8601644738:AAG5MMSgR0paQ_wI_ZHkCyy4ekeQL1Sus5Q"
        
        # Construct Message
        items_text = "\n".join([f"• {item.name} x{item.quantity} (₦{item.price:,.0f})" for item in order.items])
        
        message = (
            f"🛒 *New Order #{order.orderId}*\n\n"
            f"*Customer:* {order.customerName}\n"
            f"*Phone:* {order.customerPhone}\n"
            f"*Address:* {order.customerAddress}\n\n"
            f"*Items:*\n{items_text}\n\n"
            f"*Total Paid:* ₦{order.total:,.0f}\n\n"
            f"Sent only to {order.vendorName} group."
        )
        
        # Inline Keyboard
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "✅ Accept Order", "callback_data": f"accept_{order.orderId}"},
                    {"text": "🚚 Delivered", "callback_data": f"deliver_{order.orderId}"}
                ],
                [
                    {"text": "❌ Cancelled", "callback_data": f"cancel_{order.orderId}"}
                ]
            ]
        }
        
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": order.telegramGroupId,
            "text": message,
            "parse_mode": "Markdown",
            "reply_markup": keyboard
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload)
            response_data = response.json()
            
        if not response_data.get("ok"):
            print(f"Telegram Error: {response_data}")
            return JSONResponse(status_code=500, content={"success": False, "error": "Failed to send Telegram message"})
            
        return {"success": True, "message": "Order processed and notification sent"}
        
    except Exception as e:
        print(f"Store Order Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, ws="wsproto")

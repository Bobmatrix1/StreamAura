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
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Query, Depends
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
    # Startup: Start the periodic cleanup workers and telegram polling worker
    from websockets.game_sync import start_periodic_cleanup
    from websockets.room_sync import start_periodic_cinema_cleanup
    asyncio.create_task(start_periodic_cleanup())
    asyncio.create_task(start_periodic_cinema_cleanup())
    asyncio.create_task(telegram_polling_worker())
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

from core.security import get_current_admin

@app.post("/api/admin/broadcast")
async def broadcast_notification(request: Request, admin: dict = Depends(get_current_admin)):
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

def clean_query_for_related(q: str) -> str:
    # Remove numbers (like 2, 3, 2024, etc.)
    q = re.sub(r'\b\d+\b', '', q)
    # Remove common suffixes/words
    q = re.sub(r'\b(movie|series|season|episode|vol|volume|part|pt|ii|iii|iv|v)\b', '', q, flags=re.IGNORECASE)
    # Clean extra whitespaces
    q = ' '.join(q.split())
    return q

@app.get("/api/movies/search")
async def search_movies(query: str = Query(...), type: str = "movie"):
    try:
        client_session = Session(verify=False)

        async def perform_search(search_type_str, search_query):
            auth_token = os.getenv("MOVIEBOX_AUTH_TOKEN", "").strip()
            
            if auth_token:
                # 1. Try v2 Search (Web API - compatible with Chrome-captured web tokens)
                try:
                    from moviebox_api.v2.core import Search as SearchV2
                    from moviebox_api.v2.core import SubjectType as SubjectTypeV2
                    
                    st_v2 = SubjectTypeV2.MOVIES if search_type_str == "movie" else SubjectTypeV2.TV_SERIES
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
                        "Accept": "*/*",
                        "Origin": "https://movieboxhd.net",
                        "Referer": "https://movieboxhd.net/",
                        "Authorization": f"Bearer {auth_token}"
                    }
                    sess = Session(headers=headers, verify=False)
                    search = SearchV2(sess, search_query, subject_type=st_v2)
                    res = await search.get_content()
                    if isinstance(res, dict):
                        items = res.get('items') or res.get('list') or res.get('resData', {}).get('list') or []
                        if items:
                            return items
                except Exception as v2_exc:
                    print(f"v2 Search failed: {v2_exc}")

                # 2. Try v3 Search (Mobile API - compatible with Mobile-captured tokens)
                try:
                    from moviebox_api.v3.http_client import MovieBoxHttpClient
                    from moviebox_api.v3.core import SearchV2 as SearchV2V3
                    from moviebox_api.v3.core import Search as SearchV3
                    from moviebox_api.v3.core import SubjectType as SubjectTypeV3
                    from moviebox_api.v3.core import TabID as TabIDV3
                    
                    st = SubjectTypeV3.MOVIES if search_type_str == "movie" else SubjectTypeV3.TV_SERIES
                    tab = TabIDV3.MOVIE if search_type_str == "movie" else TabIDV3.TV_SERIES
                    
                    async with MovieBoxHttpClient(verify=False) as client:
                        # Prioritize SearchV2 because it supports tab_id filtering directly on the MovieBox servers
                        try:
                            search = SearchV2V3(client, search_query, subject_type=st, tab_id=tab)
                            res = await search.get_content()
                        except Exception as v2_exc:
                            print(f"v3 SearchV2 failed, falling back to SearchV3: {v2_exc}")
                            try:
                                search = SearchV3(client, search_query, subject_type=st)
                                res = await search.get_content()
                            except Exception as v3_exc:
                                print(f"v3 SearchV3 also failed: {v3_exc}")
                                res = None

                        if res is not None:
                            items = []
                            if hasattr(res, 'list') and res.list:
                                items = res.list
                            elif hasattr(res, 'items') and res.items:
                                items = res.items
                            else:
                                items = getattr(res, 'resData', {}).get('list') or []
                            return items
                except Exception as e:
                    print(f"v3 Search module failure: {e}")
            
            st = SubjectType.MOVIES if search_type_str == "movie" else SubjectType.TV_SERIES
            try:
                sess_no_auth = Session(verify=False)
                search = Search(sess_no_auth, search_query, subject_type=st)
                res = await search.get_content()
                if isinstance(res, list): return res
                if isinstance(res, dict):
                    return res.get('items') or res.get('list') or res.get('resData', {}).get('list') or []
                return getattr(res, 'items', []) or getattr(res, 'list', [])
            except:
                try:
                    sess_no_auth = Session(verify=False)
                    search = Search(sess_no_auth, search_query, subject_type=st)
                    model = await search.get_content_model()
                    return getattr(model, 'items', []) or getattr(model, 'list', [])
                except: return []

        def get_val(obj, key, default=None):
            if isinstance(obj, dict): return obj.get(key, default)
            val = getattr(obj, key, None)
            if val is not None: return val
            snake_key = re.sub(r'(?<!^)(?=[A-Z])', '_', key).lower()
            val = getattr(obj, snake_key, None)
            if val is not None: return val
            return default

        # 1. Search in the requested category (type)
        items = await perform_search(type, query)
        
        # 2. If no results found in the requested category
        if not items:
            other_type = "series" if type == "movie" else "movie"
            other_items = await perform_search(other_type, query)
            
            if other_items:
                # The query matches the other category (e.g. searched a movie in the series tab).
                # We do NOT show the other category items. Instead, we look for related items of the requested type.
                cleaned_query = clean_query_for_related(query)
                if cleaned_query and cleaned_query.lower() != query.lower():
                    items = await perform_search(type, cleaned_query)
                
                # If still no items, try searching with the first couple of words of the cleaned title
                if not items and cleaned_query:
                    words = [w for w in re.split(r'\s+', cleaned_query) if len(w) > 2]
                    if words:
                        broad_query = " ".join(words[:2])
                        items = await perform_search(type, broad_query)
                
                # If still no items, fall back to trending items of the requested type
                if not items:
                    from moviebox_api.v1 import Trending
                    tr = Trending(client_session)
                    tr_res = await tr.get_content()
                    raw_trending = tr_res.get('subjectList', []) or []
                    target_sub_type = 1 if type == "movie" else 2
                    items = [i for i in raw_trending if get_val(i, 'subjectType') == target_sub_type][:12]
            else:
                # No results in either category. Try a broader search in the requested type.
                cleaned_query = clean_query_for_related(query)
                if cleaned_query and cleaned_query.lower() != query.lower():
                    items = await perform_search(type, cleaned_query)
                
                # If still nothing, return trending of the requested type
                if not items:
                    from moviebox_api.v1 import Trending
                    tr = Trending(client_session)
                    tr_res = await tr.get_content()
                    raw_trending = tr_res.get('subjectList', []) or []
                    target_sub_type = 1 if type == "movie" else 2
                    items = [i for i in raw_trending if get_val(i, 'subjectType') == target_sub_type][:12]

        formatted_results = []
        for item in items:
            movie_id = str(get_val(item, 'subjectId', ''))
            if not movie_id: continue

            poster_data = get_val(item, 'cover') or get_val(item, 'poster') or {}
            poster_url = get_val(poster_data, 'url') if isinstance(poster_data, dict) else poster_data
            if not poster_url or not isinstance(poster_url, str):
                poster_url = get_val(item, 'poster') or get_val(item, 'thumbnail')

            title = get_val(item, 'title') or get_val(item, 'name') or "Unknown Title"
            detail_path = get_val(item, 'detailPath') or get_val(item, 'detail_path') or f"/detail/{make_slug(title)}?id={movie_id}"

            formatted_results.append({
                "id": movie_id,
                "detailPath": detail_path,
                "title": title,
                "thumbnail": poster_url,
                "year": str(get_val(item, 'releaseDate', 'N/A')).split('-')[0],
                "rating": str(get_val(item, 'imdbRatingValue', '0.0')),
                "description": get_val(item, 'description', 'No description available.'),
                "mediaType": type
            })

        return {"success": True, "data": formatted_results}
    except Exception as e:
        print(f"Movie Search Critical Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/trending")
async def get_trending_movies(type: str = "movie"):
    try:
        auth_token = os.getenv("MOVIEBOX_AUTH_TOKEN", "").strip()
        headers = {}
        if auth_token:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
                "Accept": "*/*",
                "Origin": "https://movieboxhd.net",
                "Referer": "https://movieboxhd.net/",
                "Authorization": f"Bearer {auth_token}"
            }
        
        client_session = Session(headers=headers, verify=False) if headers else Session(verify=False)
        
        def get_val(obj, key, default=None):
            if isinstance(obj, dict): return obj.get(key, default)
            val = getattr(obj, key, None)
            if val is not None: return val
            snake_key = re.sub(r'(?<!^)(?=[A-Z])', '_', key).lower()
            val = getattr(obj, snake_key, None)
            if val is not None: return val
            return default

        # A. Try fetching homepage categories (for a wide range of movies/series in rows)
        try:
            from moviebox_api.v2.core import Homepage
            hp = Homepage(client_session)
            hp_res = await hp.get_content()
            operating_list = hp_res.get('operatingList', [])
            
            target_sub_type = 1 if type == "movie" else 2
            formatted_categories = []
            
            for row in operating_list:
                title = row.get('title') or row.get('name')
                if not title or title.startswith("Banner_") or "hot tv" in title.lower():
                    continue
                    
                subjects = row.get('subjects', []) or []
                filtered_subjects = [s for s in subjects if get_val(s, 'subjectType') == target_sub_type]
                
                if not filtered_subjects:
                    continue
                    
                formatted_items = []
                for item in filtered_subjects:
                    movie_id = str(get_val(item, 'subjectId', ''))
                    if not movie_id: continue

                    poster_data = get_val(item, 'cover') or get_val(item, 'poster') or {}
                    poster_url = get_val(poster_data, 'url') if isinstance(poster_data, dict) else poster_data
                    if not poster_url or not isinstance(poster_url, str):
                        poster_url = get_val(item, 'poster') or get_val(item, 'thumbnail')

                    title_val = get_val(item, 'title') or get_val(item, 'name') or "Unknown Title"
                    detail_path = get_val(item, 'detailPath') or get_val(item, 'detail_path') or f"/detail/{make_slug(title_val)}?id={movie_id}"

                    formatted_items.append({
                        "id": movie_id,
                        "detailPath": detail_path,
                        "title": title_val,
                        "thumbnail": poster_url,
                        "year": str(get_val(item, 'releaseDate', 'N/A')).split('-')[0],
                        "rating": str(get_val(item, 'imdbRatingValue', '0.0')),
                        "description": get_val(item, 'description', 'No description available.'),
                        "mediaType": type
                    })
                
                if formatted_items:
                    formatted_categories.append({
                        "category": title,
                        "items": formatted_items
                    })
            
            if formatted_categories:
                return {"success": True, "isRows": True, "data": formatted_categories}
        except Exception as hp_exc:
            print(f"Homepage rows fetch failed, falling back to flat Trending list: {hp_exc}")

        # B. Fallback to flat Trending list
        from moviebox_api.v1 import Trending
        tr = Trending(client_session)
        tr_res = await tr.get_content()
        raw_trending = tr_res.get('subjectList', []) or []
        
        target_sub_type = 1 if type == "movie" else 2
        items = [i for i in raw_trending if get_val(i, 'subjectType') == target_sub_type]
        
        formatted_results = []
        for item in items:
            movie_id = str(get_val(item, 'subjectId', ''))
            if not movie_id: continue

            poster_data = get_val(item, 'cover') or get_val(item, 'poster') or {}
            poster_url = get_val(poster_data, 'url') if isinstance(poster_data, dict) else poster_data
            if not poster_url or not isinstance(poster_url, str):
                poster_url = get_val(item, 'poster') or get_val(item, 'thumbnail')

            title_val = get_val(item, 'title') or get_val(item, 'name') or "Unknown Title"
            detail_path = get_val(item, 'detailPath') or get_val(item, 'detail_path') or f"/detail/{make_slug(title_val)}?id={movie_id}"

            formatted_results.append({
                "id": movie_id,
                "detailPath": detail_path,
                "title": title_val,
                "thumbnail": poster_url,
                "year": str(get_val(item, 'releaseDate', 'N/A')).split('-')[0],
                "rating": str(get_val(item, 'imdbRatingValue', '0.0')),
                "description": get_val(item, 'description', 'No description available.'),
                "mediaType": type
            })
            
        return {"success": True, "isRows": False, "data": formatted_results}
    except Exception as e:
        print(f"Trending Fetch Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

def make_slug(t: str) -> str:
    if not t: return "detail"
    s = re.sub(r'[^a-zA-Z0-9]', '_', t.lower())
    s = re.sub(r'_+', '_', s).strip('_')
    return s or "detail"

async def fetch_tmdb_details(title: str, media_type: str, year: Optional[str] = None) -> Optional[dict]:
    token = os.getenv("TMDB_READ_ACCESS_TOKEN", "").strip()
    if not token or not title:
        return None
        
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        search_type = "movie" if media_type == "movie" else "tv"
        clean_title = re.sub(r'S\d+.*$', '', title).strip() # Lucifer S6 -> Lucifer
        clean_title = re.sub(r'\(\d{4}\)', '', clean_title).strip() # Avatar (2009) -> Avatar
        
        search_params = {"query": clean_title, "include_adult": "false"}
        if year and year.isdigit():
            if search_type == "movie":
                search_params["year"] = year
            else:
                search_params["first_air_date_year"] = year
                
        search_url = f"https://api.themoviedb.org/3/search/{search_type}"
        
        try:
            r = await client.get(search_url, headers=headers, params=search_params)
            res = r.json()
            results = res.get('results', [])
            
            if not results and year:
                search_params.pop("year", None)
                search_params.pop("first_air_date_year", None)
                r = await client.get(search_url, headers=headers, params=search_params)
                res = r.json()
                results = res.get('results', [])
                
            if not results:
                return None
                
            best_match = results[0]
            tmdb_id = best_match.get('id')
            if not tmdb_id:
                return None
                
            detail_url = f"https://api.themoviedb.org/3/{search_type}/{tmdb_id}?append_to_response=videos,credits,reviews,similar"
            rd = await client.get(detail_url, headers=headers)
            details = rd.json()
            
            formatted_cast = []
            for member in details.get('credits', {}).get('cast', [])[:10]:
                profile_path = member.get('profile_path')
                formatted_cast.append({
                    "name": member.get('name'),
                    "character": member.get('character'),
                    "avatar": f"https://image.tmdb.org/t/p/w185{profile_path}" if profile_path else None
                })
                
            formatted_videos = []
            for video in details.get('videos', {}).get('results', []):
                if video.get('site') == 'YouTube':
                    formatted_videos.append({
                        "name": video.get('name'),
                        "key": video.get('key'),
                        "type": video.get('type')
                    })
                    
            formatted_reviews = []
            for review in details.get('reviews', {}).get('results', [])[:5]:
                formatted_reviews.append({
                    "author": review.get('author'),
                    "content": review.get('content')
                })
                
            formatted_similar = []
            for s in details.get('similar', {}).get('results', [])[:10]:
                s_id = str(s.get('id'))
                poster_path = s.get('poster_path')
                s_title = s.get('title') or s.get('name')
                s_date = s.get('release_date') or s.get('first_air_date') or ''
                s_year = s_date.split('-')[0] if s_date else 'N/A'
                formatted_similar.append({
                    "id": s_id,
                    "title": s_title,
                    "thumbnail": f"https://image.tmdb.org/t/p/w342{poster_path}" if poster_path else None,
                    "year": s_year,
                    "rating": str(round(s.get('vote_average', 0.0), 1)),
                    "mediaType": media_type
                })
                
            return {
                "id": tmdb_id,
                "rating": str(round(details.get('vote_average', 0.0), 1)),
                "voteCount": details.get('vote_count', 0),
                "overview": details.get('overview'),
                "tagline": details.get('tagline'),
                "genres": [g['name'] for g in details.get('genres', [])],
                "cast": formatted_cast,
                "videos": formatted_videos,
                "reviews": formatted_reviews,
                "similar": formatted_similar,
                "backdrop": f"https://image.tmdb.org/t/p/w1280{details.get('backdrop_path')}" if details.get('backdrop_path') else None,
                "poster": f"https://image.tmdb.org/t/p/w500{details.get('poster_path')}" if details.get('poster_path') else None,
            }
        except Exception as e:
            print(f"TMDB Fetch Error for {title}: {e}")
            return None

@app.get("/api/movies/details")
async def get_movie_details(
    subject_id: str = Query(...), 
    type: str = "movie",
    title: Optional[str] = Query(None),
    season: Optional[int] = None,
    episode: Optional[int] = None,
    detail_path: Optional[str] = Query(None)
):
    try:
        auth_token = os.getenv("MOVIEBOX_AUTH_TOKEN", "").strip()
        headers = {}
        if auth_token:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
                "Accept": "*/*",
                "Origin": "https://movieboxhd.net",
                "Referer": "https://movieboxhd.net/",
                "Authorization": f"Bearer {auth_token}"
            }
        
        client_session = Session(headers=headers, verify=False) if headers else Session(verify=False)

        def get_val(obj, key, default=None):
            if isinstance(obj, dict): return obj.get(key, default)
            return getattr(obj, key, default)

        def titles_match(t1, t2):
            if not t1 or not t2: return False
            def clean(t):
                t = t.lower()
                t = re.sub(r'[^a-z0-9]', '', t)
                t = re.sub(r's\d+$', '', t) # Lucifer S6 -> Lucifer -> lucifer
                return t
            return clean(t1) == clean(t2)

        # 1. Resolve subject_id (numeric string) to a valid URL format for moviebox-api compatibility
        if detail_path:
            if not detail_path.startswith("/detail/"):
                subject_id = f"/detail/{detail_path}"
            else:
                subject_id = detail_path
        elif subject_id.isdigit():
            resolved_path = None
            
            # A. Try title search first
            if title:
                st = SubjectType.MOVIES if type == "movie" else SubjectType.TV_SERIES
                search_instance = Search(client_session, title, subject_type=st)
                try:
                    res = await search_instance.get_content()
                    items = []
                    if isinstance(res, list): items = res
                    elif isinstance(res, dict):
                        items = res.get('items') or res.get('list') or res.get('resData', {}).get('list') or []
                    
                    for item in items:
                        item_id = str(get_val(item, 'subjectId', ''))
                        item_title = get_val(item, 'title') or get_val(item, 'name') or ''
                        if item_id == subject_id or (title and titles_match(item_title, title)):
                            resolved_path = get_val(item, 'detailPath')
                            if resolved_path:
                                if not resolved_path.startswith("/detail/"):
                                    resolved_path = f"/detail/{resolved_path}"
                                break
                except:
                    pass

            # B. If title search failed, try broad cleaned title search
            if not resolved_path and title:
                cleaned_title = clean_query_for_related(title)
                if cleaned_title:
                    st = SubjectType.MOVIES if type == "movie" else SubjectType.TV_SERIES
                    search_instance = Search(client_session, cleaned_title, subject_type=st)
                    try:
                        res = await search_instance.get_content()
                        items = []
                        if isinstance(res, list): items = res
                        elif isinstance(res, dict):
                            items = res.get('items') or res.get('list') or res.get('resData', {}).get('list') or []
                        
                        for item in items:
                            item_id = str(get_val(item, 'subjectId', ''))
                            item_title = get_val(item, 'title') or get_val(item, 'name') or ''
                            if item_id == subject_id or (title and titles_match(item_title, title)):
                                resolved_path = get_val(item, 'detailPath')
                                if resolved_path:
                                    if not resolved_path.startswith("/detail/"):
                                        resolved_path = f"/detail/{resolved_path}"
                                    break
                    except:
                        pass

            # C. If search failed, check trending items
            if not resolved_path:
                try:
                    from moviebox_api.v1 import Trending
                    tr = Trending(client_session)
                    tr_res = await tr.get_content()
                    raw_trending = tr_res.get('subjectList', []) or []
                    for item in raw_trending:
                        item_id = str(get_val(item, 'subjectId', ''))
                        item_title = get_val(item, 'title') or get_val(item, 'name') or ''
                        if item_id == subject_id or (title and titles_match(item_title, title)):
                            resolved_path = get_val(item, 'detailPath')
                            if resolved_path:
                                if not resolved_path.startswith("/detail/"):
                                    resolved_path = f"/detail/{resolved_path}"
                                break
                except:
                    pass

            # D. Fallback to title-derived slug URL if all searches yielded nothing
            if not resolved_path:
                slug = make_slug(title or "detail")
                resolved_path = f"/detail/{slug}?id={subject_id}"
                
            subject_id = resolved_path

        # 2. Fetch the movie/series details
        moviebox_details = None
        seasons_info = []
        qualities = []
        
        try:
            if type == "series":
                md_instance = TVSeriesDetails(subject_id, client_session)
                details = await md_instance.get_content()
                resData = details.get('resData', {})
                subject = resData.get('subject', {})
                resource = resData.get('resource', {})
                seasons_raw = resource.get('seasons', [])

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
                md_instance = MovieDetails(subject_id, client_session)
                details_data = await md_instance.get_content()
                md_model = await md_instance.get_content_model()
                downloadable_files = DownloadableMovieFilesDetail(client_session, md_model)
                files_data = await downloadable_files.get_content()

            raw_files = files_data.get('list', [])
            for f in raw_files:
                qualities.append({
                    "quality": f.get('quality', '720p'),
                    "format": "MP4",
                    "size": format_size(f.get('size')),
                    "url": f.get('path') or f.get('url')
                })
                
            moviebox_details = {
                "id": subject_id,
                "title": details_data.get('name') or details_data.get('title') or title or "Unknown Title",
                "description": details_data.get('description') or details_data.get('introduction') or '',
                "thumbnail": details_data.get('poster') or details_data.get('cover') or '',
                "year": details_data.get('year') or details_data.get('releaseDate', 'N/A').split('-')[0],
                "rating": str(details_data.get('rating', details_data.get('imdbRatingValue', '0.0'))),
                "qualities": qualities,
                "seasons": seasons_info if type == "series" else [],
                "mediaType": type
            }
        except Exception as mb_exc:
            print(f"Moviebox API details fetch failed: {mb_exc}")

        if not moviebox_details:
            moviebox_details = {
                "id": subject_id,
                "title": title or "Unknown Title",
                "description": "Not available in our cloud yet. Pre-order to request upload.",
                "thumbnail": "",
                "year": "N/A",
                "rating": "0.0",
                "qualities": [],
                "seasons": [],
                "mediaType": type
            }

        # TMDB Enrichment
        tmdb_data = None
        try:
            m_title = moviebox_details.get("title")
            m_year = moviebox_details.get("year")
            if m_year == "N/A":
                m_year = None
            tmdb_data = await fetch_tmdb_details(m_title, type, m_year)
            
            if tmdb_data:
                if not moviebox_details["title"] or moviebox_details["title"] == "Unknown Title":
                    moviebox_details["title"] = tmdb_data.get("title") or moviebox_details["title"]
                if not moviebox_details["description"] or moviebox_details["description"] == "Not available in our cloud yet. Pre-order to request upload.":
                    moviebox_details["description"] = tmdb_data.get("overview") or moviebox_details["description"]
                if not moviebox_details["thumbnail"] and tmdb_data.get("poster"):
                    moviebox_details["thumbnail"] = tmdb_data.get("poster")
                if moviebox_details["year"] == "N/A" and tmdb_data.get("year"):
                    moviebox_details["year"] = tmdb_data.get("year")
        except Exception as tmdb_err:
            print(f"TMDB Enrichment Error: {tmdb_err}")

        moviebox_details["tmdb"] = tmdb_data

        return {
            "success": True,
            "data": moviebox_details
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

def escape_tg(text: str) -> str:
    if not text: return ""
    return str(text).replace("*", "").replace("_", "").replace("`", "").replace("[", "(").replace("]", ")")

def format_order_telegram_message(order: dict, status: str = "pending", eta: Optional[str] = None) -> str:
    order_num = escape_tg(order.get("orderNumber") or str(order.get("id", ""))[:8].upper())
    cust_name = escape_tg(order.get("userName") or order.get("customerName", "Valued Customer"))
    cust_phone = escape_tg(order.get("userPhone") or order.get("customerPhone", "N/A"))
    cust_addr = escape_tg(order.get("deliveryAddress") or order.get("customerAddress", "N/A"))
    vendor_name = escape_tg(order.get("vendorName", "Store Vendor"))
    total = order.get("totalAmount") if order.get("totalAmount") is not None else order.get("total", 0)
    
    items = order.get("items", [])
    items_lines = []
    for item in items:
        name = escape_tg(item.get("name", "Item") if isinstance(item, dict) else getattr(item, "name", "Item"))
        qty = item.get("quantity", 1) if isinstance(item, dict) else getattr(item, "quantity", 1)
        price = item.get("price", 0) if isinstance(item, dict) else getattr(item, "price", 0)
        items_lines.append(f"• {name} x{qty} (₦{price:,.0f})")
    items_text = "\n".join(items_lines) if items_lines else "• Order items"
    
    status_display = "🟡 *Pending Vendor Acceptance*"
    if status == "accepted":
        status_display = "👨‍🍳 *Accepted & Being Processed*"
    elif status == "shipped":
        eta_str = f" (ETA: {escape_tg(eta)})" if eta else ""
        status_display = f"🚚 *Out for Delivery*{eta_str} 🛵"
    elif status == "delivered":
        status_display = "🟢 *Delivered Successfully* ✅"
    elif status == "cancelled":
        status_display = "🔴 *Cancelled* ❌"
        
    msg = (
        f"🛒 *Order #{order_num}*\n\n"
        f"*Customer:* {cust_name}\n"
        f"*Phone:* {cust_phone}\n"
        f"*Address:* {cust_addr}\n\n"
        f"*Items:*\n{items_text}\n\n"
        f"*Total Paid:* ₦{total:,.0f}\n\n"
        f"*Status:* {status_display}\n\n"
        f"Sent for {vendor_name}."
    )
    return msg

def format_order_telegram_keyboard(order_id: str, status: str = "pending") -> dict:
    if status == "pending":
        return {
            "inline_keyboard": [
                [
                    {"text": "✅ Accept Order", "callback_data": f"accept_{order_id}"}
                ],
                [
                    {"text": "❌ Cancel Order", "callback_data": f"cancel_{order_id}"}
                ]
            ]
        }
    elif status == "accepted":
        return {
            "inline_keyboard": [
                [
                    {"text": "🚚 Out for Delivery (Set ETA)", "callback_data": f"prompt_ship_{order_id}"}
                ],
                [
                    {"text": "📦 Mark as Delivered", "callback_data": f"deliver_{order_id}"}
                ],
                [
                    {"text": "❌ Cancel Order", "callback_data": f"cancel_{order_id}"}
                ]
            ]
        }
    elif status == "shipped":
        return {
            "inline_keyboard": [
                [
                    {"text": "📦 Mark as Delivered", "callback_data": f"deliver_{order_id}"}
                ],
                [
                    {"text": "⏱️ Update Delivery ETA", "callback_data": f"prompt_ship_{order_id}"}
                ],
                [
                    {"text": "❌ Cancel Order", "callback_data": f"cancel_{order_id}"}
                ]
            ]
        }
    elif status == "delivered":
        return {
            "inline_keyboard": [
                [
                    {"text": "✅ Delivered & Completed (Finalized)", "callback_data": f"noop_{order_id}"}
                ]
            ]
        }
    elif status == "cancelled":
        return {
            "inline_keyboard": [
                [
                    {"text": "❌ Cancelled (Finalized)", "callback_data": f"noop_{order_id}"}
                ]
            ]
        }
    return {"inline_keyboard": []}

def format_eta_keyboard(order_id: str) -> dict:
    return {
        "inline_keyboard": [
            [
                {"text": "⏱️ 15 Mins", "callback_data": f"ship_{order_id}_15 mins"},
                {"text": "⏱️ 30 Mins", "callback_data": f"ship_{order_id}_30 mins"}
            ],
            [
                {"text": "⏱️ 45 Mins", "callback_data": f"ship_{order_id}_45 mins"},
                {"text": "⏱️ 1 Hour", "callback_data": f"ship_{order_id}_1 hour"}
            ],
            [
                {"text": "⏱️ 2 Hours", "callback_data": f"ship_{order_id}_2 hours"},
                {"text": "🔙 Back", "callback_data": f"view_{order_id}"}
            ]
        ]
    }

async def execute_order_status_change(
    order_id: str, 
    new_status: str, 
    client: httpx.AsyncClient, 
    bot_token: str, 
    chat_id: Optional[Union[str, int]] = None, 
    message_id: Optional[int] = None, 
    cb_id: Optional[str] = None, 
    eta: Optional[str] = None,
    vendor_id: Optional[str] = None,
    user_id: Optional[str] = None
):
    order_dict = {}
    if db_admin:
        try:
            doc_ref = db_admin.collection('orders').document(order_id)
            doc_snap = doc_ref.get()
            if not doc_snap.exists:
                # Try finding by orderNumber or id field
                q_snaps = db_admin.collection('orders').where('orderNumber', '==', order_id).limit(1).get()
                if q_snaps:
                    doc_snap = q_snaps[0]
                    doc_ref = doc_snap.reference
                    order_id = doc_snap.id
                else:
                    q_snaps_id = db_admin.collection('orders').where('id', '==', order_id).limit(1).get()
                    if q_snaps_id:
                        doc_snap = q_snaps_id[0]
                        doc_ref = doc_snap.reference
                        order_id = doc_snap.id

            if doc_snap.exists:
                order_dict = doc_snap.to_dict() or {}
                order_dict["id"] = order_id
                
                # Update status
                now_ms = int(time.time() * 1000)
                update_data = {
                    "status": new_status,
                    f"{new_status}At": now_ms
                }
                if eta:
                    update_data["estimatedDeliveryTime"] = eta
                doc_ref.set(update_data, merge=True)
                order_dict.update(update_data)
                
                # Notify User in-app
                uid = order_dict.get("userId") or user_id
                order_num = order_dict.get("orderNumber") or order_id[:8].upper()
                vendor_name = order_dict.get("vendorName") or "Vendor"
                
                if uid:
                    notif_title = ""
                    notif_msg = ""
                    notif_type = f"order_{new_status}"
                    rating_prompt = False
                    
                    if new_status == "accepted":
                        notif_title = f"✅ Order Accepted - #{order_num}"
                        notif_msg = f"Your order #{order_num} was just accepted by {vendor_name} and is being processed!"
                    elif new_status == "shipped":
                        notif_title = f"🚚 Order Out for Delivery - #{order_num}"
                        eta_val = eta or order_dict.get("estimatedDeliveryTime")
                        eta_text = f" and would arrive in {eta_val}." if eta_val else "."
                        notif_msg = f"Your product is out for delivery and on its way{eta_text}"
                    elif new_status == "delivered":
                        notif_title = f"🎉 Order Delivered - #{order_num}"
                        notif_msg = f"Your order #{order_num} was delivered successfully! Please rate your experience with {vendor_name} in app."
                        rating_prompt = True
                    elif new_status == "cancelled":
                        notif_title = f"❌ Order Cancelled - #{order_num}"
                        notif_msg = f"Your order #{order_num} has been cancelled by {vendor_name}."
                        
                    notif_data = {
                        "title": notif_title,
                        "message": notif_msg,
                        "timestamp": now_ms,
                        "read": False,
                        "type": notif_type,
                        "orderId": order_id,
                        "orderNumber": order_num,
                        "vendorId": order_dict.get("vendorId") or vendor_id or "",
                        "vendorName": vendor_name,
                        "orderStatus": new_status,
                        "estimatedDeliveryTime": eta or order_dict.get("estimatedDeliveryTime") or "",
                        "ratingPrompt": rating_prompt,
                        "rated": False
                    }
                    try:
                        db_admin.collection('users').document(uid).collection('notifications').add(notif_data)
                        db_admin.collection('users').document(uid).set({"unreadCount": firestore.Increment(1)}, merge=True)
                        print(f"[StoreOrder] Successfully created in-app notification '{notif_title}' for user {uid}")
                    except Exception as notif_err:
                        print(f"[StoreOrder] Failed to write in-app notification: {notif_err}")
                        traceback.print_exc()
        except Exception as err:
            print(f"Firestore update error in execute_order_status_change: {err}")
            traceback.print_exc()

    # Determine chat_id and message_id if not supplied
    if not chat_id and order_dict.get("telegramChatId"):
        chat_id = order_dict.get("telegramChatId")
    if not message_id and order_dict.get("telegramMessageId"):
        message_id = order_dict.get("telegramMessageId")

    # Update Telegram Message
    if chat_id and message_id and bot_token:
        try:
            txt = format_order_telegram_message(order_dict, status=new_status, eta=eta or order_dict.get("estimatedDeliveryTime"))
            kb = format_order_telegram_keyboard(order_id, status=new_status)
            edit_url = f"https://api.telegram.org/bot{bot_token}/editMessageText"
            await client.post(edit_url, json={
                "chat_id": chat_id,
                "message_id": message_id,
                "text": txt,
                "parse_mode": "Markdown",
                "reply_markup": kb
            })
        except Exception as tg_err:
            print(f"Failed to edit Telegram message: {tg_err}")

    # Answer callback query if from Telegram
    if cb_id and bot_token:
        try:
            ans_text = f"Order #{order_dict.get('orderNumber', order_id[:8])} marked as {new_status.title()}!"
            if eta:
                ans_text += f" (ETA: {eta})"
            ans_url = f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery"
            await client.post(ans_url, json={"callback_query_id": cb_id, "text": ans_text})
        except Exception as e:
            print(f"Failed to answer callback query: {e}")

async def handle_telegram_callback(callback_query: dict, bot_token: str):
    cb_id = callback_query.get("id")
    data = callback_query.get("data", "")
    msg = callback_query.get("message", {})
    chat_id = msg.get("chat", {}).get("id")
    message_id = msg.get("message_id")
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            if data.startswith("accept_"):
                order_id = data.replace("accept_", "")
                await execute_order_status_change(order_id, "accepted", client, bot_token, chat_id, message_id, cb_id)
            elif data.startswith("prompt_ship_"):
                order_id = data.replace("prompt_ship_", "")
                kb = format_eta_keyboard(order_id)
                edit_url = f"https://api.telegram.org/bot{bot_token}/editMessageReplyMarkup"
                await client.post(edit_url, json={"chat_id": chat_id, "message_id": message_id, "reply_markup": kb})
                ans_url = f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery"
                await client.post(ans_url, json={"callback_query_id": cb_id, "text": "Select Estimated Delivery Time"})
            elif data.startswith("ship_"):
                # format: ship_{orderId}_{eta}
                parts = data.split("_", 2)
                if len(parts) >= 3:
                    order_id = parts[1]
                    eta = parts[2]
                else:
                    order_id = parts[1]
                    eta = "30 mins"
                await execute_order_status_change(order_id, "shipped", client, bot_token, chat_id, message_id, cb_id, eta=eta)
            elif data.startswith("deliver_"):
                order_id = data.replace("deliver_", "")
                await execute_order_status_change(order_id, "delivered", client, bot_token, chat_id, message_id, cb_id)
            elif data.startswith("cancel_"):
                order_id = data.replace("cancel_", "")
                await execute_order_status_change(order_id, "cancelled", client, bot_token, chat_id, message_id, cb_id)
            elif data.startswith("view_"):
                order_id = data.replace("view_", "")
                if db_admin:
                    doc_snap = db_admin.collection('orders').document(order_id).get()
                    if doc_snap.exists:
                        order_dict = doc_snap.to_dict() or {}
                        order_dict["id"] = order_id
                        st = order_dict.get("status", "pending")
                        eta = order_dict.get("estimatedDeliveryTime")
                        txt = format_order_telegram_message(order_dict, status=st, eta=eta)
                        kb = format_order_telegram_keyboard(order_id, status=st)
                        edit_url = f"https://api.telegram.org/bot{bot_token}/editMessageText"
                        await client.post(edit_url, json={"chat_id": chat_id, "message_id": message_id, "text": txt, "parse_mode": "Markdown", "reply_markup": kb})
                ans_url = f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery"
                await client.post(ans_url, json={"callback_query_id": cb_id})
            elif data.startswith("noop_"):
                ans_url = f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery"
                await client.post(ans_url, json={"callback_query_id": cb_id, "text": "Order is finalized."})
        except Exception as e:
            print(f"Error handling TG callback {data}: {e}")
            traceback.print_exc()
            try:
                ans_url = f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery"
                await client.post(ans_url, json={"callback_query_id": cb_id, "text": "Action failed. Please try again."})
            except: pass

async def handle_telegram_message(message: dict, bot_token: str):
    text = message.get("text", "").strip()
    chat_id = message.get("chat", {}).get("id")
    
    if text.startswith("/eta"):
        parts = text.split(" ", 2)
        if len(parts) >= 3:
            order_id = parts[1].strip()
            eta = parts[2].strip()
            async with httpx.AsyncClient(timeout=15.0) as client:
                await execute_order_status_change(order_id, "shipped", client, bot_token, chat_id=chat_id, eta=eta)
                url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                await client.post(url, json={"chat_id": chat_id, "text": f"✅ Order #{order_id[:8]} ETA set to: {eta}!"})

async def telegram_polling_worker():
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "8601644738:AAG5MMSgR0paQ_wI_ZHkCyy4ekeQL1Sus5Q")
    if not bot_token:
        print("Telegram bot token not configured; polling disabled.")
        return
        
    print("Telegram Polling Worker started successfully...")
    offset = 0
    
    while True:
        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
                params = {"offset": offset, "timeout": 25, "allowed_updates": ["message", "callback_query"]}
                response = await client.get(url, params=params)
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("ok"):
                        updates = data.get("result", [])
                        for update in updates:
                            offset = max(offset, update["update_id"] + 1)
                            if "callback_query" in update:
                                asyncio.create_task(handle_telegram_callback(update["callback_query"], bot_token))
                            elif "message" in update:
                                asyncio.create_task(handle_telegram_message(update["message"], bot_token))
                elif response.status_code == 409:
                    print("Telegram polling conflict (HTTP 409). Sleeping 10s...")
                    await asyncio.sleep(10)
                else:
                    await asyncio.sleep(5)
        except httpx.RequestError:
            await asyncio.sleep(3)
        except Exception as e:
            print(f"Telegram polling loop exception: {e}")
            await asyncio.sleep(5)

class OrderItem(BaseModel):
    productId: str
    name: str
    quantity: int
    price: float

class OrderRequest(BaseModel):
    orderId: str
    orderNumber: Optional[str] = None
    vendorId: str
    vendorName: str
    telegramGroupId: Optional[str]
    customerName: str
    customerPhone: str
    customerAddress: str
    items: List[OrderItem]
    total: float
    userId: Optional[str] = None

@app.post("/api/store/order")
async def process_store_order(order: OrderRequest):
    try:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "8601644738:AAG5MMSgR0paQ_wI_ZHkCyy4ekeQL1Sus5Q")
        order_num = order.orderNumber or order.orderId[:8].upper()
        
        # Construct message & keyboard
        order_dict = {
            "orderNumber": order_num,
            "id": order.orderId,
            "userName": order.customerName,
            "userPhone": order.customerPhone,
            "deliveryAddress": order.customerAddress,
            "vendorName": order.vendorName,
            "totalAmount": order.total,
            "items": [{"productId": i.productId, "name": i.name, "quantity": i.quantity, "price": i.price} for i in order.items]
        }
        
        msg_id = None
        chat_id = order.telegramGroupId

        # Send Telegram message if telegramGroupId is provided
        if order.telegramGroupId:
            try:
                message = format_order_telegram_message(order_dict, status="pending")
                keyboard = format_order_telegram_keyboard(order.orderId, status="pending")
                
                url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                payload = {
                    "chat_id": order.telegramGroupId,
                    "text": message,
                    "parse_mode": "Markdown",
                    "reply_markup": keyboard
                }
                
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(url, json=payload)
                    response_data = response.json()
                    
                if response_data.get("ok"):
                    msg_id = response_data.get("result", {}).get("message_id")
                    chat_id = response_data.get("result", {}).get("chat", {}).get("id") or order.telegramGroupId
                else:
                    print(f"Telegram Send Warning: {response_data}")
            except Exception as te:
                print(f"Failed to send Telegram message: {te}")
        else:
            print(f"No telegramGroupId provided for vendor {order.vendorId}, skipping Telegram dispatch.")
            
        # Save complete order document to Firestore
        if db_admin:
            try:
                order_payload = {
                    "id": order.orderId,
                    "orderNumber": order_num,
                    "userName": order.customerName,
                    "customerName": order.customerName,
                    "userPhone": order.customerPhone,
                    "customerPhone": order.customerPhone,
                    "deliveryAddress": order.customerAddress,
                    "customerAddress": order.customerAddress,
                    "vendorId": order.vendorId,
                    "vendorName": order.vendorName,
                    "totalAmount": order.total,
                    "total": order.total,
                    "userId": order.userId,
                    "items": [{"productId": i.productId, "name": i.name, "quantity": i.quantity, "price": i.price} for i in order.items],
                    "status": "pending",
                    "createdAt": int(time.time() * 1000)
                }
                if msg_id is not None:
                    order_payload["telegramMessageId"] = msg_id
                if chat_id is not None:
                    order_payload["telegramChatId"] = str(chat_id)

                db_admin.collection('orders').document(order.orderId).set(order_payload, merge=True)
            except Exception as e:
                print(f"Failed to record order on Firestore: {e}")
                
        return {
            "success": True, 
            "message": "Order processed successfully",
            "telegramMessageId": msg_id,
            "orderNumber": order_num
        }
        
    except Exception as e:
        print(f"Store Order Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

class OrderStatusUpdateRequest(BaseModel):
    orderId: str
    status: str
    estimatedDeliveryTime: Optional[str] = None
    vendorId: Optional[str] = None
    userId: Optional[str] = None

@app.post("/api/store/order/status")
async def update_order_status_endpoint(req: OrderStatusUpdateRequest):
    try:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "8601644738:AAG5MMSgR0paQ_wI_ZHkCyy4ekeQL1Sus5Q")
        async with httpx.AsyncClient(timeout=15.0) as client:
            await execute_order_status_change(
                order_id=req.orderId,
                new_status=req.status,
                client=client,
                bot_token=bot_token,
                eta=req.estimatedDeliveryTime,
                vendor_id=req.vendorId,
                user_id=req.userId
            )
        return {"success": True, "message": f"Order status updated to {req.status}"}
    except Exception as e:
        print(f"Status update endpoint error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

class RateVendorRequest(BaseModel):
    orderId: str
    vendorId: str
    userId: str
    rating: float
    review: Optional[str] = ""
    notificationId: Optional[str] = None

@app.post("/api/store/rate-vendor")
async def rate_vendor_endpoint(req: RateVendorRequest):
    if not db_admin:
        return JSONResponse(status_code=500, content={"success": False, "error": "Database offline"})
    try:
        now_ms = int(time.time() * 1000)
        user_name = "Valued Customer"
        order_items = []
        
        # 1. Fetch order details & update order document
        if req.orderId:
            try:
                ord_ref = db_admin.collection('orders').document(req.orderId)
                ord_snap = ord_ref.get()
                if ord_snap.exists:
                    ord_data = ord_snap.to_dict() or {}
                    user_name = ord_data.get("userName") or ord_data.get("customerName") or user_name
                    order_items = ord_data.get("items", [])
                ord_ref.set({
                    "rated": True,
                    "rating": float(req.rating),
                    "review": req.review or "",
                    "ratedAt": now_ms
                }, merge=True)
            except Exception as oe:
                print(f"Order rating update failed: {oe}")
        
        # 2. Update notification if provided
        if req.notificationId and req.userId:
            try:
                db_admin.collection('users').document(req.userId).collection('notifications').document(req.notificationId).set({
                    "rated": True,
                    "rating": float(req.rating)
                }, merge=True)
            except Exception as ne:
                print(f"Notification rating update failed: {ne}")
                
        # 3. Create Review Document & Save to root 'reviews' and subcollections
        review_doc = {
            "orderId": req.orderId,
            "vendorId": req.vendorId,
            "userId": req.userId,
            "userName": user_name,
            "rating": float(req.rating),
            "review": req.review or "",
            "createdAt": now_ms
        }
        
        try:
            db_admin.collection('reviews').add(review_doc)
        except Exception as re:
            print(f"Failed to add root review: {re}")
            
        # 4. Save review on each product in the order & update product average rating
        for item in order_items:
            p_id = item.get("productId") if isinstance(item, dict) else getattr(item, "productId", None)
            if p_id:
                try:
                    p_ref = db_admin.collection('products').document(p_id)
                    p_ref.collection('reviews').add(review_doc)
                    
                    p_snap = p_ref.get()
                    if p_snap.exists:
                        p_data = p_snap.to_dict() or {}
                        p_count = int(p_data.get("reviewCount", p_data.get("ratingCount", 0)))
                        p_points = float(p_data.get("totalRatingPoints", (float(p_data.get("rating", 5.0)) * p_count) if p_count > 0 else 0))
                        new_p_count = p_count + 1
                        new_p_points = p_points + float(req.rating)
                        new_p_avg = round(new_p_points / new_p_count, 1)
                        p_ref.set({
                            "rating": new_p_avg,
                            "reviewCount": new_p_count,
                            "ratingCount": new_p_count,
                            "totalRatingPoints": new_p_points,
                            "updatedAt": now_ms
                        }, merge=True)
                except Exception as pe:
                    print(f"Failed to update product review {p_id}: {pe}")

        # 5. Update vendor rating stats safely
        if req.vendorId:
            try:
                v_ref = db_admin.collection('vendors').document(req.vendorId)
                v_snap = v_ref.get()
                v_data = v_snap.to_dict() or {} if v_snap.exists else {}
                cur_count = int(v_data.get("ratingCount", v_data.get("reviewCount", 0)))
                cur_points = float(v_data.get("totalRatingPoints", (float(v_data.get("rating", 5.0)) * cur_count) if cur_count > 0 else 0))
                new_count = cur_count + 1
                new_points = cur_points + float(req.rating)
                avg = round(new_points / new_count, 1)
                v_ref.set({
                    "rating": avg,
                    "ratingCount": new_count,
                    "reviewCount": new_count,
                    "totalRatingPoints": new_points
                }, merge=True)
            except Exception as ve:
                print(f"Failed to update vendor stats: {ve}")
            
        return {"success": True, "message": "Rating and review submitted successfully"}
    except Exception as e:
        print(f"Rate vendor error: {e}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/store/telegram-webhook")
async def telegram_webhook(request: Request):
    try:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "8601644738:AAG5MMSgR0paQ_wI_ZHkCyy4ekeQL1Sus5Q")
        update = await request.json()
        if "callback_query" in update:
            asyncio.create_task(handle_telegram_callback(update["callback_query"], bot_token))
        elif "message" in update:
            asyncio.create_task(handle_telegram_message(update["message"], bot_token))
        return {"ok": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, ws="wsproto", reload=True)


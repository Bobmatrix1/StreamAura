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
    # Startup: Start the periodic cleanup workers
    from websockets.game_sync import start_periodic_cleanup
    from websockets.room_sync import start_periodic_cinema_cleanup
    asyncio.create_task(start_periodic_cleanup())
    asyncio.create_task(start_periodic_cinema_cleanup())
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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, ws="wsproto", reload=True)

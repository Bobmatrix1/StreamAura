import os
import asyncio
import time
import re
import urllib.parse
import uuid
import html
import traceback
from typing import List, Optional, Union
import firebase_admin
from firebase_admin import credentials, messaging, firestore
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel
import yt_dlp
import httpx
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv
from moviebox_api.v1.core import Search as MovieSearch, Session as MovieSession, SubjectType
from moviebox_api.v1 import MovieDetails, DownloadableMovieFilesDetail

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="StreamAura API")

# Initialize Firebase Admin
try:
    # This will look for GOOGLE_APPLICATION_CREDENTIALS env var or use default service account if on GCP
    service_account_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
    if os.path.exists(service_account_path):
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred)
        print(f"--- Firebase Admin Initialized via File: {service_account_path} ---")
    else:
        # 2. Fallback to default credentials (environment variable)
        firebase_admin.initialize_app()
        print("--- Firebase Admin Initialized via Default Credentials ---")
    
    db_admin = firestore.client()
except Exception as e:
    print(f"--- Firebase Admin Initialization Warning: {e} ---")
    print("--- (Broadcast notifications will be disabled until credentials are provided) ---")
    db_admin = None

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Download folder
DOWNLOAD_DIR = "downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Initialize Spotify API
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

sp = None
if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
    try:
        auth_manager = SpotifyClientCredentials(client_id=SPOTIFY_CLIENT_ID, client_secret=SPOTIFY_CLIENT_SECRET)
        sp = spotipy.Spotify(auth_manager=auth_manager)
        print("--- Spotify API Initialized ---")
    except Exception as e:
        print(f"--- Spotify API Initialization Failed: {e} ---")

class ExtractRequest(BaseModel):
    url: str

# Global state for background downloads
download_tasks = {}
download_events = {}

# =========================
# HELPERS
# =========================
def get_val(obj, key, default=None):
    if obj is None: return default
    if isinstance(obj, dict): return obj.get(key, default)
    return getattr(obj, key, default)

def get_cover_url(item):
    cover = get_val(item, 'cover')
    if not cover: return ""
    if isinstance(cover, dict): return cover.get('url', '')
    return getattr(cover, 'url', '')

def get_release_year(item):
    rd = get_val(item, 'releaseDate')
    if not rd: return "N/A"
    if isinstance(rd, str): return rd.split('-')[0]
    if hasattr(rd, 'year'): return str(rd.year)
    return "N/A"

def get_duration_str(item):
    duration = get_val(item, 'duration')
    if duration is None: return "N/A"
    if isinstance(duration, str):
        if 'm' in duration or 'h' in duration: return duration
        try:
            duration = int(duration)
        except:
            return duration
    try:
        mins = int(duration) // 60
        return f"{mins}m" if mins > 0 else "Series"
    except:
        return "Series"

def get_genres_list(item):
    genres = get_val(item, 'genre')
    if not genres: return []
    if isinstance(genres, list): return genres
    return str(genres).split(',')

def safe_quote(text: Optional[str]) -> str:
    if not text: return ""
    return urllib.parse.quote(str(text))

def format_size(size_bytes):
    if not size_bytes: return "Unknown"
    try:
        size_bytes = float(size_bytes)
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"
    except:
        return "Unknown"

# =========================
# ENDPOINTS
# =========================

@app.get("/api/stream")
async def stream_video(url: str, request: Request, referer: Optional[str] = None):
    active_referer = referer if referer else "https://fmoviesunblocked.net/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Referer": active_referer,
        "Accept": "*/*"
    }
    
    range_header = request.headers.get("Range")
    if range_header:
        headers["Range"] = range_header

    try:
        client = httpx.AsyncClient(follow_redirects=True, timeout=None)
        # Use a single-pass streaming request for instant playback
        source_req = client.build_request("GET", url, headers=headers)
        source_resp = await client.send(source_req, stream=True)

        async def stream_generator():
            try:
                # Small 16KB chunks initially for fast metadata loading, then 128KB for stability
                async for chunk in source_resp.aiter_bytes(chunk_size=16384):
                    yield chunk
            finally:
                await source_resp.aclose()
                await client.aclose()

        response_headers = {
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Content-Type": source_resp.headers.get("content-type", "video/mp4")
        }
        
        # Pass through length and range headers if they exist
        for key in ["content-length", "content-range"]:
            if key in source_resp.headers:
                response_headers[key] = source_resp.headers[key]

        return StreamingResponse(
            stream_generator(),
            status_code=source_resp.status_code,
            headers=response_headers
        )
    except Exception as e:
        print(f"Streaming Error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": "Stream initialization failed"})

@app.post("/api/extract")
async def extract_info(request: ExtractRequest):
    url = request.url.strip()
    ydl_opts = {'quiet': True, 'no_warnings': True, 'nocheckcertificate': True, 'user_agent': 'Mozilla/5.0'}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, lambda: ydl.extract_info(url, download=False))
            formats = []
            for f in info.get("formats", []):
                if not f.get("url"): continue
                formats.append({"quality": f.get("format_note", "Standard"), "format": f.get("ext", "mp4").upper(), "resolution": f"{f.get('width','?')}x{f.get('height','?')}", "size": format_size(f.get('filesize') or f.get('filesize_approx') or 0), "url": f.get("url")})
            return {"success": True, "data": {"id": str(info.get("id")), "url": url, "title": info.get("title", "Unknown Media"), "thumbnail": info.get("thumbnail"), "duration": f"{int(info.get('duration', 0)) // 60}:{int(info.get('duration', 0)) % 60:02d}", "author": info.get("uploader", "Unknown"), "platform": info.get("extractor_key", "Video"), "mediaType": "video", "qualities": formats[:10]}}
    except Exception as e: return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.get("/api/download")
async def download_video(url: str, background_tasks: BackgroundTasks, filename: str = "video.mp4", quality: str = "best", referer: Optional[str] = None):
    file_id = str(uuid.uuid4())
    temp_path = os.path.join(DOWNLOAD_DIR, f"{file_id}.mp4")
    ydl_opts = {'format': 'bestvideo+bestaudio/best', 'outtmpl': temp_path, 'quiet': True, 'user_agent': 'Mozilla/5.0'}
    if referer: ydl_opts['referer'] = referer
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            loop = asyncio.get_event_loop()
            await asyncio.wait_for(loop.run_in_executor(None, lambda: ydl.download([url])), timeout=180.0)
        background_tasks.add_task(os.remove, temp_path)
        return FileResponse(path=temp_path, filename=filename)
    except Exception as e:
        if os.path.exists(temp_path): os.remove(temp_path)
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/admin/broadcast")
async def broadcast_notification(request: Request):
    if not db_admin:
        return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Admin not initialized"})
    
    data = await request.json()
    title = data.get('title')
    message = data.get('message')
    
    if not title or not message:
        raise HTTPException(status_code=400, detail="Title and message required")

    try:
        # 1. Get all users
        users_ref = db_admin.collection('users')
        users_docs = users_ref.stream()
        
        tokens = []
        user_ids = []
        
        for doc in users_docs:
            u_data = doc.to_dict()
            user_ids.append(doc.id)
            if u_data.get('fcmToken'):
                tokens.append(u_data.get('fcmToken'))

        # 2. Add notification to each user's inbox in Firestore (Batch)
        # Firestore batch has a limit of 500 operations
        for i in range(0, len(user_ids), 500):
            batch = db_admin.batch()
            chunk = user_ids[i:i + 500]
            for uid in chunk:
                notif_ref = db_admin.collection('users').document(uid).collection('notifications').document()
                batch.set(notif_ref, {
                    "title": title,
                    "message": message,
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "read": False,
                    "type": "update"
                })
            batch.commit()

        # 3. Send Push Notification to devices
        if tokens:
            # FCM multicast also limited to 500 tokens at a time
            for j in range(0, len(tokens), 500):
                token_chunk = tokens[j:j + 500]
                message_obj = messaging.MulticastMessage(
                    notification=messaging.Notification(
                        title=title,
                        body=message,
                    ),
                    data={
                        "url": "/notifications",
                        "unreadCount": "1"
                    },
                    tokens=token_chunk,
                )
                messaging.send_each_for_multicast(message_obj)

        return {"success": True, "delivered_to": len(user_ids)}
    except Exception as e:
        print(f"Broadcast Error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.delete("/api/admin/notifications/clear")
async def clear_all_notifications():
    if not db_admin:
        return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Admin not initialized"})
    
    try:
        users_ref = db_admin.collection('users')
        users_docs = users_ref.stream()
        
        cleared_count = 0
        for user_doc in users_docs:
            notifs_ref = users_ref.document(user_doc.id).collection('notifications')
            notifs = notifs_ref.stream()
            
            # Use batches for large collections
            batch = db_admin.batch()
            count = 0
            for n in notifs:
                batch.delete(n.reference)
                count += 1
                cleared_count += 1
                if count >= 400: # Firestore batch limit safety
                    batch.commit()
                    batch = db_admin.batch()
                    count = 0
            batch.commit()
            
        return {"success": True, "total_cleared": cleared_count}
    except Exception as e:
        print(f"Clear All Error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/movies/download/start")
async def start_movie_download(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    url, title, quality, subject_id = data.get('url'), data.get('title', 'media'), data.get('quality', 'BEST'), data.get('subject_id')
    referer = data.get('referer', 'https://fmoviesunblocked.net/')
    media_type, season, episode = data.get('mediaType', 'movie'), data.get('season'), data.get('episode')
    task_id = str(uuid.uuid4())
    resume_event = asyncio.Event()
    resume_event.set()
    download_events[task_id] = resume_event
    download_tasks[task_id] = {"progress": 0, "status": "preparing", "stage": "Downloading...", "filename": f"{title}.mp4", "path": None, "error": None, "paused": False}
    async def run_download():
        try:
            from moviebox_api.v1.cli import Downloader
            from moviebox_api.v1 import DownloadTracker
            q_map = {'1080p': '1080P', '720p': '720P', '480p': '480P', '360p': '360P'}
            target_q = q_map.get(quality.lower(), 'BEST')
            async def progress_hook(tracker: DownloadTracker):
                if not download_events[task_id].is_set():
                    await download_events[task_id].wait()
                if tracker.expected_size > 5 * 1024 * 1024:
                    p = round((tracker.downloaded_size / tracker.expected_size) * 100, 1)
                    if p > download_tasks[task_id]["progress"]: download_tasks[task_id]["progress"] = p
                    download_tasks[task_id]["status"] = "downloading"
            downloader = Downloader()
            downloaded_file = None
            search_query = subject_id if subject_id else title
            try:
                if media_type == "series" and season and episode:
                    results = await downloader.download_tv_series(title, season=int(season), episode=int(episode), limit=1, yes=True, quality=target_q, dir=DOWNLOAD_DIR, progress_hook=progress_hook)
                    for s_val in results.values():
                        for e_val in s_val.values():
                            if isinstance(e_val, dict) and 'video' in e_val:
                                downloaded_file = e_val['video']
                                break
                else: downloaded_file, _ = await downloader.download_movie(search_query, yes=True, quality=target_q, dir=DOWNLOAD_DIR, progress_hook=progress_hook)
            except Exception: pass
            if downloaded_file and hasattr(downloaded_file, 'saved_to'):
                download_tasks[task_id]["status"], download_tasks[task_id]["progress"], download_tasks[task_id]["path"] = "completed", 100, str(downloaded_file.saved_to)
            else: raise Exception("Download failed.")
        except Exception as e: download_tasks[task_id]["status"], download_tasks[task_id]["error"] = "error", str(e)
        finally:
            if task_id in download_events: del download_events[task_id]
    background_tasks.add_task(run_download)
    return {"success": True, "task_id": task_id}

@app.post("/api/movies/download/pause/{task_id}")
async def pause_movie_download(task_id: str):
    if task_id in download_events:
        event = download_events[task_id]
        if event.is_set():
            event.clear()
            download_tasks[task_id]["paused"] = True
            return {"success": True, "paused": True}
        else:
            event.set()
            download_tasks[task_id]["paused"] = False
            return {"success": True, "paused": False}
    return JSONResponse(status_code=404, content={"success": False, "error": "Not found"})

@app.get("/api/movies/download/status/{task_id}")
async def get_download_status(task_id: str):
    if task_id not in download_tasks: return JSONResponse(status_code=404, content={"success": False, "error": "Not found"})
    return {"success": True, "data": download_tasks[task_id]}

@app.get("/api/movies/download/file/{task_id}")
async def get_movie_file(task_id: str, background_tasks: BackgroundTasks):
    if task_id not in download_tasks or download_tasks[task_id]["status"] != "completed": raise HTTPException(status_code=400, detail="Not ready")
    path, filename = download_tasks[task_id]["path"], download_tasks[task_id]["filename"]
    def cleanup():
        try:
            if os.path.exists(path): os.remove(path)
            if task_id in download_tasks: del download_tasks[task_id]
        except: pass
    background_tasks.add_task(cleanup)
    return FileResponse(path=path, filename=filename)

@app.delete("/api/movies/download/{task_id}")
async def cancel_movie_download(task_id: str):
    if task_id in download_tasks:
        download_tasks[task_id]["status"] = "cancelled"
        if task_id in download_events: download_events[task_id].set()
        return {"success": True}
    return JSONResponse(status_code=404, content={"success": False, "error": "Not found"})

@app.get("/api/movies/search")
async def search_movies(query: str, media_type: str = Query("movie", alias="type")):
    try:
        client_session = MovieSession()
        subject_type = SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES
        try: results = await MovieSearch(client_session, query, subject_type=subject_type).get_content()
        except Exception as e:
            if "Search yielded empty results" in str(e): return {"success": True, "data": []}
            raise e
        formatted = []
        for item in results.get('items', []):
            rd = get_val(item, 'releaseDate')
            formatted.append({"id": str(get_val(item, 'subjectId')), "title": get_val(item, 'title'), "thumbnail": get_cover_url(item), "year": rd.split('-')[0] if isinstance(rd, str) else str(getattr(rd, 'year', 'N/A')) if rd else 'N/A', "rating": get_val(item, 'imdbRatingValue', 'N/A'), "duration": get_duration_str(item), "genres": get_genres_list(item), "mediaType": media_type, "platform": "MovieBox"})
        return {"success": True, "data": formatted}
    except Exception as e: return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None, season: Optional[int] = None, episode: Optional[int] = None):
    try:
        client_session = MovieSession()
        subject_type = SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES
        search_model = await MovieSearch(client_session, title if title else subject_id, subject_type=subject_type).get_content_model()
        items = getattr(search_model, 'items', getattr(search_model, 'list', []))
        target_item = next((m for m in items if str(getattr(m, 'subjectId', '')) == subject_id), items[0] if items else None)
        if not target_item: raise Exception("Not found")
        if media_type == "series":
            from moviebox_api.v1 import TVSeriesDetails, DownloadableTVSeriesFilesDetail
            ts_instance = TVSeriesDetails(target_item, client_session)
            details_raw = await ts_instance.get_content()
            res_data = details_raw.get('resData', {})
            resource = get_val(res_data, 'resource', {})
            if isinstance(resource, list) and len(resource) > 0: resource = resource[0]
            seasons_info, total_episodes = [], 0
            for s in get_val(resource, 'seasons', []):
                ep_str = str(get_val(s, 'allEp', ''))
                valid_eps = [int(ep) for ep in ep_str.split(',') if ep.strip()] if ep_str.strip() else list(range(1, int(get_val(s, 'maxEp', 0)) + 1))
                total_episodes += len(valid_eps)
                seasons_info.append({"season": int(get_val(s, 'se', 0)), "episodes": valid_eps})
            f_q = []
            if season and episode:
                ts_model = await ts_instance.get_content_model()
                downloader = DownloadableTVSeriesFilesDetail(client_session, ts_model)
                files = await downloader.get_content(episode=episode, season=season)
                for d in files.get('downloads', []): f_q.append({"quality": f"{d.get('resolution')}p", "resolution": f"{d.get('resolution')}p", "format": "MP4", "size": format_size(d.get('size', 0)), "url": d.get('url')})
            dur = get_duration_str(target_item)
            if dur in ["Series", "N/A", "0m"]: dur = f"{total_episodes} Episodes"
            return {"success": True, "data": {"id": subject_id, "title": get_val(res_data.get('metadata', {}), 'title', get_val(target_item, 'title')), "description": get_val(res_data.get('metadata', {}), 'description', ''), "thumbnail": get_val(res_data.get('metadata', {}), 'image', get_cover_url(target_item)), "year": get_release_year(target_item), "rating": get_val(target_item, 'imdbRatingValue', 'N/A'), "duration": dur, "genres": get_genres_list(target_item), "qualities": f_q, "seasons": seasons_info, "mediaType": "series", "platform": "MovieBox", "referer": res_data.get('referer', 'https://fmoviesunblocked.net/')}}
        else:
            md_instance = MovieDetails(target_item, client_session)
            details_raw = await md_instance.get_content()
            res_data = details_raw.get('resData', {})
            metadata = res_data.get('metadata', {})
            md_model = await md_instance.get_content_model()
            df = DownloadableMovieFilesDetail(client_session, md_model)
            files = await df.get_content()
            f_q = []
            for d in files.get('downloads', []): f_q.append({"quality": f"{d.get('resolution')}p", "resolution": f"{d.get('resolution')}p", "format": "MP4", "size": format_size(d.get('size', 0)), "url": d.get('url')})
            return {"success": True, "data": {"id": subject_id, "title": get_val(metadata, 'title', get_val(target_item, 'title')), "description": get_val(metadata, 'description', ''), "thumbnail": get_val(metadata, 'image', get_cover_url(target_item)), "year": get_release_year(target_item), "rating": get_val(target_item, 'imdbRatingValue', 'N/A'), "duration": get_duration_str(target_item), "genres": get_genres_list(target_item), "qualities": f_q, "mediaType": "movie", "platform": "MovieBox", "referer": res_data.get('referer', 'https://fmoviesunblocked.net/')}}
    except Exception as e: return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

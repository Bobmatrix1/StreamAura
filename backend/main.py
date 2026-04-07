import os
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
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel
import yt_dlp
import httpx
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from dotenv import load_dotenv
from bs4 import BeautifulSoup
from moviebox_api.v1.core import Search as MovieSearch, Session as MovieSession, SubjectType
from moviebox_api.v1 import MovieDetails, DownloadableMovieFilesDetail

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="StreamAura API")

# =========================
# FZMOVIES CUSTOM ENGINE (To avoid Pydantic conflicts)
# =========================
class FzMoviesScraper:
    def __init__(self):
        self.base_url = "https://fzmovies.net"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Referer": "https://fzmovies.net/"
        }

    async def search(self, query: str):
        url = f"{self.base_url}/search.php?searchname={urllib.parse.quote(query)}&Search=Search"
        async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=15.0) as client:
            resp = await client.get(url)
            soup = BeautifulSoup(resp.text, 'html.parser')
            results = []
            # FzMovies search results are usually in tables or specific div classes
            for row in soup.select('table.table.table-striped tr'):
                link = row.select_one('a')
                if link and 'movie' in link.get('href', ''):
                    results.append({
                        "title": link.text.strip(),
                        "url": f"{self.base_url}/{link.get('href')}" if not link.get('href').startswith('http') else link.get('href')
                    })
            return results

    async def get_download_links(self, movie_url: str):
        async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=15.0) as client:
            # Step 1: Get the movie page
            resp = await client.get(movie_url)
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            # Step 2: Find the 'Download' link which leads to the quality selection
            dl_link = soup.select_one('a[href*="download.php"]')
            if not dl_link: return []
            
            dl_url = f"{self.base_url}/{dl_link.get('href')}" if not dl_link.get('href').startswith('http') else dl_link.get('href')
            
            # Step 3: Get the selection page
            resp = await client.get(dl_url)
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            links = []
            # FzMovies usually shows High/Medium/Low links
            # We look for links that look like download buttons
            for a in soup.select('a.btn.btn-primary, a[href*="getdownload.php"]'):
                links.append({
                    "quality": a.text.strip() or "Standard Quality",
                    "url": f"{self.base_url}/{a.get('href')}" if not a.get('href').startswith('http') else a.get('href')
                })
            return links

fz_scraper = FzMoviesScraper()

# Initialize Firebase Admin
try:
    service_account_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
    if os.path.exists(service_account_path):
        cred = credentials.Certificate(service_account_path)
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()
    db_admin = firestore.client()
except Exception as e:
    print(f"--- Firebase Admin Initialization Warning: {e} ---")
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

# Download folder - Use /tmp for Vercel compatibility
DOWNLOAD_DIR = "/tmp/downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Background Cleanup Task - Simplified for Serverless
async def cleanup_old_files():
    try:
        now = time.time()
        max_age = 2 * 3600 
        if os.path.exists(DOWNLOAD_DIR):
            for f in os.listdir(DOWNLOAD_DIR):
                f_path = os.path.join(DOWNLOAD_DIR, f)
                if os.path.isfile(f_path):
                    if (now - os.path.getmtime(f_path)) > max_age:
                        os.remove(f_path)
    except: pass

@app.on_event("startup")
async def startup_event():
    await cleanup_old_files()

# Initialize Spotify API
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

sp = None
if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
    try:
        auth_manager = SpotifyClientCredentials(client_id=SPOTIFY_CLIENT_ID, client_secret=SPOTIFY_CLIENT_SECRET)
        sp = spotipy.Spotify(auth_manager=auth_manager)
    except Exception as e:
        print(f"--- Spotify API Initialization Failed: {e} ---")

class ExtractRequest(BaseModel):
    url: str

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
        try: duration = int(duration)
        except: return duration
    try:
        mins = int(duration) // 60
        return f"{mins}m" if mins > 0 else "Series"
    except: return "Series"

def get_genres_list(item):
    genres = get_val(item, 'genre')
    if not genres: return []
    if isinstance(genres, list): return genres
    return str(genres).split(',')

def format_size(size_bytes):
    if not size_bytes: return "Unknown"
    try:
        size_bytes = float(size_bytes)
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024: return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"
    except: return "Unknown"

# =========================
# ENDPOINTS
# =========================

@app.get("/api/stream")
async def stream_video(url: str, request: Request, referer: Optional[str] = None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Referer": referer if referer else "https://fmoviesunblocked.net/",
        "Accept": "*/*"
    }
    range_header = request.headers.get("Range")
    if range_header: headers["Range"] = range_header
    try:
        client = httpx.AsyncClient(follow_redirects=True, timeout=None)
        source_req = client.build_request("GET", url, headers=headers)
        source_resp = await client.send(source_req, stream=True)
        async def stream_generator():
            try:
                async for chunk in source_resp.aiter_bytes(chunk_size=16384): yield chunk
            finally:
                await source_resp.aclose()
                await client.aclose()
        response_headers = {"Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*", "Content-Type": source_resp.headers.get("content-type", "video/mp4")}
        for key in ["content-length", "content-range"]:
            if key in source_resp.headers: response_headers[key] = source_resp.headers[key]
        return StreamingResponse(stream_generator(), status_code=source_resp.status_code, headers=response_headers)
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": "Stream failed"})

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
            if url and (url.startswith('http') or url.startswith('https')):
                download_tasks[task_id]["status"] = "downloading"
                file_path = os.path.join(DOWNLOAD_DIR, f"{title}_{task_id[:8]}.mp4")
                download_tasks[task_id]["path"] = file_path
                headers = {"User-Agent": "Mozilla/5.0", "Referer": referer, "Accept": "*/*"}
                async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
                    async with client.stream("GET", url, headers=headers) as response:
                        if response.status_code >= 400: raise Exception(f"Server error {response.status_code}")
                        total_size = int(response.headers.get("Content-Length", 0))
                        downloaded = 0
                        with open(file_path, "wb") as f:
                            async for chunk in response.aiter_bytes(chunk_size=128 * 1024):
                                if not download_events[task_id].is_set():
                                    download_tasks[task_id]["status"] = "paused"
                                    await download_events[task_id].wait()
                                    download_tasks[task_id]["status"] = "downloading"
                                if download_tasks[task_id]["status"] == "cancelled":
                                    f.close()
                                    if os.path.exists(file_path): os.remove(file_path)
                                    return
                                f.write(chunk)
                                downloaded += len(chunk)
                                if total_size > 0:
                                    p = round((downloaded / total_size) * 100, 1)
                                    if p > download_tasks[task_id]["progress"]: download_tasks[task_id]["progress"] = p
                download_tasks[task_id]["status"], download_tasks[task_id]["progress"], download_tasks[task_id]["completed_at"] = "completed", 100, time.time()
                return
            # Fallback to search if needed...
        except Exception as e: 
            download_tasks[task_id]["status"], download_tasks[task_id]["error"], download_tasks[task_id]["completed_at"] = "error", str(e), time.time()
        finally:
            if task_id in download_events: del download_events[task_id]
    background_tasks.add_task(run_download)
    return {"success": True, "data": {"task_id": task_id}}

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

@app.get("/")
async def root_health_check():
    return {"status": "online", "service": "StreamAura Backend", "timestamp": time.time()}

@app.get("/api/movies/search")
async def search_movies(query: str, media_type: str = Query("movie", alias="type")):
    try:
        client_session = MovieSession()
        subject_type = SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES
        search_model = await MovieSearch(client_session, query, subject_type=subject_type).get_content()
        formatted = []
        if search_model and 'items' in search_model:
            for item in search_model.get('items', []):
                rd = get_val(item, 'releaseDate')
                formatted.append({
                    "id": str(get_val(item, 'subjectId')), 
                    "title": get_val(item, 'title'), 
                    "thumbnail": get_cover_url(item), 
                    "year": rd.split('-')[0] if isinstance(rd, str) else 'N/A', 
                    "rating": get_val(item, 'imdbRatingValue', 'N/A'), 
                    "duration": get_duration_str(item), 
                    "mediaType": media_type, 
                    "platform": "MovieBox"
                })
        return {"success": True, "data": formatted}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/api/movies/details")
async def get_movie_details(subject_id: str, media_type: str = Query("movie", alias="type"), title: Optional[str] = None, season: Optional[int] = None, episode: Optional[int] = None):
    try:
        # 1. TRY FZMOVIES (SCRAPER)
        if media_type == "movie" and title:
            try:
                fz_results = await fz_scraper.search(title)
                if fz_results:
                    best_match = fz_results[0]
                    for res in fz_results:
                        if title.lower() in res['title'].lower():
                            best_match = res
                            break
                    
                    fz_links = await fz_scraper.get_download_links(best_match['url'])
                    f_q = [{"quality": l['quality'], "resolution": "HD", "format": "MP4", "size": "Unknown", "url": l['url']} for l in fz_links]
                    
                    if f_q:
                        return {"success": True, "data": {"id": subject_id, "title": title, "thumbnail": "", "year": "N/A", "rating": "N/A", "duration": "N/A", "genres": [], "qualities": f_q, "mediaType": "movie", "platform": "FzMovies", "referer": "https://fzmovies.net/"}}
            except Exception as e: print(f"FzScraper Error: {e}")

        # 2. FALLBACK TO MOVIEBOX (STEALTH)
        client_session = MovieSession()
        if hasattr(client_session, '_client'):
            client_session._client.headers.update({"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "X-Requested-With": "com.moviebox.h5"})
        
        warmup = MovieSearch(client_session, title or subject_id, subject_type=SubjectType.TV_SERIES if media_type == "series" else SubjectType.MOVIES)
        search_model = await warmup.get_content_model()
        items = getattr(search_model, 'items', getattr(search_model, 'list', []))
        target_item = next((m for m in items if str(getattr(m, 'subjectId', '')) == subject_id), items[0] if items else None)
        
        if media_type == "series":
            from moviebox_api.v1 import TVSeriesDetails, DownloadableTVSeriesFilesDetail
            ts_instance = TVSeriesDetails(target_item, client_session)
            details_raw = await ts_instance.get_content()
            res_data = details_raw.get('resData', {})
            resource = get_val(res_data, 'resource', {})
            if isinstance(resource, list) and len(resource) > 0: resource = resource[0]
            seasons_info = [{"season": int(get_val(s, 'se', 0)), "episodes": list(range(1, int(get_val(s, 'maxEp', 0)) + 1))} for s in get_val(resource, 'seasons', [])]
            f_q = []
            if season and episode:
                ts_model = await ts_instance.get_content_model()
                df = DownloadableTVSeriesFilesDetail(client_session, ts_model)
                files = await df.get_content(episode=episode, season=season)
                for d in files.get('downloads', []): f_q.append({"quality": f"{d.get('resolution')}p", "resolution": f"{d.get('resolution')}p", "format": "MP4", "size": format_size(d.get('size', 0)), "url": d.get('url')})
            return {"success": True, "data": {"id": subject_id, "title": title, "thumbnail": get_cover_url(target_item), "year": "N/A", "rating": "N/A", "duration": "N/A", "genres": [], "qualities": f_q, "seasons": seasons_info, "mediaType": "series", "platform": "MovieBox", "referer": "https://h5.aoneroom.com/"}}
        else:
            md_instance = MovieDetails(target_item, client_session)
            md_model = await md_instance.get_content_model()
            df = DownloadableMovieFilesDetail(client_session, md_model)
            files = await df.get_content()
            f_q = [{"quality": f"{d.get('resolution')}p", "resolution": f"{d.get('resolution')}p", "format": "MP4", "size": format_size(d.get('size', 0)), "url": d.get('url')} for d in files.get('downloads', [])]
            return {"success": True, "data": {"id": subject_id, "title": title, "thumbnail": get_cover_url(target_item), "year": "N/A", "rating": "N/A", "duration": "N/A", "genres": [], "qualities": f_q, "mediaType": "movie", "platform": "MovieBox", "referer": "https://h5.aoneroom.com/"}}
    except Exception as e: return JSONResponse(status_code=403, content={"success": False, "error": str(e)})

@app.get("/api/analytics/country")
async def get_visitor_country(request: Request): return {"country": "Unknown", "device": "Desktop"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

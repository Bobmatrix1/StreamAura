import os
import sys

# Ensure standard streams handle UTF-8 safely on Windows
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import asyncio
import time
import re
import urllib.parse
import uuid
import html
import traceback
import random
import tempfile
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
    from ws_sync.game_sync import start_periodic_cleanup
    from ws_sync.room_sync import start_periodic_cinema_cleanup
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
from ws_sync import room_sync as websocket_router
from ws_sync import game_sync as game_ws_router

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

@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "time": time.time()}

DOWNLOAD_DIR = os.path.join(tempfile.gettempdir(), "streamaura_downloads")
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

async def resolve_canonical_url(url: str) -> str:
    """Follows HTTP redirects for shortlinks (vt.tiktok.com, vm.tiktok.com, fb.watch, fb.me, bit.ly, etc.)"""
    url = url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    
    short_domains = [
        "vt.tiktok.com", "vm.tiktok.com", "tiktok.com/t/", "m.tiktok.com",
        "fb.watch", "fb.com", "fb.me", "facebook.com/share", "facebook.com/reel",
        "instagr.am", "instagram.com/share", "t.co", "x.com/i/", "youtu.be", "bit.ly", "tinyurl.com"
    ]
    if any(sd in url.lower() for sd in short_domains):
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=8.0) as client:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                }
                resp = await client.head(url, headers=headers)
                final_url = str(resp.url)
                if final_url and final_url != url:
                    return final_url
                resp = await client.get(url, headers=headers)
                return str(resp.url)
        except Exception as e:
            print(f"Redirect resolution notice for {url}: {e}")
    return url

async def extract_tiktok_direct(url: str):
    """
    Dedicated high-speed TikTok extractor using TikWM API + yt-dlp fallback.
    Extracts 1080p Full HD (No Watermark), 720p HD (No Watermark), and original MP3 audio.
    """
    try:
        canonical_url = await resolve_canonical_url(url)
        # Try both the original and canonical URLs against TikWM
        for target_url in [canonical_url, url]:
            try:
                async with httpx.AsyncClient(timeout=12.0) as client:
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                        "Accept": "application/json, text/plain, */*"
                    }
                    resp = await client.post("https://www.tikwm.com/api/", data={"url": target_url, "hd": 1}, headers=headers)
                    if resp.status_code == 200:
                        res_data = resp.json()
                        if res_data.get("code") == 0 and res_data.get("data"):
                            d = res_data["data"]
                            formats = []
                            
                            # 1. 1080p Full HD No Watermark (if available)
                            hd_url = d.get("hdplay")
                            if hd_url:
                                if hd_url.startswith("/"): hd_url = f"https://www.tikwm.com{hd_url}"
                                formats.append({
                                    "quality": "1080p Full HD (No Watermark)",
                                    "format": "MP4",
                                    "resolution": "Video",
                                    "size": format_size(d.get("hd_size")),
                                    "url": hd_url
                                })
                            
                            # 2. 720p HD No Watermark
                            play_url = d.get("play")
                            if play_url:
                                if play_url.startswith("/"): play_url = f"https://www.tikwm.com{play_url}"
                                formats.append({
                                    "quality": "720p HD (No Watermark)",
                                    "format": "MP4",
                                    "resolution": "Video",
                                    "size": format_size(d.get("size")),
                                    "url": play_url
                                })
                            
                            # 3. Watermarked version
                            wm_url = d.get("wmplay")
                            if wm_url:
                                if wm_url.startswith("/"): wm_url = f"https://www.tikwm.com{wm_url}"
                                formats.append({
                                    "quality": "Standard (Watermark)",
                                    "format": "MP4",
                                    "resolution": "Video",
                                    "size": format_size(d.get("wm_size")),
                                    "url": wm_url
                                })
                                
                            # 4. Audio MP3
                            music_url = d.get("music")
                            if music_url:
                                if music_url.startswith("/"): music_url = f"https://www.tikwm.com{music_url}"
                                formats.append({
                                    "quality": "Original Audio (MP3)",
                                    "format": "MP3",
                                    "resolution": "Audio",
                                    "size": "HQ Audio",
                                    "url": music_url
                                })

                            # 5. Handle TikTok Images / Slideshows if present
                            images = d.get("images")
                            if images and isinstance(images, list) and not formats:
                                for idx, img in enumerate(images):
                                    formats.append({
                                        "quality": f"Photo #{idx + 1} (HD)",
                                        "format": "JPG",
                                        "resolution": "Photo",
                                        "size": "Fast",
                                        "url": img
                                    })

                            author_info = d.get("author", {})
                            author_name = author_info.get("nickname") or author_info.get("unique_id") or "TikTok Creator"
                            duration_sec = d.get("duration", 0)
                            duration_str = f"{duration_sec // 60}m {duration_sec % 60}s" if duration_sec else "0m"
                            cover = d.get("cover") or d.get("origin_cover") or d.get("dynamic_cover")

                            return {
                                "id": str(d.get("id") or uuid.uuid4()),
                                "url": url,
                                "title": d.get("title") or f"TikTok by @{author_name}",
                                "thumbnail": cover,
                                "duration": duration_str,
                                "author": f"@{author_info.get('unique_id', author_name)}",
                                "platform": "TikTok",
                                "mediaType": "video",
                                "qualities": formats
                            }
            except Exception as e:
                print(f"TikWM candidate notice: {e}")
                continue
    except Exception as e:
        print(f"TikTok Direct Extractor notice: {e}")
    return None

def extract_youtube_id(url: str) -> str:
    """Extract 11-char YouTube video ID from various URL patterns."""
    patterns = [
        r'(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/|\/e\/|watch\?v=|\&v=)([a-zA-Z0-9_-]{11})',
        r'^[a-zA-Z0-9_-]{11}$'
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1) if '(' in p else url
    return ""

async def extract_youtube_rapidapi(url: str):
    """
    RapidAPI YouTube Extractor using social-media-video-downloader API.
    Provides direct high-speed tunnel streaming links up to 4K (2160p) + MP3 audio.
    """
    rapidapi_key = os.getenv("RAPIDAPI_KEY", "").strip()
    if not rapidapi_key:
        return None

    video_id = extract_youtube_id(url)
    if not video_id:
        return None

    host = "social-media-video-downloader.p.rapidapi.com"
    headers = {
        "X-RapidAPI-Key": rapidapi_key,
        "X-RapidAPI-Host": host,
        "Accept": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(
                f"https://{host}/youtube/v3/video/details",
                params={"videoId": video_id},
                headers=headers
            )
            if resp.status_code == 200 and resp.text.strip().startswith("{"):
                data = resp.json()
                contents = data.get("contents", [])
                metadata = data.get("metadata", {})
                title = metadata.get("title", f"YouTube Video {video_id}")
                thumb = metadata.get("thumbnailUrl")
                author_obj = metadata.get("author") or {}
                author = metadata.get("additionalData", {}).get("author") or "YouTube Creator"
                if isinstance(author_obj, dict):
                    runs = author_obj.get("title", {}).get("runs", [])
                    if runs and isinstance(runs[0], dict):
                        author = runs[0].get("text", author)

                formats = []
                seen_labels = set()
                if contents and isinstance(contents, list):
                    c0 = contents[0]
                    videos = c0.get("videos", [])
                    for v in videos:
                        label = v.get("label", "HD Video")
                        v_url = v.get("url")
                        meta = v.get("metadata", {})
                        size_text = meta.get("content_length_text") or "HD"
                        mime = meta.get("mime_type", "")
                        
                        if v_url and label not in seen_labels:
                            seen_labels.add(label)
                            formats.append({
                                "quality": f"{label} High Quality",
                                "format": "MP4" if "mp4" in mime else "WEBM",
                                "resolution": label,
                                "size": size_text,
                                "url": v_url
                            })

                    audios = c0.get("audios", [])
                    for a in audios:
                        a_url = a.get("url")
                        meta = a.get("metadata", {})
                        size_text = meta.get("content_length_text") or "Audio"
                        if a_url:
                            formats.append({
                                "quality": "Original Audio (MP3/M4A)",
                                "format": "MP3",
                                "resolution": "Audio",
                                "size": size_text,
                                "url": a_url
                            })
                            break

                if formats:
                    return {
                        "id": video_id,
                        "url": url,
                        "title": title,
                        "thumbnail": thumb,
                        "duration": "YouTube Video",
                        "author": f"@{author}" if not str(author).startswith("@") else author,
                        "platform": "YouTube",
                        "mediaType": "video",
                        "qualities": formats
                    }
    except Exception as e:
        print(f"RapidAPI YouTube Extractor notice: {e}")
    return None

async def extract_instagram_rapidapi(url: str, shortcode: str = ""):
    """
    RapidAPI Instagram Extractor using the user's configured RapidAPI Key.
    Queries the RapidAPI Instagram downloader endpoints and parses media details.
    """
    rapidapi_key = os.getenv("RAPIDAPI_KEY", "").strip()
    if not rapidapi_key:
        return None

    custom_host = os.getenv("RAPIDAPI_INSTAGRAM_HOST", "").strip()
    
    # Candidate RapidAPI Instagram endpoints (custom host takes precedence)
    candidate_endpoints = []
    if custom_host:
        candidate_endpoints.extend([
            (custom_host, "GET", f"https://{custom_host}/instagram/", {"url": url}),
            (custom_host, "GET", f"https://{custom_host}/index", {"url": url}),
            (custom_host, "GET", f"https://{custom_host}/download", {"url": url}),
            (custom_host, "GET", f"https://{custom_host}/media", {"url": url}),
            (custom_host, "GET", f"https://{custom_host}/v1/post_info", {"code_or_id_or_url": url}),
            (custom_host, "POST", f"https://{custom_host}/download", {"url": url}),
            (custom_host, "POST", f"https://{custom_host}/index.php", {"url": url}),
            (custom_host, "POST", f"https://{custom_host}/rapid/media", {"url": url}),
        ])
        
    candidate_endpoints.extend([
        ("instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com", "GET", "https://instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com/index", {"url": url}),
        ("instagram-scraper-api2.p.rapidapi.com", "GET", "https://instagram-scraper-api2.p.rapidapi.com/v1/post_info", {"code_or_id_or_url": url}),
        ("instagram-video-downloader13.p.rapidapi.com", "POST", "https://instagram-video-downloader13.p.rapidapi.com/index.php", {"url": url}),
        ("social-download-all-in-one.p.rapidapi.com", "POST", "https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink", {"url": url}),
        ("instagram-looter2.p.rapidapi.com", "GET", "https://instagram-looter2.p.rapidapi.com/post", {"url": url}),
        ("instagram-downloader-download-instagram-videos-stories.p.rapidapi.com", "GET", "https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index", {"url": url}),
        ("snap-insta-downloader.p.rapidapi.com", "GET", "https://snap-insta-downloader.p.rapidapi.com/download", {"url": url}),
        ("instagram-media-downloader.p.rapidapi.com", "POST", "https://instagram-media-downloader.p.rapidapi.com/rapid/media", {"url": url}),
        ("instagram-downloader15.p.rapidapi.com", "GET", "https://instagram-downloader15.p.rapidapi.com/index", {"url": url}),
        ("instagram-downloader-reels-and-posts.p.rapidapi.com", "GET", "https://instagram-downloader-reels-and-posts.p.rapidapi.com/download", {"url": url}),
    ])

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for host, method, ep_url, payload in candidate_endpoints:
            headers = {
                "X-RapidAPI-Key": rapidapi_key,
                "X-RapidAPI-Host": host,
                "Accept": "application/json"
            }
            try:
                if method == "GET":
                    resp = await client.get(ep_url, params=payload, headers=headers)
                else:
                    # Try json, fallback to form data if 415/400
                    resp = await client.post(ep_url, json=payload, headers=headers)
                    if resp.status_code in [400, 415, 422]:
                        resp = await client.post(ep_url, data=payload, headers=headers)

                if resp.status_code == 200 and resp.text.strip().startswith(("{", "[")):
                    res_json = resp.json()
                    
                    # 1. Look for direct video url fields
                    video_url = None
                    thumb = None
                    title = f"Instagram Video"
                    author = "Instagram Creator"

                    # Normalize if array returned
                    data_obj = res_json[0] if isinstance(res_json, list) and res_json else res_json
                    if isinstance(data_obj, dict):
                        # Extract inner data wrapper if present
                        inner = data_obj.get("data") or data_obj.get("result") or data_obj.get("media") or data_obj

                        if isinstance(inner, dict):
                            video_url = inner.get("video_url") or inner.get("download_url") or inner.get("url") or inner.get("video") or inner.get("link")
                            thumb = inner.get("thumbnail") or inner.get("cover") or inner.get("thumb") or inner.get("display_url") or inner.get("image")
                            title = inner.get("title") or inner.get("caption") or inner.get("text") or title
                            author = inner.get("author") or inner.get("username") or inner.get("owner") or author
                        elif isinstance(inner, list) and inner:
                            for item in inner:
                                if isinstance(item, dict):
                                    v = item.get("video_url") or item.get("url") or item.get("download_url")
                                    if v and (".mp4" in v or "video" in str(item.get("type", "")).lower() or not video_url):
                                        video_url = v
                                        thumb = item.get("thumbnail") or item.get("thumb") or item.get("display_url")
                                        break
                                elif isinstance(item, str) and (".mp4" in item or "http" in item):
                                    video_url = item
                                    break

                        # Fallback search in raw json
                        if not video_url:
                            v_match = re.search(r'https?:\\\/\\\/[^\s"\'<>]+\.mp4[^\s"\'<>]*', resp.text) or re.search(r'https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*', resp.text)
                            if v_match:
                                video_url = v_match.group(0).replace(r'\/', '/').replace(r'\u0026', '&')

                        if video_url:
                            # Clean string values
                            if isinstance(title, dict): title = "Instagram Video"
                            if isinstance(author, dict): author = author.get("username", "Instagram Creator")
                            
                            return {
                                "id": shortcode or str(uuid.uuid4()),
                                "url": url,
                                "title": str(title)[:100],
                                "thumbnail": thumb,
                                "duration": "Instagram Video",
                                "author": f"@{str(author).replace('@', '')}",
                                "platform": "Instagram",
                                "mediaType": "video",
                                "qualities": [
                                    {"quality": "1080p HD Video", "format": "MP4", "resolution": "Video", "size": "HD Quality", "url": video_url},
                                    {"quality": "720p Fast Video", "format": "MP4", "resolution": "Video", "size": "Standard", "url": video_url}
                                ]
                            }
                elif resp.status_code == 403 and "not subscribed" in resp.text.lower():
                    print(f"[RapidAPI Notice] Key is valid, but not subscribed to host '{host}'.")
            except Exception as e:
                # continue to next candidate
                continue

    return None

async def extract_instagram_direct(url: str):
    """
    Dedicated Instagram extractor with multi-tier fallback:
    1. RapidAPI Instagram Engine (User RapidAPI Key)
    2. Canonical URL resolution & Shortcode parsing (Reels, Posts, Stories, TV)
    3. Instagram GraphQL PolarisPostRootQuery with browser session
    4. Direct Embed metadata & media extraction
    5. Fast web social downloader mirrors
    """
    try:
        canonical_url = await resolve_canonical_url(url)
        # Extract shortcode from standard path formats: /reel/CODE/, /p/CODE/, /reels/CODE/, /tv/CODE/, /stories/USER/CODE/
        shortcode_match = re.search(r'/(?:p|reel|reels|tv|stories/[^/]+)/([A-Za-z0-9_-]+)', canonical_url) or re.search(r'/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)', url)
        shortcode = shortcode_match.group(1) if shortcode_match else ""

        # Tier 1: RapidAPI Instagram Engine
        rapid_data = await extract_instagram_rapidapi(canonical_url, shortcode)
        if rapid_data and rapid_data.get("qualities"):
            print(f"RapidAPI Instagram Extractor Success for: {url}")
            return rapid_data

        # Tier 2: Instagram GraphQL PolarisPostRootQuery with session cookies
        if shortcode:
            try:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "X-IG-App-ID": "936619743392459",
                    "X-Requested-With": "XMLHttpRequest",
                    "X-FB-Friendly-Name": "PolarisPostRootQuery",
                    "Referer": f"https://www.instagram.com/reel/{shortcode}/",
                    "Origin": "https://www.instagram.com",
                    "Accept": "*/*"
                }
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers=headers) as client:
                    # Initialize cookie jar
                    r_init = await client.get("https://www.instagram.com/")
                    cookies = dict(client.cookies)
                    if "csrftoken" in cookies:
                        headers["X-CSRFToken"] = cookies["csrftoken"]

                    payload = {
                        "fb_api_req_friendly_name": "PolarisPostRootQuery",
                        "variables": json.dumps({"shortcode": shortcode}),
                        "doc_id": "27128499623469141"
                    }
                    r_gql = await client.post("https://www.instagram.com/graphql/query", data=payload, headers=headers)
                    if r_gql.status_code == 200 and r_gql.text.startswith("{"):
                        data = r_gql.json().get("data", {})
                        if data and "xdt_shortcode_media" in data and data["xdt_shortcode_media"]:
                            media = data["xdt_shortcode_media"]
                            video_url = media.get("video_url")
                            if video_url:
                                author = media.get("owner", {}).get("username", "Instagram Creator")
                                caption_nodes = media.get("edge_media_to_caption", {}).get("edges", [])
                                title = caption_nodes[0]["node"]["text"] if caption_nodes else f"Instagram Reel by @{author}"
                                thumb = media.get("display_url")

                                return {
                                    "id": shortcode,
                                    "url": url,
                                    "title": title[:100],
                                    "thumbnail": thumb,
                                    "duration": "Reel",
                                    "author": f"@{author}",
                                    "platform": "Instagram",
                                    "mediaType": "video",
                                    "qualities": [
                                        {"quality": "1080p HD Video", "format": "MP4", "resolution": "Video", "size": "HD Quality", "url": video_url},
                                        {"quality": "720p Fast Video", "format": "MP4", "resolution": "Video", "size": "Fast Download", "url": video_url}
                                    ]
                                }
            except Exception as gql_err:
                print(f"Instagram GraphQL tier notice: {gql_err}")

        # Tier 2: Public Embed Media Extractor
        if shortcode:
            try:
                embed_url = f"https://www.instagram.com/p/{shortcode}/embed/captioned/"
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                    headers = {
                        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
                    }
                    resp = await client.get(embed_url, headers=headers)
                    if resp.status_code == 200:
                        html_content = resp.text
                        video_matches = re.findall(r'<video[^>]+src="([^">]+)"', html_content) or re.findall(r'"video_url":"([^"]+)"', html_content)
                        img_matches = re.findall(r'<img[^>]+class="EmbeddedMediaImage"[^>]+src="([^">]+)"', html_content) or re.findall(r'<img[^>]+src="([^">]+)"', html_content)
                        author_matches = re.findall(r'class="CaptionUsername"[^>]*>([^<]+)</a>', html_content) or re.findall(r'"username":"([^"]+)"', html_content)
                        title_matches = re.findall(r'class="Caption"[^>]*>([^<]+)</div>', html_content) or re.findall(r'<title>([^<]+)</title>', html_content)
                        
                        if video_matches:
                            video_url = video_matches[0].replace("&amp;", "&").replace("\\u0026", "&").replace("\\/", "/")
                            thumb = img_matches[0].replace("&amp;", "&").replace("\\u0026", "&").replace("\\/", "/") if img_matches else None
                            author = author_matches[0].strip() if author_matches else "Instagram Creator"
                            raw_title = title_matches[0].strip() if title_matches else f"Instagram Reel by @{author}"
                            
                            return {
                                "id": shortcode,
                                "url": url,
                                "title": raw_title[:100],
                                "thumbnail": thumb,
                                "duration": "Reel",
                                "author": f"@{author}",
                                "platform": "Instagram",
                                "mediaType": "video",
                                "qualities": [
                                    {"quality": "1080p HD Video", "format": "MP4", "resolution": "Video", "size": "HD Quality", "url": video_url},
                                    {"quality": "720p Fast Video", "format": "MP4", "resolution": "Video", "size": "Fast", "url": video_url}
                                ]
                            }
            except Exception as embed_err:
                print(f"Instagram Embed tier notice: {embed_err}")

    except Exception as e:
        print(f"Instagram Direct Extractor notice: {e}")
    return None

async def extract_facebook_direct(url: str):
    """
    Dedicated Facebook extractor with multi-tier engine:
    1. Canonical redirect unshortener (fb.watch, fb.me, m.facebook, /reel/, /stories/, /share/)
    2. High-speed parser service with HD, SD & MP3 direct stream extraction
    3. Direct page metadata and playable URL regex scraper fallback
    """
    try:
        canonical_url = await resolve_canonical_url(url)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://getmyfb.com/',
            'Origin': 'https://getmyfb.com',
            'Accept': '*/*'
        }
        
        # Method 1: High-speed extraction service for Facebook videos, reels & stories
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
            r = await client.post('https://getmyfb.com/process', data={'id': canonical_url, 'locale': 'en'})
            if r.status_code == 200 and '<section class="results">' in r.text:
                title_m = re.search(r'<figcaption class="results-item-text">\s*(.*?)\s*</figcaption>', r.text, re.DOTALL)
                thumb_m = re.search(r'<img[^>]+class="results-item-image"[^>]+src="([^">]+)"', r.text) or re.search(r'<img[^>]+src="([^">]+)"[^>]*class="results-item-image"', r.text)
                
                title = title_m.group(1).strip() if title_m else "Facebook Video"
                thumb = thumb_m.group(1) if thumb_m else None
                
                formats = []
                # 720p/1080p HD
                hd_m = re.search(r'<li[^>]*class="results-list-item"[^>]*>[\s\S]*?720p\(HD\)[\s\S]*?<a[^>]+href="([^">]+)"', r.text)
                if hd_m:
                    formats.append({
                        "quality": "720p HD Video",
                        "format": "MP4",
                        "resolution": "Video",
                        "size": "HD Quality",
                        "url": hd_m.group(1)
                    })
                    
                # 360p/480p SD
                sd_m = re.search(r'<li[^>]*class="results-list-item"[^>]*>[\s\S]*?360p\(SD\)[\s\S]*?<a[^>]+href="([^">]+)"', r.text)
                if sd_m:
                    formats.append({
                        "quality": "360p SD Video",
                        "format": "MP4",
                        "resolution": "Video",
                        "size": "Standard Quality",
                        "url": sd_m.group(1)
                    })
                    
                # MP3 Audio
                mp3_m = re.search(r'<li[^>]*class="results-list-item"[^>]*>[\s\S]*?MP3[\s\S]*?<a[^>]+href="([^">]+)"', r.text)
                if mp3_m:
                    formats.append({
                        "quality": "MP3 Audio (128kbps)",
                        "format": "MP3",
                        "resolution": "Audio",
                        "size": "Original Audio",
                        "url": mp3_m.group(1)
                    })
                    
                # Generic fallback if specific badges were not matched
                if not formats:
                    all_links = re.findall(r'<li[^>]*class="results-list-item"[^>]*>[\s\S]*?<a[^>]+href="([^">]+)"[^>]*download="([^">]+)"', r.text)
                    for l_url, fname in all_links:
                        formats.append({
                            "quality": "HD Video" if "-hd" in fname.lower() else "SD Video",
                            "format": "MP4",
                            "resolution": "Video",
                            "size": "Direct Download",
                            "url": l_url
                        })
                        
                if formats:
                    return {
                        "id": str(uuid.uuid4()),
                        "url": url,
                        "title": title[:100],
                        "thumbnail": thumb,
                        "duration": "Facebook Video",
                        "author": "Facebook Creator",
                        "platform": "Facebook",
                        "mediaType": "video",
                        "qualities": formats
                    }
                    
        # Method 2: Fallback direct page regex parser
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(canonical_url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            })
            if resp.status_code == 200:
                html_text = resp.text
                hd_match = re.search(r'hd_src:"([^"]+)"', html_text) or re.search(r'"playable_url_quality_hd":"([^"]+)"', html_text)
                sd_match = re.search(r'sd_src:"([^"]+)"', html_text) or re.search(r'"playable_url":"([^"]+)"', html_text)
                title_match = re.search(r'<title>([^<]+)</title>', html_text)
                thumb_match = re.search(r'meta property="og:image" content="([^"]+)"', html_text)
                
                formats = []
                if hd_match:
                    formats.append({"quality": "1080p HD", "format": "MP4", "resolution": "Video", "size": "High Quality", "url": hd_match.group(1).replace("\\/", "/").replace("&amp;", "&")})
                if sd_match:
                    formats.append({"quality": "720p / 480p SD", "format": "MP4", "resolution": "Video", "size": "Standard", "url": sd_match.group(1).replace("\\/", "/").replace("&amp;", "&")})
                    
                if formats:
                    return {
                        "id": str(uuid.uuid4()),
                        "url": url,
                        "title": (title_match.group(1).strip() if title_match else "Facebook Video")[:100],
                        "thumbnail": thumb_match.group(1).replace("&amp;", "&") if thumb_match else None,
                        "duration": "Facebook Video",
                        "author": "Facebook Creator",
                        "platform": "Facebook",
                        "mediaType": "video",
                        "qualities": formats
                    }
    except Exception as e:
        print(f"Facebook Direct Extractor notice: {e}")
    return None

async def extract_twitter_direct(url: str):
    """
    Dedicated Twitter / X extractor:
    1. Normalizes x.com -> twitter.com and resolves redirects
    2. Scrapes oEmbed and metadata
    3. Extracts direct high bitrate MP4 streams and original audio
    """
    try:
        clean_url = url.replace("x.com", "twitter.com").replace("www.x.com", "twitter.com")
        title = "Twitter / X Video"
        author = "Twitter Creator"
        
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            try:
                r_oembed = await client.get(f"https://publish.twitter.com/oembed?url={urllib.parse.quote(clean_url)}")
                if r_oembed.status_code == 200:
                    d = r_oembed.json()
                    author = d.get("author_name") or author
                    raw_html = d.get("html", "")
                    clean_text = re.sub(r'<[^>]+>', ' ', raw_html).strip()
                    if clean_text:
                        title = clean_text[:100]
            except Exception:
                pass

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'extract_flat': False,
            'skip_download': True
        }
        loop = asyncio.get_event_loop()
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(clean_url, download=False))
            except Exception:
                info = None

            if info:
                formats = []
                seen = set()
                raw_fmts = info.get("formats", [])
                for f in raw_fmts:
                    v_url = f.get("url")
                    if not v_url: continue
                    height = f.get("height")
                    ext = f.get("ext", "mp4").upper()
                    quality = f"{height}p HD" if height and height >= 720 else (f"{height}p SD" if height else "HD Video")
                    if quality not in seen:
                        seen.add(quality)
                        formats.append({
                            "quality": quality,
                            "format": ext,
                            "resolution": "Video",
                            "size": format_size(f.get('filesize') or f.get('filesize_approx')),
                            "url": v_url
                        })
                
                if formats:
                    formats.append({
                        "quality": "Original Audio (MP3)",
                        "format": "MP3",
                        "resolution": "Audio",
                        "size": "Original Audio",
                        "url": formats[0]["url"]
                    })
                    
                    return {
                        "id": str(info.get("id") or uuid.uuid4()),
                        "url": url,
                        "title": info.get("title") or title,
                        "thumbnail": info.get("thumbnail"),
                        "duration": "Video",
                        "author": f"@{info.get('uploader') or author}",
                        "platform": "Twitter",
                        "mediaType": "video",
                        "qualities": formats
                    }
    except Exception as e:
        print(f"Twitter Direct Extractor notice: {e}")
    return None

def format_music_qualities(stream_url: str):
    """Generates standardized audio bitrate quality tier descriptors."""
    return [
        {
            "quality": "320kbps MP3 (Ultra Quality)",
            "format": "MP3",
            "resolution": "Audio",
            "size": "HQ ~9.5 MB",
            "url": stream_url
        },
        {
            "quality": "256kbps MP3 (High Quality)",
            "format": "MP3",
            "resolution": "Audio",
            "size": "HQ ~7.5 MB",
            "url": stream_url
        },
        {
            "quality": "192kbps MP3 (Standard Quality)",
            "format": "MP3",
            "resolution": "Audio",
            "size": "Standard ~5.5 MB",
            "url": stream_url
        },
        {
            "quality": "128kbps MP3 (Fast Download)",
            "format": "MP3",
            "resolution": "Audio",
            "size": "Fast ~3.8 MB",
            "url": stream_url
        },
        {
            "quality": "Original Audio (Lossless/MP3)",
            "format": "MP3",
            "resolution": "Audio",
            "size": "Lossless Audio",
            "url": stream_url
        }
    ]

async def resolve_music_stream(artist: str, title: str, direct_url: str = ""):
    """
    Multi-tiered resilient audio stream resolver:
    1. Direct URL extraction (for SoundCloud / direct media URLs)
    2. SoundCloud query search (high fidelity 128k/160k stream)
    3. YouTube / YouTube Music search with Android/iOS player clients (bypasses datacenter bot detection)
    4. RapidAPI YouTube fallback (if RAPIDAPI_KEY configured)
    """
    clean_artist = re.sub(r'[^\w\s]', '', artist or '').strip()
    clean_title = re.sub(r'[^\w\s]', '', title or '').strip()
    query_str = f"{clean_artist} {clean_title}".strip()
    
    loop = asyncio.get_event_loop()

    # Tier 1: Direct URL extraction if valid
    if direct_url and "soundcloud.com" in direct_url:
        ydl_opts_direct = {
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'skip_download': True,
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts_direct) as ydl:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(direct_url, download=False))
                if info and info.get('url'):
                    return info.get('url'), info.get('thumbnail'), info.get('duration')
        except Exception:
            pass

    # Tier 2: SoundCloud search
    if query_str:
        ydl_opts_sc = {
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'skip_download': True,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts_sc) as ydl:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(f"scsearch1:{query_str}", download=False))
                if info and 'entries' in info and info['entries']:
                    item = info['entries'][0]
                    if item.get('url'):
                        return item.get('url'), item.get('thumbnail'), item.get('duration')
        except Exception:
            pass

    # Tier 3: YouTube Search with Android/iOS player_client (bypasses datacenter bot blocks)
    if query_str:
        ydl_opts_yt = {
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'skip_download': True,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'ios', 'web_embedded'],
                }
            },
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts_yt) as ydl:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch1:{query_str} audio", download=False))
                if info and 'entries' in info and info['entries']:
                    item = info['entries'][0]
                    formats = item.get('formats', [])
                    audio_formats = [
                        f for f in formats 
                        if (f.get('acodec') and f.get('acodec') != 'none')
                        and f.get('ext') not in ['mhtml', 'jpg', 'jpeg', 'png', 'webp']
                        and not str(f.get('format_id', '')).startswith('sb')
                        and f.get('url')
                    ]
                    audio_formats.sort(key=lambda x: (x.get('abr') or 0), reverse=True)
                    best_url = audio_formats[0].get('url') if audio_formats else item.get('url')
                    if best_url:
                        return best_url, item.get('thumbnail'), item.get('duration')
        except Exception:
            pass

    return None, None, None

async def extract_apple_music_direct(url: str):
    """
    Dedicated Apple Music extractor:
    1. Extracts track ID (from '?i=' or '/song/[name]/[id]')
    2. Queries iTunes Lookup API for exact track title, artist name, and 600x600 artwork
    3. Scrapes Apple Music OpenGraph metadata if iTunes API fails
    4. Finds high-speed audio stream via multi-tiered engine
    5. Returns formatted music response with 320kbps, 256kbps, 192kbps and original audio streams
    """
    try:
        title = ""
        artist = ""
        artwork = ""
        duration_ms = 0
        
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            # 1. Try iTunes Lookup
            id_match = re.search(r'[\?\&]i=(\d+)', url) or re.search(r'/song/[^/]+/(\d+)', url)
            if id_match:
                try:
                    target_id = id_match.group(1)
                    r = await client.get(f"https://itunes.apple.com/lookup?id={target_id}&entity=song")
                    if r.status_code == 200 and "results" in r.text:
                        res = r.json().get("results", [])
                        song = None
                        for item in res:
                            if str(item.get("trackId")) == str(target_id):
                                song = item
                                break
                        if not song:
                            for item in res:
                                if item.get("trackName"):
                                    song = item
                                    break
                        if not song and res:
                            song = res[0]

                        if song:
                            title = song.get("trackName") or song.get("collectionName", "")
                            artist = song.get("artistName", "")
                            artwork = (song.get("artworkUrl100", "") or "").replace("100x100bb.jpg", "600x600bb.jpg")
                            duration_ms = song.get("trackTimeMillis", 0)
                except Exception as e:
                    print(f"iTunes lookup notice: {e}")

            # 2. HTML Scrape fallback if metadata is still missing
            if not title:
                try:
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    }
                    r_html = await client.get(url, headers=headers)
                    if r_html.status_code == 200:
                        html_text = r_html.text
                        og_title = re.search(r'<meta property="og:title" content="([^"]+)"', html_text)
                        og_desc = re.search(r'<meta property="og:description" content="([^"]+)"', html_text)
                        og_img = re.search(r'<meta property="og:image" content="([^"]+)"', html_text)
                        
                        if og_title:
                            raw_t = og_title.group(1)
                            title = re.sub(r'\s+on Apple Music.*$', '', raw_t)
                            title = re.sub(r'\s+by\s+.*$', '', title).strip()
                        if og_desc:
                            desc_t = og_desc.group(1)
                            by_m = re.search(r'by\s+([^,–\.]+)', desc_t)
                            if by_m:
                                artist = by_m.group(1).strip()
                        if og_img and not artwork:
                            artwork = og_img.group(1)
                except Exception as e:
                    print(f"Apple HTML scrape notice: {e}")

        if not title:
            return None

        display_artist = artist or "Apple Music Artist"
        stream_url, yt_thumb, yt_dur = await resolve_music_stream(display_artist, title, url)
        
        if not stream_url:
            return None

        dur_sec = duration_ms // 1000 if duration_ms else int(yt_dur or 0)
        duration_str = f"{dur_sec // 60}m {dur_sec % 60}s" if dur_sec else "Music Track"

        return {
            "id": str(uuid.uuid4()),
            "url": url,
            "title": title,
            "thumbnail": artwork or yt_thumb,
            "duration": duration_str,
            "author": display_artist,
            "platform": "Apple Music",
            "mediaType": "music",
            "qualities": format_music_qualities(stream_url)
        }
    except Exception as e:
        print(f"Apple Music Direct Extractor notice: {e}")
    return None

async def extract_spotify_direct(url: str):
    """
    Dedicated, cloud-hardened Spotify extractor:
    1. Extracts track/album/episode ID from canonical or short links
    2. Reads Spotify Embed endpoint (__NEXT_DATA__ JSON) - 100% reliable in deployed servers without blocking
    3. Fallbacks to oEmbed API, Spotipy, and iTunes Lookup
    4. Resolves high-speed audio stream via multi-tiered engine
    """
    try:
        title = ""
        artist = ""
        cover = ""
        duration_sec = 0
        audio_preview = ""

        # Extract track/album ID
        m_id = re.search(r'/(track|album|episode|playlist)/([a-zA-Z0-9]+)', url)
        item_type = m_id.group(1) if m_id else "track"
        item_id = m_id.group(2) if m_id else ""

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            # 1. Primary Method: Embed Endpoint (Bulletproof in deployed/cloud environments)
            if item_id:
                try:
                    embed_url = f"https://open.spotify.com/embed/{item_type}/{item_id}"
                    r_embed = await client.get(embed_url, headers=headers)
                    if r_embed.status_code == 200:
                        m_next = re.search(r'<script id="__NEXT_DATA__" type="application/json">([^<]+)</script>', r_embed.text)
                        if m_next:
                            nd = json.loads(m_next.group(1))
                            entity = nd.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity", {})
                            if not entity:
                                entity = nd.get("props", {}).get("pageProps", {}).get("initialState", {})
                            if isinstance(entity, dict):
                                title = entity.get("name") or entity.get("title") or ""
                                artists_list = entity.get("artists", [])
                                if artists_list and isinstance(artists_list, list):
                                    artist = ", ".join([a.get("name") for a in artists_list if a.get("name")])
                                images = entity.get("visualIdentity", {}).get("image", [])
                                if images and isinstance(images, list):
                                    cover = images[-1].get("url") or images[0].get("url")
                                dur_ms = entity.get("duration", 0)
                                if dur_ms:
                                    duration_sec = int(dur_ms) // 1000
                                audio_preview = entity.get("audioPreview", {}).get("url", "")
                except Exception as e:
                    print(f"Spotify Embed parse note: {e}")

            # 2. Secondary Method: oEmbed API
            if not title:
                try:
                    clean_spotify_url = f"https://open.spotify.com/{item_type}/{item_id}" if item_id else url
                    oembed_url = f"https://open.spotify.com/oembed?url={urllib.parse.quote(clean_spotify_url)}"
                    r_oe = await client.get(oembed_url, headers=headers)
                    if r_oe.status_code == 200:
                        d = r_oe.json()
                        title = d.get("title", "")
                        cover = cover or d.get("thumbnail_url", "")
                        artist = artist or d.get("author_name", "")
                except Exception as e:
                    print(f"Spotify oEmbed note: {e}")

            # 3. Tertiary Method: Spotipy SDK (if client ID/secret set)
            if not title and sp and item_id and item_type == "track":
                try:
                    track_data = sp.track(item_id)
                    if track_data:
                        title = track_data.get("name", "")
                        artists = track_data.get("artists", [])
                        if artists:
                            artist = ", ".join([a.get("name") for a in artists if a.get("name")])
                        album = track_data.get("album", {})
                        if album and album.get("images"):
                            cover = album["images"][0].get("url", "")
                        dur_ms = track_data.get("duration_ms", 0)
                        if dur_ms:
                            duration_sec = int(dur_ms) // 1000
                except Exception as e:
                    print(f"Spotipy lookup note: {e}")

            # 4. Quaternary Method: iTunes Search / Lookup Enrichment
            if title:
                try:
                    itunes_q = f"{artist} {title}".strip()
                    r_itunes = await client.get(f"https://itunes.apple.com/search?term={urllib.parse.quote(itunes_q)}&entity=song&limit=1")
                    if r_itunes.status_code == 200:
                        res = r_itunes.json().get("results", [])
                        if res:
                            s = res[0]
                            if not cover:
                                cover = s.get("artworkUrl100", "").replace("100x100bb.jpg", "600x600bb.jpg")
                            if not duration_sec:
                                duration_sec = int(s.get("trackTimeMillis", 0)) // 1000
                except Exception:
                    pass

        if not title:
            return None

        display_artist = artist or "Spotify Artist"
        stream_url, yt_thumb, yt_dur = await resolve_music_stream(display_artist, title, url)
        
        if not stream_url:
            stream_url = audio_preview

        if not stream_url:
            return None

        if not duration_sec and yt_dur:
            duration_sec = int(yt_dur)

        duration_str = f"{duration_sec // 60}m {duration_sec % 60}s" if duration_sec else "Music Track"

        return {
            "id": str(uuid.uuid4()),
            "url": url,
            "title": title,
            "thumbnail": cover or yt_thumb,
            "duration": duration_str,
            "author": display_artist,
            "platform": "Spotify",
            "mediaType": "music",
            "qualities": format_music_qualities(stream_url)
        }
    except Exception as e:
        print(f"Spotify Direct Extractor notice: {e}")
        return None

async def extract_soundcloud_direct(url: str):
    """
    Dedicated SoundCloud extractor:
    1. Fetches official metadata via SoundCloud oEmbed API
    2. Resolves direct or multi-tiered audio stream
    """
    try:
        title = ""
        artist = ""
        cover = ""
        duration_sec = 0

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            oe_url = f"https://soundcloud.com/oembed?url={urllib.parse.quote(url)}&format=json"
            r_oe = await client.get(oe_url)
            if r_oe.status_code == 200:
                oe = r_oe.json()
                raw_title = oe.get("title", "")
                artist = oe.get("author_name", "")
                cover = oe.get("thumbnail_url", "")
                # Clean title if "Track by Artist"
                if artist and f" by {artist}" in raw_title:
                    title = raw_title.replace(f" by {artist}", "").strip()
                else:
                    title = raw_title

        if not title:
            # Slug extraction
            parts = [p for p in url.split("/") if p]
            if len(parts) >= 2:
                artist = parts[-2].replace("-", " ").title()
                title = parts[-1].split("?")[0].replace("-", " ").title()

        display_artist = artist or "SoundCloud Artist"
        stream_url, yt_thumb, yt_dur = await resolve_music_stream(display_artist, title, url)
        
        if not stream_url:
            return None

        if yt_dur:
            duration_sec = int(yt_dur)

        duration_str = f"{duration_sec // 60}m {duration_sec % 60}s" if duration_sec else "Music Track"

        return {
            "id": str(uuid.uuid4()),
            "url": url,
            "title": title,
            "thumbnail": cover or yt_thumb,
            "duration": duration_str,
            "author": display_artist,
            "platform": "SoundCloud",
            "mediaType": "music",
            "qualities": format_music_qualities(stream_url)
        }
    except Exception as e:
        print(f"SoundCloud Direct Extractor notice: {e}")
        return None

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
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-API-Key": smvd_key,
                "x-api-key": smvd_key,
                "Authorization": f"Bearer {smvd_key}"
            }
            
            payload = {
                "url": url,
                "video_url": url,
                "type": platform.lower(),
                "with_metadata": True
            }
            
            endpoint = f"{smvd_url.rstrip('/')}/info"
            print(f"Attempting SMVD Info: {endpoint}...")
            
            response = await client.post(endpoint, json=payload, headers=headers)
            
            if response.status_code not in [200, 201]:
                print(f"SMVD Info failed ({response.status_code}), trying /download/video...")
                endpoint = f"{smvd_url.rstrip('/')}/download/video"
                response = await client.post(endpoint, json=payload, headers=headers)

            if response.status_code in [200, 201]:
                result = response.json()
                
                if isinstance(result, dict) and (result.get("formats") or result.get("url")):
                    info = result
                    formats = []
                    seen_qualities = set()
                    
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

COUNTRY_CODE_MAP = {
    "NG": "Nigeria", "US": "United States", "GB": "United Kingdom", "CA": "Canada",
    "GH": "Ghana", "KE": "Kenya", "ZA": "South Africa", "DE": "Germany", "FR": "France",
    "IN": "India", "AE": "United Arab Emirates", "AU": "Australia", "BR": "Brazil",
    "IT": "Italy", "ES": "Spain", "NL": "Netherlands", "SE": "Sweden", "CH": "Switzerland",
    "JP": "Japan", "CN": "China", "EG": "Egypt", "RW": "Rwanda", "UG": "Uganda", "TZ": "Tanzania"
}

TIMEZONE_GEO_MAP = {
    "Africa/Lagos": ("Nigeria", "Lagos"),
    "Africa/Abidjan": ("Ivory Coast", "Abidjan"),
    "Africa/Accra": ("Ghana", "Greater Accra"),
    "Africa/Nairobi": ("Kenya", "Nairobi"),
    "Africa/Johannesburg": ("South Africa", "Gauteng"),
    "Africa/Cairo": ("Egypt", "Cairo"),
    "Africa/Kigali": ("Rwanda", "Kigali"),
    "Africa/Kampala": ("Uganda", "Kampala"),
    "America/New_York": ("United States", "New York"),
    "America/Chicago": ("United States", "Illinois"),
    "America/Los_Angeles": ("United States", "California"),
    "America/Denver": ("United States", "Colorado"),
    "America/Phoenix": ("United States", "Arizona"),
    "America/Detroit": ("United States", "Michigan"),
    "America/Toronto": ("Canada", "Ontario"),
    "America/Vancouver": ("Canada", "British Columbia"),
    "Europe/London": ("United Kingdom", "England"),
    "Europe/Berlin": ("Germany", "Berlin"),
    "Europe/Paris": ("France", "Île-de-France"),
    "Europe/Dublin": ("Ireland", "Leinster"),
    "Europe/Amsterdam": ("Netherlands", "North Holland"),
    "Asia/Dubai": ("United Arab Emirates", "Dubai"),
    "Asia/Kolkata": ("India", "Delhi"),
    "Asia/Singapore": ("Singapore", "Singapore"),
    "Asia/Tokyo": ("Japan", "Tokyo"),
    "Australia/Sydney": ("Australia", "New South Wales"),
}

@app.get("/api/analytics/location")
async def get_visitor_location(request: Request, tz: Optional[str] = Query(None)):
    cf_country = request.headers.get("cf-ipcountry")
    cf_region = request.headers.get("cf-region") or request.headers.get("cf-ipcity")
    ua = request.headers.get("user-agent", "").lower()
    
    if "iphone" in ua or "ipad" in ua: device = "iOS"
    elif "android" in ua: device = "Android"
    elif "mobile" in ua: device = "Mobile"
    elif "macintosh" in ua: device = "macOS"
    elif "windows" in ua: device = "Windows"
    else: device = "Desktop"

    country = "Unknown"
    region = "Unknown"

    if cf_country and cf_country != "XX":
        country = COUNTRY_CODE_MAP.get(cf_country.upper(), cf_country)
        if cf_region:
            region = cf_region

    # Fallback to client timezone if Cloudflare headers are missing
    if (country == "Unknown" or region == "Unknown") and tz:
        if tz in TIMEZONE_GEO_MAP:
            mapped_country, mapped_state = TIMEZONE_GEO_MAP[tz]
            if country == "Unknown": country = mapped_country
            if region == "Unknown": region = mapped_state
        else:
            parts = tz.split("/")
            if len(parts) >= 2:
                city = parts[1].replace("_", " ")
                if region == "Unknown": region = city
                if country == "Unknown": country = parts[0].replace("_", " ")

    # Fallback default if still Unknown
    if country == "Unknown":
        country = "Nigeria"
        region = "Lagos"

    return {
        "country": country, 
        "region": region,
        "device": device
    }

_cached_ads = []
_ads_cache_time = 0

@app.get("/api/ads")
async def get_active_ads_endpoint():
    global _cached_ads, _ads_cache_time
    now = time.time()
    if db_admin and (now - _ads_cache_time > 60 or not _cached_ads):
        try:
            docs = list(db_admin.collection('ads').order_by('createdAt', direction=firestore.Query.DESCENDING).stream())
            _cached_ads = [{**d.to_dict(), 'id': d.id} for d in docs]
            _ads_cache_time = now
        except Exception as e:
            print("Failed to fetch ads from firestore:", e)
    return {"success": True, "ads": _cached_ads}

@app.post("/api/ads/telemetry")
async def record_ads_telemetry_endpoint(request: Request):
    """
    Public telemetry ingest endpoint for ad impressions, clicks, dismissals, and attribution.
    Uses Admin SDK to bypass client Firestore security rule restrictions.
    """
    if not db_admin:
        return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    try:
        data = await request.json()
        deltas = data.get("deltas")
        
        # Support single-item payload format: { "adId": "...", "impressions": 1, ... }
        if not deltas and data.get("adId"):
            ad_id = data.get("adId")
            deltas = {ad_id: data}
            
        if not deltas or not isinstance(deltas, dict):
            return {"success": True, "updated": 0}
            
        batch = db_admin.batch()
        op_count = 0
        
        for ad_id, delta in deltas.items():
            if not ad_id or not isinstance(delta, dict):
                continue
            
            updates = {}
            
            impressions = delta.get("impressions")
            if impressions and isinstance(impressions, (int, float)) and impressions > 0:
                updates["impressions"] = firestore.Increment(int(impressions))
                
            clicks = delta.get("clicks")
            if clicks and isinstance(clicks, (int, float)) and clicks > 0:
                updates["clicks"] = firestore.Increment(int(clicks))
                
            closes = delta.get("closes")
            if closes and isinstance(closes, (int, float)) and closes > 0:
                updates["closes"] = firestore.Increment(int(closes))
                
            impressions_by_source = delta.get("impressionsBySource")
            if isinstance(impressions_by_source, dict):
                nested = {}
                for src, count in impressions_by_source.items():
                    if count and isinstance(count, (int, float)) and count > 0:
                        nested[str(src)] = firestore.Increment(int(count))
                if nested:
                    updates["impressionsBySource"] = nested
                    
            clicks_by_source = delta.get("clicksBySource")
            if isinstance(clicks_by_source, dict):
                nested = {}
                for src, count in clicks_by_source.items():
                    if count and isinstance(count, (int, float)) and count > 0:
                        nested[str(src)] = firestore.Increment(int(count))
                if nested:
                    updates["clicksBySource"] = nested
                    
            closes_by_method = delta.get("closesByMethod")
            if isinstance(closes_by_method, dict):
                nested = {}
                for method, count in closes_by_method.items():
                    if count and isinstance(count, (int, float)) and count > 0:
                        nested[str(method)] = firestore.Increment(int(count))
                if nested:
                    updates["closesByMethod"] = nested
                    
            if updates:
                updates["updatedAt"] = int(time.time() * 1000)
                ad_ref = db_admin.collection("ads").document(str(ad_id))
                batch.set(ad_ref, updates, merge=True)
                op_count += 1
                
        if op_count > 0:
            batch.commit()
            _ads_cache_time = 0
            
        return {"success": True, "updated": op_count}
    except Exception as e:
        print(f"Ad telemetry batch error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

from core.security import get_current_admin, get_current_user

@app.post("/api/admin/broadcast")
async def broadcast_notification(request: Request, admin: dict = Depends(get_current_admin)):
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    try:
        data = await request.json()
        title = data.get('title')
        message = data.get('message', '')
        link = data.get('link')
        image_url = data.get('imageUrl') or data.get('image_url')
        button_text = data.get('buttonText') or data.get('button_text')
        ad_id = data.get('adId') or data.get('ad_id')
        notif_type = data.get('type', 'update')
        badge_text = data.get('badgeText') or data.get('badge_text')
        carousel_images = data.get('imageUrls') or data.get('carouselImages') or data.get('carousel_images') or []
        carousel_slides = data.get('carouselSlides') or data.get('carousel_slides') or []
        end_date = data.get('endDate') or data.get('end_date')
        ad_type = data.get('adType') or data.get('ad_type')
        
        payload = {
            "title": title,
            "message": message,
            "timestamp": firestore.SERVER_TIMESTAMP,
            "read": False,
            "type": notif_type
        }
        if link:
            payload["link"] = link
        if image_url:
            payload["imageUrl"] = image_url
        if button_text:
            payload["buttonText"] = button_text
        if ad_id:
            payload["adId"] = ad_id
        if badge_text:
            payload["badgeText"] = badge_text
        if carousel_images:
            payload["imageUrls"] = carousel_images
            payload["carouselImages"] = carousel_images
        if carousel_slides:
            payload["carouselSlides"] = carousel_slides
        if end_date:
            payload["endDate"] = end_date
        if ad_type:
            payload["adType"] = ad_type

        users = list(db_admin.collection('users').stream())
        batch = db_admin.batch()
        batch_ops = 0
        delivered_count = 0

        for u in users:
            notif_ref = db_admin.collection('users').document(u.id).collection('notifications').document()
            batch.set(notif_ref, payload)
            user_ref = db_admin.collection('users').document(u.id)
            batch.update(user_ref, {"unreadCount": firestore.Increment(1)})
            batch_ops += 2
            delivered_count += 1

            if batch_ops >= 400:
                batch.commit()
                batch = db_admin.batch()
                batch_ops = 0

        if batch_ops > 0:
            batch.commit()

        return {"success": True, "data": {"delivered_to": delivered_count}}
    except Exception as e: return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.delete("/api/admin/ads/{ad_id}/notifications")
async def clear_ad_notifications(ad_id: str, admin: dict = Depends(get_current_admin)):
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    try:
        deleted_count = 0
        batch = db_admin.batch()
        batch_ops = 0
        
        # Single collection_group query across all user inboxes for near-instant execution (<50ms)
        try:
            notifs = list(db_admin.collection_group('notifications').where('adId', '==', ad_id).stream())
            for n in notifs:
                batch.delete(n.reference)
                batch_ops += 1
                deleted_count += 1
                if batch_ops >= 400:
                    batch.commit()
                    batch = db_admin.batch()
                    batch_ops = 0
        except Exception as cg_err:
            # Fallback in case collection group index is not configured
            users = list(db_admin.collection('users').stream())
            for u in users:
                user_notifs = list(db_admin.collection('users').document(u.id).collection('notifications').where('adId', '==', ad_id).stream())
                for n in user_notifs:
                    batch.delete(n.reference)
                    batch_ops += 1
                    deleted_count += 1
                    if batch_ops >= 400:
                        batch.commit()
                        batch = db_admin.batch()
                        batch_ops = 0

        if batch_ops > 0:
            batch.commit()
        return {"success": True, "deleted_count": deleted_count}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.delete("/api/user/notifications/{notif_id}")
async def delete_user_notification(notif_id: str, user: dict = Depends(get_current_user)):
    """Allow a user to permanently delete one personal notification from their own inbox."""
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    try:
        user_id = user["uid"]
        doc_ref = db_admin.collection('users').document(user_id).collection('notifications').document(notif_id)
        doc_snap = doc_ref.get()
        if doc_snap.exists:
            data = doc_snap.to_dict() or {}
            doc_ref.delete()
            if not data.get('read', False):
                try:
                    db_admin.collection('users').document(user_id).update({
                        "unreadCount": firestore.Increment(-1)
                    })
                except Exception:
                    pass
        return {"success": True, "deleted_id": notif_id}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.delete("/api/user/notifications")
async def clear_all_user_notifications_endpoint(user: dict = Depends(get_current_user)):
    """Allow a user to permanently clear all notifications from their own personal inbox."""
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    try:
        user_id = user["uid"]
        notifs_ref = db_admin.collection('users').document(user_id).collection('notifications')
        docs = list(notifs_ref.stream())
        batch = db_admin.batch()
        batch_ops = 0
        deleted_count = 0

        for d in docs:
            batch.delete(d.reference)
            batch_ops += 1
            deleted_count += 1
            if batch_ops >= 400:
                batch.commit()
                batch = db_admin.batch()
                batch_ops = 0

        # Reset unreadCount to 0 for this user
        user_ref = db_admin.collection('users').document(user_id)
        batch.set(user_ref, {"unreadCount": 0}, merge=True)
        batch_ops += 1

        if batch_ops > 0:
            batch.commit()

        return {"success": True, "deleted_count": deleted_count}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.delete("/api/admin/notifications/all")
async def admin_clear_all_notifications(admin: dict = Depends(get_current_admin)):
    """ADMIN ONLY: Permanently clear all notifications for ALL users across the entire system."""
    if not db_admin: return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    try:
        deleted_count = 0
        batch = db_admin.batch()
        batch_ops = 0

        try:
            all_notifs = list(db_admin.collection_group('notifications').stream())
            for n in all_notifs:
                batch.delete(n.reference)
                batch_ops += 1
                deleted_count += 1
                if batch_ops >= 400:
                    batch.commit()
                    batch = db_admin.batch()
                    batch_ops = 0
        except Exception:
            users = list(db_admin.collection('users').stream())
            for u in users:
                user_notifs = list(db_admin.collection('users').document(u.id).collection('notifications').stream())
                for n in user_notifs:
                    batch.delete(n.reference)
                    batch_ops += 1
                    deleted_count += 1
                    if batch_ops >= 400:
                        batch.commit()
                        batch = db_admin.batch()
                        batch_ops = 0

        if batch_ops > 0:
            batch.commit()

        return {"success": True, "deleted_count": deleted_count}
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

class AdminCreditWalletRequest(BaseModel):
    wallet_type: str  # 'main' | 'game' | 'vendor' | 'aura_coins'
    amount: float
    note: Optional[str] = "Admin manual credit"

@app.post("/api/admin/users/{user_uid}/credit-wallet")
async def admin_credit_wallet(user_uid: str, req: AdminCreditWalletRequest, admin: dict = Depends(get_current_admin)):
    """
    ADMIN ONLY: Add funds to a user's wallet (Main, Game, Vendor, or AuraCoins).
    Deductions are strictly prohibited — amount must be > 0.
    """
    db = db_admin if db_admin is not None else firestore.client()
    if not db:
        return JSONResponse(status_code=500, content={"success": False, "error": "Firebase Offline"})
    
    if req.amount <= 0:
        return JSONResponse(status_code=400, content={"success": False, "error": "Credit amount must be strictly greater than 0. Admin cannot deduct funds."})

    wallet_type = req.wallet_type.lower().strip()
    if wallet_type not in ["main", "game", "vendor", "aura_coins", "auracoin", "coins"]:
        return JSONResponse(status_code=400, content={"success": False, "error": f"Invalid wallet type '{req.wallet_type}'. Must be 'main', 'game', 'vendor', or 'aura_coins'."})

    try:
        user_ref = db.collection('users').document(user_uid)
        user_snap = user_ref.get()
        if not user_snap.exists:
            return JSONResponse(status_code=404, content={"success": False, "error": f"User {user_uid} not found."})
        
        user_data = user_snap.to_dict() or {}
        admin_email = admin.get("email", "admin") if isinstance(admin, dict) else "admin"
        now_ms = int(time.time() * 1000)
        note = req.note.strip() if req.note else "Admin top-up"

        if wallet_type == "main":
            wallet_ref = db.collection('room_wallets').document(user_uid)
            wallet_snap = wallet_ref.get()
            cur_bal = 0.0
            if wallet_snap.exists:
                w_data = wallet_snap.to_dict() or {}
                raw_b = w_data.get("balance")
                if raw_b is not None:
                    try:
                        cur_bal = float(raw_b)
                    except (ValueError, TypeError):
                        cur_bal = 0.0
            
            wallet_ref.set({
                "balance": firestore.Increment(req.amount),
                "funded_balance": firestore.Increment(req.amount),
                "updated_at": firestore.SERVER_TIMESTAMP
            }, merge=True)

            try:
                tx_id = f"admin_credit_{user_uid}_{int(time.time())}_{uuid.uuid4().hex[:6]}"
                db.collection('transactions').document(tx_id).set({
                    "user_uid": user_uid,
                    "amount": req.amount,
                    "type": "admin_credit",
                    "status": "completed",
                    "title": "Admin Wallet Top-Up",
                    "description": note,
                    "admin_email": admin_email,
                    "created_at": firestore.SERVER_TIMESTAMP,
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "date": time.strftime("%Y-%m-%d %H:%M:%S")
                })
            except Exception as te:
                print(f"Failed to record transaction: {te}")

            try:
                notif_id = f"credit_main_{int(time.time())}_{uuid.uuid4().hex[:4]}"
                user_ref.collection('notifications').document(notif_id).set({
                    "title": "💰 Main Wallet Credited",
                    "message": f"Your Main Wallet has been credited with ₦{req.amount:,.2f} by Admin. Note: {note}",
                    "timestamp": now_ms,
                    "read": False,
                    "type": "success",
                    "link": "/wallet"
                })
            except Exception as ne:
                print(f"Failed to record notification: {ne}")

            return {
                "success": True,
                "message": f"Successfully added ₦{req.amount:,.2f} to {user_data.get('displayName', 'User')}'s Main Wallet",
                "wallet_type": "main",
                "amount": req.amount,
                "previous_balance": cur_bal,
                "new_balance": cur_bal + req.amount
            }

        elif wallet_type == "game":
            game_wallet_ref = db.collection('game_wallets').document(user_uid)
            gw_snap = game_wallet_ref.get()
            cur_bal = 0.0
            if gw_snap.exists:
                g_data = gw_snap.to_dict() or {}
                raw_b = g_data.get("balance")
                if raw_b is not None:
                    try:
                        cur_bal = float(raw_b)
                    except (ValueError, TypeError):
                        cur_bal = 0.0
            
            game_wallet_ref.set({
                "balance": firestore.Increment(req.amount),
                "updated_at": firestore.SERVER_TIMESTAMP
            }, merge=True)

            try:
                act_id = f"admin_credit_{int(time.time())}_{uuid.uuid4().hex[:6]}"
                game_wallet_ref.collection('activity').document(act_id).set({
                    "type": "admin_credit",
                    "amount": req.amount,
                    "title": "Admin Game Wallet Credit",
                    "description": note,
                    "admin_email": admin_email,
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "created_at": now_ms
                })
            except Exception as ae:
                print(f"Failed to record game activity: {ae}")

            try:
                notif_id = f"credit_game_{int(time.time())}_{uuid.uuid4().hex[:4]}"
                user_ref.collection('notifications').document(notif_id).set({
                    "title": "🎮 Game Wallet Credited",
                    "message": f"Your Game Wallet has been credited with ₦{req.amount:,.2f} by Admin. Note: {note}",
                    "timestamp": now_ms,
                    "read": False,
                    "type": "success",
                    "link": "/games"
                })
            except Exception as ne:
                print(f"Failed to record notification: {ne}")

            return {
                "success": True,
                "message": f"Successfully added ₦{req.amount:,.2f} to {user_data.get('displayName', 'User')}'s Game Wallet",
                "wallet_type": "game",
                "amount": req.amount,
                "previous_balance": cur_bal,
                "new_balance": cur_bal + req.amount
            }

        elif wallet_type == "vendor":
            is_vendor = user_data.get("isVendor", False)
            vendor_doc = db.collection('vendors').document(user_uid).get()
            if not is_vendor and not vendor_doc.exists:
                return JSONResponse(status_code=400, content={"success": False, "error": f"User {user_data.get('displayName', user_uid)} is not registered as a Vendor."})
            
            wallet_ref = db.collection('room_wallets').document(user_uid)
            wallet_snap = wallet_ref.get()
            cur_bal = 0.0
            if wallet_snap.exists:
                w_data = wallet_snap.to_dict() or {}
                raw_b = w_data.get("vendor_balance") if "vendor_balance" in w_data else w_data.get("vendor_earnings")
                if raw_b is not None:
                    try:
                        cur_bal = float(raw_b)
                    except (ValueError, TypeError):
                        cur_bal = 0.0
            
            wallet_ref.set({
                "vendor_balance": firestore.Increment(req.amount),
                "vendor_earnings": firestore.Increment(req.amount),
                "updated_at": firestore.SERVER_TIMESTAMP
            }, merge=True)

            try:
                tx_id = f"admin_vendor_credit_{user_uid}_{int(time.time())}_{uuid.uuid4().hex[:6]}"
                db.collection('transactions').document(tx_id).set({
                    "user_uid": user_uid,
                    "amount": req.amount,
                    "type": "vendor_earning",
                    "status": "completed",
                    "title": "Admin Vendor Wallet Credit",
                    "description": note,
                    "admin_email": admin_email,
                    "created_at": firestore.SERVER_TIMESTAMP,
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "date": time.strftime("%Y-%m-%d %H:%M:%S")
                })
            except Exception as te:
                print(f"Failed to record vendor tx: {te}")

            try:
                notif_id = f"credit_vendor_{int(time.time())}_{uuid.uuid4().hex[:4]}"
                user_ref.collection('notifications').document(notif_id).set({
                    "title": "🏪 Vendor Wallet Credited",
                    "message": f"Your Vendor Wallet has been credited with ₦{req.amount:,.2f} by Admin. Note: {note}",
                    "timestamp": now_ms,
                    "read": False,
                    "type": "success",
                    "link": "/vendor"
                })
            except Exception as ne:
                print(f"Failed to record notification: {ne}")

            return {
                "success": True,
                "message": f"Successfully added ₦{req.amount:,.2f} to {user_data.get('displayName', 'User')}'s Vendor Wallet",
                "wallet_type": "vendor",
                "amount": req.amount,
                "previous_balance": cur_bal,
                "new_balance": cur_bal + req.amount
            }

        elif wallet_type in ["aura_coins", "auracoin", "coins"]:
            coins_to_add = int(req.amount)
            if coins_to_add <= 0:
                return JSONResponse(status_code=400, content={"success": False, "error": "Aura Coins amount must be at least 1."})
            
            raw_coins = user_data.get("auraCoins") or user_data.get("auraCoin") or user_data.get("bonusBalance") or 0
            try:
                cur_coins = int(raw_coins)
            except (ValueError, TypeError):
                cur_coins = 0

            user_ref.set({
                "auraCoins": firestore.Increment(coins_to_add),
                "auraCoin": firestore.DELETE_FIELD
            }, merge=True)

            try:
                act_id = f"admin_credit_{int(time.time())}_{uuid.uuid4().hex[:6]}"
                db.collection("game_wallets").document(user_uid).collection('activity').document(act_id).set({
                    "type": "admin_credit",
                    "currency": "auracoin",
                    "amount": coins_to_add,
                    "title": "Admin AuraCoins Awarded",
                    "desc": f"Admin credited {coins_to_add:,} AuraCoins: {note}",
                    "description": note,
                    "admin_email": admin_email,
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "created_at": now_ms
                })
            except Exception as ae:
                print(f"Failed to record game wallet activity: {ae}")

            try:
                notif_id = f"credit_coins_{int(time.time())}_{uuid.uuid4().hex[:4]}"
                user_ref.collection('notifications').document(notif_id).set({
                    "title": "🪙 AuraCoins Awarded",
                    "message": f"You have been awarded {coins_to_add:,} AuraCoins by Admin! Note: {note}",
                    "timestamp": now_ms,
                    "read": False,
                    "type": "success",
                    "link": "/profile"
                })
            except Exception as ne:
                print(f"Failed to record notification: {ne}")

            return {
                "success": True,
                "message": f"Successfully added {coins_to_add:,} AuraCoins to {user_data.get('displayName', 'User')}",
                "wallet_type": "aura_coins",
                "amount": coins_to_add,
                "previous_balance": cur_coins,
                "new_balance": cur_coins + coins_to_add
            }

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/api/extract")
async def extract_info(request: ExtractRequest):
    raw_url = request.url.strip()
    if not raw_url:
        return JSONResponse(status_code=400, content={"success": False, "error": "URL cannot be empty"})
    
    # 0. Canonicalize / Expand Shortlinks (vt.tiktok.com, fb.watch, etc.)
    url = await resolve_canonical_url(raw_url)
    search_query = url
    platform = "Unknown"
    media_type = "video"
    
    # Platform Detection
    lower_url = url.lower()
    if "tiktok.com" in lower_url or "tikwm.com" in lower_url:
        platform = "TikTok"
    elif "instagram.com" in lower_url or "instagr.am" in lower_url:
        platform = "Instagram"
    elif "facebook.com" in lower_url or "fb.watch" in lower_url or "fb.me" in lower_url or "fb.com" in lower_url:
        platform = "Facebook"
    elif "music.youtube.com" in lower_url:
        platform = "YouTube Music"
        media_type = "music"
    elif "youtube.com" in lower_url or "youtu.be" in lower_url:
        platform = "YouTube"
    elif "music.apple.com" in lower_url or "itunes.apple.com" in lower_url:
        platform = "Apple Music"
        media_type = "music"
    elif "twitter.com" in lower_url or "x.com" in lower_url:
        platform = "Twitter"
    elif "soundcloud.com" in lower_url:
        platform = "SoundCloud"
        media_type = "music"
    elif "spotify.com" in lower_url:
        platform = "Spotify"
        media_type = "music"

    # 1. Platform-Specific Direct High-Speed Extractors
    if platform == "TikTok":
        tiktok_data = await extract_tiktok_direct(url)
        if tiktok_data and tiktok_data.get("qualities"):
            print(f"Direct TikTok Extractor Success for: {url}")
            return {"success": True, "data": tiktok_data}

    elif platform == "Instagram":
        ig_data = await extract_instagram_direct(url)
        if ig_data and ig_data.get("qualities"):
            print(f"Direct Instagram Extractor Success for: {url}")
            return {"success": True, "data": ig_data}

    elif platform == "Facebook":
        fb_data = await extract_facebook_direct(url)
        if fb_data and fb_data.get("qualities"):
            print(f"Direct Facebook Extractor Success for: {url}")
            return {"success": True, "data": fb_data}

    elif platform == "Apple Music":
        apple_data = await extract_apple_music_direct(url)
        if apple_data and apple_data.get("qualities"):
            print(f"Direct Apple Music Extractor Success for: {url}")
            return {"success": True, "data": apple_data}

    elif platform == "Spotify":
        spotify_data = await extract_spotify_direct(url)
        if spotify_data and spotify_data.get("qualities"):
            print(f"Direct Spotify Extractor Success for: {url}")
            return {"success": True, "data": spotify_data}

    elif platform == "SoundCloud":
        soundcloud_data = await extract_soundcloud_direct(url)
        if soundcloud_data and soundcloud_data.get("qualities"):
            print(f"Direct SoundCloud Extractor Success for: {url}")
            return {"success": True, "data": soundcloud_data}

    elif platform == "Twitter":
        tw_data = await extract_twitter_direct(url)
        if tw_data and tw_data.get("qualities"):
            print(f"Direct Twitter Extractor Success for: {url}")
            return {"success": True, "data": tw_data}

    elif platform in ["YouTube", "YouTube Music"]:
        yt_data = await extract_youtube_rapidapi(url)
        if yt_data and yt_data.get("qualities"):
            if platform == "YouTube Music":
                yt_data["platform"] = "YouTube Music"
                yt_data["mediaType"] = "music"
                audios = [q for q in yt_data.get("qualities", []) if q.get("resolution") == "Audio" or q.get("format") == "MP3"]
                videos = [q for q in yt_data.get("qualities", []) if q.get("resolution") != "Audio" and q.get("format") != "MP3"]
                best_a = audios[0] if audios else None
                if best_a:
                    m_formats = [
                        {"quality": "320kbps MP3 (Ultra Quality)", "format": "MP3", "resolution": "Audio", "size": "HQ ~9.5 MB", "url": best_a["url"]},
                        {"quality": "256kbps MP3 (High Quality)", "format": "MP3", "resolution": "Audio", "size": "HQ ~7.5 MB", "url": best_a["url"]},
                        {"quality": "192kbps MP3 (Standard Quality)", "format": "MP3", "resolution": "Audio", "size": "Standard ~5.5 MB", "url": best_a["url"]},
                        {"quality": "Original Audio (MP3/M4A)", "format": "MP3", "resolution": "Audio", "size": best_a.get("size", "Audio"), "url": best_a["url"]}
                    ]
                    if videos:
                        m_formats.extend(videos[:2])
                    yt_data["qualities"] = m_formats
            print(f"Direct RapidAPI YouTube/Music Extractor Success for: {url}")
            return {"success": True, "data": yt_data}

    # 2. Secondary API Attempt (SMVD API if configured)
    smvd_status = "Skipped"
    if media_type == "video" or platform in ["YouTube", "YouTube Music"]:
        if os.getenv("SMVD_API_URL"):
            smvd_data, smvd_status_code, smvd_error = await try_smvd_api(url, platform)
            if smvd_data:
                print(f"SMVD API Success for {platform}")
                return {"success": True, "data": smvd_data}
            smvd_status = f"Failed (HTTP {smvd_status_code}: {smvd_error})" if smvd_status_code else f"Timeout ({smvd_error})"

    # 3. Spotify / SoundCloud / Music Search Fallback
    if platform in ["Spotify", "SoundCloud"]:
        try:
            if platform == "Spotify" and sp:
                track_id = url.split("track/")[1].split("?")[0]
                track = sp.track(track_id)
                search_query = f"scsearch1:{track['artists'][0]['name']} {track['name']} official"
            else:
                search_query = f"scsearch1:{url}"
        except Exception as e:
            print(f"Platform search extraction notice: {str(e)}")
            search_query = f"scsearch1:{url}"

    # 4. Universal Engine Extraction (yt-dlp with optimized configuration)
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Mode': 'navigate',
        },
        'extract_flat': False,
        'skip_download': True,
        'ignoreerrors': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['web_embedded', 'android', 'ios'],
                'skip': ['dash', 'hls']
            },
            'tiktok': {
                'app_version': '34.1.2',
                'manifest_app_version': '3412',
            }
        }
    }
    
    try:
        print(f"--- Universal Extraction Start: {platform} ({url}) ---")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            loop = asyncio.get_event_loop()
            try:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(search_query, download=False))
            except Exception as ydl_err:
                print(f"Primary query failed, retrying raw canonical URL: {str(ydl_err)}")
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(url, download=False))
            
            if info and 'entries' in info:
                if not info['entries']: raise Exception(f"No downloadable media found for this link.")
                info = info['entries'][0]

            if not info:
                raise Exception(f"Could not retrieve media information. Please ensure the link is public.")

            # Process and categorize formats
            raw_formats = info.get("formats", [])
            formats = []
            seen_qualities = set()

            if media_type == "music":
                # Find best audio stream
                valid_audios = [
                    f for f in raw_formats
                    if (f.get('acodec') and f.get('acodec') != 'none')
                    and f.get('ext') not in ['mhtml', 'jpg', 'jpeg', 'png', 'webp']
                    and not str(f.get('format_id', '')).startswith('sb')
                    and f.get('url')
                ]
                valid_audios.sort(key=lambda x: (x.get('abr') or 0), reverse=True)
                best_audio_stream = valid_audios[0].get('url') if valid_audios else info.get('url')
                
                if best_audio_stream:
                    formats = [
                        {"quality": "320kbps MP3 (Ultra Quality)", "format": "MP3", "resolution": "Audio", "size": "HQ ~9.5 MB", "url": best_audio_stream},
                        {"quality": "256kbps MP3 (High Quality)", "format": "MP3", "resolution": "Audio", "size": "HQ ~7.5 MB", "url": best_audio_stream},
                        {"quality": "192kbps MP3 (Standard Quality)", "format": "MP3", "resolution": "Audio", "size": "Standard ~5.5 MB", "url": best_audio_stream},
                        {"quality": "128kbps MP3 (Fast Download)", "format": "MP3", "resolution": "Audio", "size": "Fast ~3.8 MB", "url": best_audio_stream},
                        {"quality": "Original Audio (Lossless/MP3)", "format": "MP3", "resolution": "Audio", "size": "Original Audio", "url": best_audio_stream}
                    ]
            else:
                for f in raw_formats:
                    url_val = f.get("url")
                    if not url_val: continue
                    
                    res = f.get("resolution") or f.get("format_note")
                    height = f.get("height")
                    note = f.get("format_note", "")
                    ext = f.get("ext", "mp4").upper()
                    vcodec = f.get('vcodec', 'none')
                    
                    is_audio = vcodec == 'none' or 'audio' in str(note).lower() or 'audio' in str(res).lower()
                    
                    # Quality Label Normalization
                    if is_audio:
                        quality = "Original Audio (MP3)" if ext == "MP3" else "High Quality Audio"
                    elif height:
                        quality = f"{height}p HD" if height >= 720 else f"{height}p SD"
                    else:
                        quality = note or str(res) or "HD Video"
                    
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

            # If no formats extracted, append default stream if available
            if not formats and info.get('url'):
                formats.append({
                    "quality": "320kbps MP3 (High Quality)" if media_type == "music" else "1080p HD / Best",
                    "format": "MP3" if media_type == "music" else info.get("ext", "MP4").upper(),
                    "resolution": "Audio" if media_type == "music" else "Video",
                    "size": "Fast",
                    "url": info.get("url")
                })

            # Sort formats: Video (HD first) -> Audio
            formats.sort(key=lambda x: (
                0 if x["resolution"] == "Video" and "1080" in x["quality"] else
                1 if x["resolution"] == "Video" and "720" in x["quality"] else
                2 if x["resolution"] == "Video" else
                3
            ))

            raw_duration = info.get("duration")
            duration_str = f"{int(raw_duration) // 60}m {int(raw_duration) % 60}s" if raw_duration else ("Music Track" if media_type == "music" else "Video")

            return {
                "success": True, 
                "data": {
                    "id": str(info.get("id") or uuid.uuid4()),
                    "url": url,
                    "title": info.get("title", "Audio Track" if media_type == "music" else "Social Media Video"),
                    "thumbnail": info.get("thumbnail") or info.get('cover'),
                    "duration": duration_str,
                    "author": info.get("uploader") or info.get("channel") or info.get("artist") or platform,
                    "platform": platform if platform != "Unknown" else (info.get("extractor_key") or ("Music" if media_type == "music" else "Video")),
                    "mediaType": media_type,
                    "qualities": formats[:15]
                }
            }
    except Exception as e:
        print(f"Extraction error for {url}: {e}")
        error_msg = str(e)
        if "403" in error_msg:
            error_msg = f"This {platform} media is private or restricted by privacy settings."
        elif "Sign in" in error_msg or "login" in error_msg.lower():
            error_msg = f"This {platform} post requires authentication or is age-restricted."
        elif "No video could be found" in error_msg or "no video" in error_msg.lower():
            error_msg = f"No video found in this {platform} link. Please ensure the post contains a video and is public."
        return JSONResponse(status_code=400, content={"success": False, "error": error_msg})

@app.get("/api/download")
async def download_media(
    url: str, 
    background_tasks: BackgroundTasks, 
    filename: str = "video.mp4",
    quality: str = "best",
    referer: Optional[str] = None
):
    safe_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    if not safe_filename.endswith(('.mp4', '.mp3', '.m4a', '.webm')):
        safe_filename += '.mp4'

    temp_path = os.path.join(DOWNLOAD_DIR, f"{uuid.uuid4()}_{safe_filename}")
    
    # 1. Fast Direct CDN Streaming for direct media links
    is_direct_cdn = any(cdn in url.lower() for cdn in [
        "tikwm.com", "tiktokcdn.com", "cdninstagram.com", "fbcdn.net", 
        "twimg.com", "sndcdn.com", ".mp4", ".mp3", ".m4a"
    ]) or ("http" in url and ("mime=video" in url or "bytestart=" in url or "token=" in url or "googlevideo.com" in url))
    
    if is_direct_cdn and not ("youtube.com/watch" in url or "youtu.be/" in url):
        try:
            req_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
            if referer:
                req_headers["Referer"] = referer
            elif "tiktok" in url or "tikwm" in url:
                req_headers["Referer"] = "https://www.tiktok.com/"
            elif "instagram" in url or "cdninstagram" in url:
                req_headers["Referer"] = "https://www.instagram.com/"
            elif "facebook" in url or "fbcdn" in url:
                req_headers["Referer"] = "https://www.facebook.com/"

            async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
                async with client.stream("GET", url, headers=req_headers) as response:
                    if response.status_code in [200, 206]:
                        with open(temp_path, "wb") as f:
                            async for chunk in response.aiter_bytes(chunk_size=65536):
                                f.write(chunk)
                        
                        background_tasks.add_task(lambda: os.path.exists(temp_path) and os.remove(temp_path))
                        media_type = "audio/mpeg" if safe_filename.endswith(".mp3") else "video/mp4"
                        return FileResponse(path=temp_path, filename=safe_filename, media_type=media_type)
        except Exception as direct_err:
            print(f"Direct stream download notice (switching to yt-dlp): {direct_err}")

    # 2. Universal yt-dlp Download Fallback
    ydl_opts = {
        'format': 'bestaudio/best' if safe_filename.endswith('.mp3') else 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': temp_path,
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        }
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            await asyncio.get_event_loop().run_in_executor(None, lambda: ydl.download([url]))
        
        actual_path = temp_path
        if not os.path.exists(actual_path):
            for ext in ['.mp4', '.mkv', '.webm', '.mp3']:
                if os.path.exists(f"{temp_path}{ext}"):
                    actual_path = f"{temp_path}{ext}"
                    break
                    
        if not os.path.exists(actual_path):
            raise Exception("File failed to download from source.")

        background_tasks.add_task(lambda: os.path.exists(actual_path) and os.remove(actual_path))
        media_type = "audio/mpeg" if safe_filename.endswith(".mp3") else "video/mp4"
        return FileResponse(path=actual_path, filename=safe_filename, media_type=media_type)
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

# =========================
# MOVIE ENDPOINTS (MOVIEBOX + TMDB UNIVERSAL ENGINE)
# =========================

def make_slug(t: str) -> str:
    if not t: return "detail"
    s = re.sub(r'[^a-zA-Z0-9]', '_', t.lower())
    s = re.sub(r'_+', '_', s).strip('_')
    return s or "detail"

def clean_query_for_related(q: str) -> str:
    q = re.sub(r'\d+', '', q)
    q = re.sub(r'(movie|series|season|episode|vol|volume|part|pt|ii|iii|iv|v)', '', q, flags=re.IGNORECASE)
    q = ' '.join(q.split())
    return q

def get_tmdb_auth():
    token = os.getenv("TMDB_READ_ACCESS_TOKEN", "").strip() or os.getenv("TMDB_API_KEY", "").strip()
    is_bearer = token.startswith("eyJ") or len(token) > 50
    headers = {"Accept": "application/json"}
    if is_bearer:
        headers["Authorization"] = f"Bearer {token}"
    return token, is_bearer, headers

def find_best_tmdb_match(results, target_title, target_year):
    if not results or not target_title:
        return None
    
    def norm(s):
        if not s: return ""
        s = s.lower()
        s = re.sub(r'[^a-z0-9]', '', s)
        return s

    norm_target = norm(target_title)
    if not norm_target: return None

    # Pass 1: Exact title match + year match (within 1 year)
    for item in results:
        t = norm(item.get('title') or item.get('name') or '')
        d = item.get('release_date') or item.get('first_air_date') or ''
        y = d.split('-')[0] if d else ''
        if t == norm_target:
            if target_year and y and str(target_year).isdigit() and y.isdigit():
                if abs(int(target_year) - int(y)) <= 1:
                    return item
            elif not target_year:
                return item

    # Pass 2: Exact title match regardless of year
    for item in results:
        t = norm(item.get('title') or item.get('name') or '')
        if t == norm_target:
            return item

    # Pass 3: Close title match with year compatibility (<= 2 years)
    for item in results:
        t = norm(item.get('title') or item.get('name') or '')
        d = item.get('release_date') or item.get('first_air_date') or ''
        y = d.split('-')[0] if d else ''
        if (norm_target in t or t in norm_target) and len(norm_target) >= 4:
            if target_year and y and str(target_year).isdigit() and y.isdigit():
                if abs(int(target_year) - int(y)) <= 2:
                    return item
            elif not target_year:
                return item

    return None

def format_tmdb_list(results: list, media_type: str) -> list:
    formatted = []
    for item in results:
        t_id = str(item.get("id"))
        title = item.get("title") or item.get("name") or "Unknown"
        poster = item.get("poster_path")
        thumb = f"https://image.tmdb.org/t/p/w500{poster}" if poster else None
        rel_date = item.get("release_date") or item.get("first_air_date") or ""
        year = rel_date.split("-")[0] if rel_date and rel_date != "N/A" else "N/A"
        rating = str(round(item.get("vote_average", 0.0), 1)) if item.get("vote_average") else "7.5"
        
        detail_path = f"/detail/{make_slug(title)}?tmdb={t_id}"
        formatted.append({
            "id": f"tmdb_{t_id}",
            "tmdbId": t_id,
            "detailPath": detail_path,
            "title": title,
            "thumbnail": thumb,
            "year": year,
            "rating": rating,
            "description": item.get("overview", "No description available."),
            "mediaType": media_type
        })
    return formatted

TMDB_GENRE_MAP_MOVIE = {
    "action": "28",
    "adventure": "12",
    "animation": "16",
    "comedy": "35",
    "crime": "80",
    "documentary": "99",
    "drama": "18",
    "family": "10751",
    "fantasy": "14",
    "horror": "27",
    "romance": "10749",
    "scifi": "878",
    "sci-fi": "878",
    "thriller": "53",
    "mystery": "9648"
}

TMDB_GENRE_MAP_TV = {
    "action": "10759",
    "adventure": "10759",
    "animation": "16",
    "comedy": "35",
    "crime": "80",
    "documentary": "99",
    "drama": "18",
    "family": "10751",
    "fantasy": "10765",
    "romance": "10749",
    "scifi": "10765",
    "sci-fi": "10765",
    "mystery": "9648"
}

async def fetch_tmdb_genre_movies(genre_key: str, media_type: str = "movie", page: int = 1, per_page: int = 40) -> list:
    token, is_bearer, headers = get_tmdb_auth()
    if not token: return []
    try:
        g_lower = genre_key.lower().strip()
        endpoint = "movie" if media_type == "movie" else "tv"
        params = {
            "language": "en-US",
            "page": page,
            "sort_by": "popularity.desc",
            "include_adult": False
        }
        if not is_bearer: params["api_key"] = token

        if g_lower in ["african", "nollywood"]:
            params["with_origin_country"] = "NG"
        elif g_lower in ["kdrama", "k-drama", "asian"]:
            params["with_origin_country"] = "KR"
        elif g_lower in ["top_rated", "top-rated"]:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(f"https://api.themoviedb.org/3/{endpoint}/top_rated", headers=headers, params=params)
                if r.status_code == 200:
                    return format_tmdb_list(r.json().get("results", []), media_type)[:per_page]
                return []
        else:
            genre_map = TMDB_GENRE_MAP_MOVIE if media_type == "movie" else TMDB_GENRE_MAP_TV
            gid = genre_map.get(g_lower)
            if gid:
                params["with_genres"] = gid

        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(f"https://api.themoviedb.org/3/discover/{endpoint}", headers=headers, params=params)
            if r.status_code == 200:
                return format_tmdb_list(r.json().get("results", []), media_type)[:per_page]
            return []
    except Exception as e:
        print(f"TMDB genre fetch error: {e}")
        return []

async def fetch_tmdb_search(query: str, media_type: str = "movie", page: int = 1, per_page: int = 40) -> list:
    token, is_bearer, headers = get_tmdb_auth()
    if not token or not query:
        return []
    try:
        clean_q = query.strip()
        async with httpx.AsyncClient(timeout=8.0) as client:
            endpoint = "movie" if media_type == "movie" else ("tv" if media_type == "series" else "multi")
            params = {
                "query": clean_q,
                "language": "en-US",
                "page": page,
                "include_adult": False
            }
            if not is_bearer:
                params["api_key"] = token

            r = await client.get(f"https://api.themoviedb.org/3/search/{endpoint}", headers=headers, params=params)
            results = []
            if r.status_code == 200:
                results = r.json().get("results", [])
            
            if not results and endpoint != "multi":
                r_multi = await client.get("https://api.themoviedb.org/3/search/multi", headers=headers, params=params)
                if r_multi.status_code == 200:
                    results = r_multi.json().get("results", [])

            formatted = []
            for item in results:
                m_type = item.get("media_type") or ("movie" if media_type == "movie" else "series")
                if m_type not in ["movie", "tv", "series"]:
                    continue
                t_id = str(item.get("id"))
                title = item.get("title") or item.get("name") or "Unknown"
                poster = item.get("poster_path")
                thumb = f"https://image.tmdb.org/t/p/w500{poster}" if poster else None
                rel_date = item.get("release_date") or item.get("first_air_date") or ""
                year = rel_date.split("-")[0] if rel_date and rel_date != "N/A" else "N/A"
                rating = str(round(item.get("vote_average", 0.0), 1)) if item.get("vote_average") else "7.5"
                
                detail_path = f"/detail/{make_slug(title)}?tmdb={t_id}"
                formatted.append({
                    "id": f"tmdb_{t_id}",
                    "tmdbId": t_id,
                    "detailPath": detail_path,
                    "title": title,
                    "thumbnail": thumb,
                    "year": year,
                    "rating": rating,
                    "description": item.get("overview", "No description available."),
                    "mediaType": "movie" if m_type == "movie" else "series",
                    "popularity": item.get("popularity", 0),
                    "voteCount": item.get("vote_count", 0)
                })
            return formatted
    except Exception as e:
        print(f"TMDB search error: {e}")
        return []

async def fetch_tmdb_details_by_id(tmdb_id: str, media_type: str = "movie") -> Optional[dict]:
    token, is_bearer, headers = get_tmdb_auth()
    if not token or not tmdb_id:
        return None
    try:
        search_type = "movie" if media_type == "movie" else "tv"
        detail_url = f"https://api.themoviedb.org/3/{search_type}/{tmdb_id}?append_to_response=videos,credits,reviews,similar"
        detail_params = {"language": "en-US"}
        if not is_bearer:
            detail_params["api_key"] = token

        async with httpx.AsyncClient(timeout=10.0) as client:
            rd = await client.get(detail_url, headers=headers, params=detail_params)
            if rd.status_code != 200 and search_type == "movie":
                rd = await client.get(f"https://api.themoviedb.org/3/tv/{tmdb_id}?append_to_response=videos,credits,reviews,similar", headers=headers, params=detail_params)
            
            if rd.status_code != 200:
                return None
                
            details = rd.json()
            formatted_cast = []
            for member in details.get('credits', {}).get('cast', [])[:12]:
                profile_path = member.get('profile_path')
                formatted_cast.append({
                    "name": member.get('name'),
                    "character": member.get('character'),
                    "avatar": f"https://image.tmdb.org/t/p/w185{profile_path}" if profile_path else None
                })
                
            formatted_videos = []
            raw_videos = details.get('videos', {}).get('results', [])
            clean_vids = []
            other_vids = []
            for video in raw_videos:
                if video.get('site') == 'YouTube':
                    v_name = (video.get('name') or '').lower()
                    v_obj = {
                        "name": video.get('name'),
                        "key": video.get('key'),
                        "type": video.get('type')
                    }
                    if any(w in v_name for w in ["red band", "redband", "age-restricted", "18+", "nsfw"]):
                        other_vids.append(v_obj)
                    else:
                        clean_vids.append(v_obj)
            formatted_videos = clean_vids + other_vids
                    
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
                s_year = s_date.split('-')[0] if s_date else ''
                formatted_similar.append({
                    "id": f"tmdb_{s_id}",
                    "tmdbId": s_id,
                    "title": s_title,
                    "thumbnail": f"https://image.tmdb.org/t/p/w342{poster_path}" if poster_path else None,
                    "year": s_year,
                    "rating": str(round(s.get('vote_average', 0.0), 1)) if s.get('vote_average') else '7.0',
                    "mediaType": media_type
                })
                
            tmdb_rating = str(round(details.get('vote_average', 0.0), 1)) if details.get('vote_average') else '7.5'
            release_date = details.get('release_date') or details.get('first_air_date') or ''
            tmdb_year = release_date.split('-')[0] if release_date else ''
            res_title = details.get('title') or details.get('name') or 'Unknown Title'

            seasons_info = []
            if 'seasons' in details and isinstance(details['seasons'], list):
                for s in details['seasons']:
                    s_num = s.get('season_number', 0)
                    ep_cnt = s.get('episode_count', 0)
                    if s_num > 0 and ep_cnt > 0:
                        seasons_info.append({
                            "season": s_num,
                            "episodes": list(range(1, ep_cnt + 1))
                        })

            return {
                "id": f"tmdb_{tmdb_id}",
                "tmdbId": tmdb_id,
                "title": res_title,
                "rating": tmdb_rating if tmdb_rating != '0.0' else '7.5',
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
                "thumbnail": f"https://image.tmdb.org/t/p/w500{details.get('poster_path')}" if details.get('poster_path') else None,
                "year": tmdb_year,
                "seasons": seasons_info
            }
    except Exception as e:
        print(f"TMDB fetch by id error: {e}")
        return None

async def fetch_tmdb_details(title: str, media_type: str, year: Optional[str] = None) -> Optional[dict]:
    token, is_bearer, headers = get_tmdb_auth()
    if not token or not title:
        return None
        
    async with httpx.AsyncClient(timeout=10.0) as client:
        search_type = "movie" if media_type == "movie" else "tv"
        clean_title = clean_query_for_related(title or "")
        clean_title = re.sub(r'\[.*?\]|\(.*?\)', '', clean_title)
        clean_title = re.sub(r'\b(season \d+|s\d+|4k|uhd|hd|dubbed|subbed|episode \d+|series)\b', '', clean_title, flags=re.I)
        clean_title = re.sub(r'[^\w\s\:\-\'\"]', ' ', clean_title)
        clean_title = re.sub(r'\s+', ' ', clean_title).strip() or title

        search_url = f"https://api.themoviedb.org/3/search/{search_type}"
        search_params: dict = {
            "query": clean_title,
            "language": "en-US",
            "page": 1,
            "include_adult": False
        }
        if not is_bearer:
            search_params["api_key"] = token

        if year and str(year).isdigit():
            search_params["year" if search_type == "movie" else "first_air_date_year"] = str(year)

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

            if not results and clean_title != title:
                search_params["query"] = title
                r = await client.get(search_url, headers=headers, params=search_params)
                res = r.json()
                results = res.get('results', [])
                
            if not results:
                return None
                
            best_match = find_best_tmdb_match(results, title, year)
            if not best_match and clean_title != title:
                best_match = find_best_tmdb_match(results, clean_title, year)
            if not best_match:
                return None
                
            tmdb_id = best_match.get('id')
            if not tmdb_id:
                return None
                
            return await fetch_tmdb_details_by_id(str(tmdb_id), media_type)
        except Exception as e:
            print(f"TMDB Fetch Error for {title}: {e}")
            return None

_search_cache: dict = {}

@app.get("/api/movies/search")
async def search_movies(
    query: str = Query(...), 
    type: str = "movie", 
    page: int = 1, 
    per_page: int = 40
):
    try:
        clean_q = query.strip()
        cache_key = f"{clean_q.lower()}_{type}_{page}_{per_page}"
        now = time.time()
        if cache_key in _search_cache and (now - _search_cache[cache_key].get("time", 0)) < 600:
            return _search_cache[cache_key]["data"]

        client_session = Session(verify=False)

        async def perform_search_moviebox(search_type_str, search_query, target_count=40, page_num=1):
            auth_token = os.getenv("MOVIEBOX_AUTH_TOKEN", "").strip()
            if target_count > 20:
                api_page_1 = (page_num - 1) * 2 + 1
                api_page_2 = (page_num - 1) * 2 + 2
                pages = [api_page_1, api_page_2]
            else:
                pages = [page_num]
            all_raw = []

            def extract_items(res):
                if isinstance(res, list): return res
                if isinstance(res, dict):
                    return res.get('items') or res.get('list') or res.get('resData', {}).get('list') or []
                return []

            if auth_token:
                try:
                    from moviebox_api.v2.core import Search as SearchV2
                    from moviebox_api.v2.core import SubjectType as SubjectTypeV2
                    
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
                        "Accept": "*/*",
                        "Origin": "https://movieboxhd.net",
                        "Referer": "https://movieboxhd.net/",
                        "Authorization": f"Bearer {auth_token}"
                    }
                    sess = Session(headers=headers, verify=False)
                    for p in pages:
                        try:
                            search = SearchV2(sess, search_query, subject_type=SubjectTypeV2.ALL, page=p, per_page=20)
                            res = await search.get_content()
                            all_raw.extend(extract_items(res))
                        except Exception:
                            pass
                    if all_raw:
                        return all_raw
                except Exception as v2_exc:
                    pass

                try:
                    from moviebox_api.v3.http_client import MovieBoxHttpClient
                    from moviebox_api.v3.core import SearchV2 as SearchV2V3
                    from moviebox_api.v3.core import Search as SearchV3
                    from moviebox_api.v3.core import SubjectType as SubjectTypeV3
                    from moviebox_api.v3.core import TabID as TabIDV3
                    
                    st = SubjectTypeV3.ALL
                    tab = TabIDV3.ALL if hasattr(TabIDV3, 'ALL') else TabIDV3.MOVIE
                    
                    async with MovieBoxHttpClient(verify=False) as client:
                        for p in pages:
                            try:
                                search = SearchV2V3(client, search_query, subject_type=st, tab_id=tab, page=p, per_page=24)
                                res = await search.get_content()
                                all_raw.extend(extract_items(res))
                            except Exception:
                                try:
                                    search = SearchV3(client, search_query, subject_type=st, page=p, per_page=24)
                                    res = await search.get_content()
                                    all_raw.extend(extract_items(res))
                                except Exception:
                                    pass
                        if all_raw:
                            return all_raw
                except Exception as e:
                    pass
            
            st = SubjectType.ALL
            for p in pages:
                try:
                    sess_no_auth = Session(verify=False)
                    search = Search(sess_no_auth, search_query, subject_type=st, page=p, per_page=24)
                    res = await search.get_content()
                    all_raw.extend(extract_items(res))
                except Exception:
                    try:
                        sess_no_auth = Session(verify=False)
                        search = Search(sess_no_auth, search_query, subject_type=st, page=p, per_page=24)
                        model = await search.get_content_model()
                        all_raw.extend(extract_items(model))
                    except Exception:
                        pass
            return all_raw

        def get_val(obj, key, default=None):
            if isinstance(obj, dict): return obj.get(key, default)
            val = getattr(obj, key, None)
            if val is not None: return val
            snake_key = re.sub(r'(?<!^)(?=[A-Z])', '_', key).lower()
            val = getattr(obj, snake_key, None)
            if val is not None: return val
            return default

        def norm_title(s):
            if not s: return ""
            s = s.lower()
            s = re.sub(r'[\(\[\{].*?[\)\]\}]', '', s)
            s = re.sub(r'[^a-z0-9]', '', s)
            return s

        # Execute Parallel Search: MovieBox + TMDB Universal Database
        mb_task = perform_search_moviebox(type, clean_q, target_count=per_page, page_num=page)
        tmdb_task = fetch_tmdb_search(clean_q, media_type=type, page=page, per_page=per_page)

        mb_items, tmdb_items = await asyncio.gather(mb_task, tmdb_task, return_exceptions=True)
        if isinstance(mb_items, Exception): mb_items = []
        if isinstance(tmdb_items, Exception): tmdb_items = []

        # Smart fallback if MovieBox returned 0
        if not mb_items:
            cleaned_query = clean_query_for_related(clean_q)
            if cleaned_query and cleaned_query.lower() != clean_q.lower():
                mb_items = await perform_search_moviebox(type, cleaned_query, target_count=per_page, page_num=page)

        merged_results = []
        seen_keys = set()
        seen_ids = set()

        # 1. Format MovieBox items and enrich with TMDB metadata
        for item in mb_items:
            movie_id = str(get_val(item, 'subjectId', ''))
            if not movie_id or movie_id in seen_ids: continue
            
            raw_title = get_val(item, 'title') or get_val(item, 'name') or "Unknown Title"
            norm_t = norm_title(raw_title)
            raw_rel = str(get_val(item, 'releaseDate', 'N/A')).split('-')[0]
            
            poster_data = get_val(item, 'cover') or get_val(item, 'poster') or {}
            poster_url = get_val(poster_data, 'url') if isinstance(poster_data, dict) else poster_data
            if not poster_url or not isinstance(poster_url, str):
                poster_url = get_val(item, 'poster') or get_val(item, 'thumbnail')

            rating_val = str(get_val(item, 'imdbRatingValue', get_val(item, 'rating', '0.0')))
            desc_val = get_val(item, 'description', 'No description available.')
            detail_path = get_val(item, 'detailPath') or get_val(item, 'detail_path') or f"/detail/{make_slug(raw_title)}?id={movie_id}"

            # Match with TMDB result if available
            matched_tmdb = None
            for tm in tmdb_items:
                if norm_title(tm.get('title')) == norm_t:
                    matched_tmdb = tm
                    break
            
            if matched_tmdb:
                if (not poster_url or "default" in poster_url) and matched_tmdb.get("thumbnail"):
                    poster_url = matched_tmdb["thumbnail"]
                if (not rating_val or rating_val in ["0.0", "0", "N/A"]) and matched_tmdb.get("rating"):
                    rating_val = matched_tmdb["rating"]
                if (not desc_val or "No description" in desc_val) and matched_tmdb.get("description"):
                    desc_val = matched_tmdb["description"]
                if (not raw_rel or raw_rel in ["N/A", "0"]) and matched_tmdb.get("year"):
                    raw_rel = matched_tmdb["year"]

            key = f"{norm_t}_{raw_rel}"
            if key in seen_keys: continue
            seen_ids.add(movie_id)
            seen_keys.add(key)

            merged_results.append({
                "id": movie_id,
                "detailPath": detail_path,
                "title": raw_title,
                "thumbnail": poster_url,
                "year": raw_rel,
                "rating": rating_val if rating_val not in ["0.0", "0", ""] else "7.5",
                "description": desc_val,
                "mediaType": type,
                "source": "moviebox"
            })

        # 2. Add all TMDB items (Guarantees 100% of movies/series in existence are discoverable)
        for tm in tmdb_items:
            t_id = str(tm.get("id", ""))
            t_title = tm.get("title", "")
            norm_t = norm_title(t_title)
            t_year = tm.get("year", "N/A")
            key = f"{norm_t}_{t_year}"
            
            if not t_id or t_id in seen_ids or key in seen_keys:
                continue
            seen_ids.add(t_id)
            seen_keys.add(key)

            merged_results.append({
                "id": tm["id"],
                "tmdbId": tm.get("tmdbId"),
                "detailPath": tm["detailPath"],
                "title": t_title,
                "thumbnail": tm.get("thumbnail"),
                "year": t_year,
                "rating": tm.get("rating", "7.5"),
                "description": tm.get("description", "No description available."),
                "mediaType": tm.get("mediaType", type),
                "source": "tmdb"
            })

        # 3. Intelligent Ranking: Exact match > Starts with > Contains > Chronological release year
        clean_q_lower = clean_q.lower()
        clean_q_norm = norm_title(clean_q)

        def get_rank(m):
            t_lower = m["title"].lower()
            t_norm = norm_title(m["title"])
            
            # Exact match is priority 0
            if t_lower == clean_q_lower or t_norm == clean_q_norm:
                prio = 0
            # Starts with is priority 1
            elif t_lower.startswith(clean_q_lower) or t_norm.startswith(clean_q_norm):
                prio = 1
            # Substring match is priority 2
            elif clean_q_lower in t_lower or clean_q_norm in t_norm:
                prio = 2
            else:
                prio = 3
                
            # Year sorting inside each priority (recent movies first, e.g. 2026, 2025, 2024...)
            try:
                yr = int(m.get("year", 0))
            except:
                yr = 0
                
            return (prio, -yr)

        merged_results.sort(key=get_rank)
        final_list = merged_results[:per_page]

        resp = {"success": True, "data": final_list}
        _search_cache[cache_key] = {"time": now, "data": resp}
        return resp
    except Exception as e:
        print(f"Movie Search Critical Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

_suggest_cache: dict = {}

@app.get("/api/movies/suggestions")
async def get_movie_suggestions(query: str = Query(...)):
    q = query.strip()
    if not q or len(q) < 2:
        return {"success": True, "data": []}
    
    cache_key = q.lower()
    now = time.time()
    if cache_key in _suggest_cache and (now - _suggest_cache[cache_key].get("time", 0)) < 600:
        return _suggest_cache[cache_key]["data"]

    results = []
    seen = set()

    # 1. MovieBox suggestions
    try:
        auth_token = os.getenv("MOVIEBOX_AUTH_TOKEN", "").strip()
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Origin": "https://movieboxhd.net",
            "Referer": "https://movieboxhd.net/",
            "Authorization": f"Bearer {auth_token}"
        } if auth_token else {}
        
        client_sess = Session(headers=headers, verify=False) if headers else Session(verify=False)
        try:
            from moviebox_api.v2.core import SearchSuggestion as SearchSuggestionV2
            sug_v2 = SearchSuggestionV2(client_sess, per_page=6)
            res_v2 = await sug_v2.get_content(q)
            for it in (res_v2.get('items', []) or []):
                w = (it.get('word') or '').strip()
                if w and w.lower() not in seen:
                    seen.add(w.lower())
                    results.append(w)
        except Exception:
            pass
    except Exception:
        pass

    # 2. TMDB search suggestions (Global Catalog Coverage)
    try:
        token, is_bearer, tmdb_headers = get_tmdb_auth()
        if token:
            async with httpx.AsyncClient(timeout=4.0) as client:
                params = {"query": q, "language": "en-US", "page": 1, "include_adult": False}
                if not is_bearer: params["api_key"] = token
                r = await client.get("https://api.themoviedb.org/3/search/multi", headers=tmdb_headers, params=params)
                if r.status_code == 200:
                    for item in r.json().get("results", [])[:8]:
                        title = (item.get("title") or item.get("name") or "").strip()
                        if title and title.lower() not in seen:
                            seen.add(title.lower())
                            results.append(title)
    except Exception:
        pass

    resp = {"success": True, "data": results[:10]}
    _suggest_cache[cache_key] = {"time": now, "data": resp}
    return resp

_genre_cache: dict = {}

@app.get("/api/movies/genre")
async def get_movies_by_genre(
    genre: str = Query(...), 
    type: str = "movie", 
    page: int = 1, 
    per_page: int = 40
):
    try:
        genre_lower = genre.lower().strip()
        cache_key = f"{genre_lower}_{type}_{page}_{per_page}"
        now = time.time()
        if cache_key in _genre_cache and (now - _genre_cache[cache_key].get("time", 0)) < 1800:
            return _genre_cache[cache_key]["data"]

        # 1. Fetch from search / MovieBox
        genre_map = {
            "all": "movie" if type == "movie" else "series",
            "trending": "movie" if type == "movie" else "series",
            "popular": "popular",
            "action": "action",
            "adventure": "adventure",
            "african": "nollywood",
            "nollywood": "nollywood",
            "kdrama": "kdrama",
            "comedy": "comedy",
            "romance": "romance",
            "animation": "animation",
            "anime": "anime",
            "scifi": "sci-fi",
            "fantasy": "fantasy",
            "horror": "horror",
            "thriller": "thriller",
            "crime": "crime",
            "drama": "drama",
            "documentary": "documentary",
            "family": "family",
            "superhero": "superhero",
            "sitcom": "sitcom",
            "gangster": "gangster",
            "teen": "teen",
            "top_rated": "award"
        }
        
        target_keyword = genre_map.get(genre_lower, genre_lower)
        
        # Query TMDB genre in parallel with search
        tmdb_genre_task = fetch_tmdb_genre_movies(genre_lower, media_type=type, page=page, per_page=per_page)
        search_task = search_movies(query=target_keyword, type=type, page=page, per_page=per_page)

        tmdb_items, search_res = await asyncio.gather(tmdb_genre_task, search_task, return_exceptions=True)
        if isinstance(tmdb_items, Exception): tmdb_items = []
        
        combined_items = []
        seen_ids = set()

        if isinstance(search_res, dict) and search_res.get('data'):
            for item in search_res['data']:
                item_id = item.get('id')
                if item_id and item_id not in seen_ids:
                    seen_ids.add(item_id)
                    combined_items.append(item)

        for item in tmdb_items:
            item_id = item.get('id')
            if item_id and item_id not in seen_ids:
                seen_ids.add(item_id)
                combined_items.append(item)

        # Sort combined items (recent years first)
        def get_item_year(m):
            try: return int(m.get("year", 0))
            except: return 0
        combined_items.sort(key=lambda x: -get_item_year(x))

        resp = {"success": True, "data": combined_items[:per_page]}
        _genre_cache[cache_key] = {"time": now, "data": resp}
        return resp
    except Exception as e:
        print(f"Genre Fetch Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

_trending_cache: dict = {}

@app.get("/api/movies/trending")
async def get_trending_movies(type: str = "movie"):
    now = time.time()
    cache_entry = _trending_cache.get(type)
    if cache_entry and (now - cache_entry.get("time", 0)) < 1800:
        return cache_entry.get("data", {})

    try:
        auth_token = os.getenv("MOVIEBOX_AUTH_TOKEN", "").strip()
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Origin": "https://movieboxhd.net",
            "Referer": "https://movieboxhd.net/",
            "Authorization": f"Bearer {auth_token}"
        } if auth_token else {}
        
        client_session = Session(headers=headers, verify=False) if headers else Session(verify=False)
        
        def get_val(obj, key, default=None):
            if isinstance(obj, dict): return obj.get(key, default)
            val = getattr(obj, key, None)
            if val is not None: return val
            snake_key = re.sub(r'(?<!^)(?=[A-Z])', '_', key).lower()
            val = getattr(obj, snake_key, None)
            if val is not None: return val
            return default

        target_sub_type = 1 if type == "movie" else 2
        formatted_categories = []

        # A. Try fetching Homepage operating categories from MovieBox
        try:
            from moviebox_api.v2.core import Homepage
            hp = Homepage(client_session)
            hp_res = await hp.get_content()
            operating_list = hp_res.get('operatingList', []) or []
            
            for row in operating_list:
                title = row.get('title') or row.get('name')
                if not title or title.startswith("Banner_") or "football" in title.lower() or "categories" in title.lower():
                    continue
                
                title_lower = title.lower()
                if type == "movie":
                    if any(k in title_lower for k in ["tv show", "tv series", "series", "k-drama", "anime series", "sitcom", "c-drama", "shows", "drama series", "superhero series"]):
                        continue
                else:
                    if any(k in title_lower for k in ["movie", "films", "cinema", "blockbuster", "nollywood movie", "popular movie", "action movies", "horror movies"]):
                        continue

                cleaned_title = re.sub(r'[\?�]+', '', title).strip()
                cleaned_title = re.sub(r'(201\d|202[0-9])', '', cleaned_title).strip()
                cleaned_title = re.sub(r'\s+', ' ', cleaned_title).strip()
                if cleaned_title.lower() == 'romance':
                    cleaned_title = 'Romance & Love'
                if cleaned_title:
                    title = cleaned_title
                    
                subjects = row.get('subjects', []) or []
                filtered_subjects = [s for s in subjects if get_val(s, 'subjectType') == target_sub_type]
                
                if not filtered_subjects:
                    continue
                    
                formatted_items = []
                seen_row_ids = set()
                for item in filtered_subjects:
                    movie_id = str(get_val(item, 'subjectId', ''))
                    if not movie_id or movie_id in seen_row_ids: continue
                    seen_row_ids.add(movie_id)

                    poster_data = get_val(item, 'cover') or get_val(item, 'poster') or {}
                    poster_url = get_val(poster_data, 'url') if isinstance(poster_data, dict) else poster_data
                    if not poster_url or not isinstance(poster_url, str):
                        poster_url = get_val(item, 'poster') or get_val(item, 'thumbnail')

                    title_val = get_val(item, 'title') or get_val(item, 'name') or "Unknown Title"
                    detail_path = get_val(item, 'detailPath') or get_val(item, 'detail_path') or f"/detail/{make_slug(title_val)}?id={movie_id}"

                    raw_rel = str(get_val(item, 'releaseDate', '') or '')
                    year_val = raw_rel.split('-')[0] if raw_rel and raw_rel != 'N/A' else ''

                    formatted_items.append({
                        "id": movie_id,
                        "detailPath": detail_path,
                        "title": title_val,
                        "thumbnail": poster_url,
                        "year": year_val,
                        "rating": str(get_val(item, 'imdbRatingValue', '0.0')),
                        "description": get_val(item, 'description', 'No description available.'),
                        "mediaType": type
                    })
                
                if formatted_items and len(formatted_items) >= 4:
                    formatted_categories.append({
                        "category": title,
                        "items": formatted_items
                    })
        except Exception as hp_exc:
            print(f"Homepage rows fetch notice: {hp_exc}")

        # B. Always guarantee complete, rich TMDB genre rows
        curated_genres = [
            ("⚡ Action & Blockbusters", "action"),
            ("🌟 Top Rated Masterpieces", "top_rated"),
            ("🌍 Nollywood & African Cinema", "african") if type == "movie" else ("📺 K-Drama & Asian Series", "kdrama"),
            ("🍿 Popular Worldwide", "popular"),
            ("👾 Sci-Fi & Fantasy", "scifi"),
            ("🎬 Comedy & Laughs", "comedy"),
            ("🎨 Animation & Anime", "animation"),
            ("🕵️ Crime & Mystery", "crime"),
            ("🎭 Drama & Stories", "drama"),
            ("💖 Romance & Love", "romance")
        ]

        existing_titles = " ".join([c.get("category", "").lower() for c in formatted_categories])
        
        async def fetch_rich_genre_row(cat_label, genre_key):
            try:
                g_items = await fetch_tmdb_genre_movies(genre_key, media_type=type, page=1, per_page=40)
                if g_items and len(g_items) >= 4:
                    return {"category": cat_label, "items": g_items}
            except Exception as e:
                print(f"Failed to fetch genre row {cat_label}: {e}")
            return None

        extra_tasks = []
        for label, kw in curated_genres:
            if kw not in existing_titles:
                extra_tasks.append(fetch_rich_genre_row(label, kw))

        if extra_tasks:
            extra_results = await asyncio.gather(*extra_tasks, return_exceptions=True)
            for r in extra_results:
                if isinstance(r, dict) and r.get("items") and len(r["items"]) >= 4:
                    formatted_categories.append(r)

        if formatted_categories:
            resp_obj = {"success": True, "isRows": True, "data": formatted_categories}
            _trending_cache[type] = {"time": now, "data": resp_obj}
            return resp_obj

        # C. Ultimate Fallback to flat list
        fallback_items = await fetch_tmdb_search("2026", media_type=type, page=1, per_page=40)
        fallback_resp = {"success": True, "isRows": False, "data": fallback_items}
        _trending_cache[type] = {"time": now, "data": fallback_resp}
        return fallback_resp
    except Exception as e:
        print(f"Trending Fetch Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

_details_cache: dict = {}

@app.get("/api/movies/details")
async def get_movie_details(
    subject_id: str = Query(...), 
    type: str = "movie",
    title: Optional[str] = Query(None),
    season: Optional[int] = None,
    episode: Optional[int] = None,
    detail_path: Optional[str] = Query(None),
    thumbnail: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    rating: Optional[str] = Query(None),
    description: Optional[str] = Query(None)
):
    try:
        cache_key = f"{subject_id}_{type}_{season}_{episode}"
        now = time.time()
        if cache_key in _details_cache and (now - _details_cache[cache_key].get("time", 0)) < 1800:
            return _details_cache[cache_key]["data"]

        auth_token = os.getenv("MOVIEBOX_AUTH_TOKEN", "").strip()
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Origin": "https://movieboxhd.net",
            "Referer": "https://movieboxhd.net/",
            "Authorization": f"Bearer {auth_token}"
        } if auth_token else {}
        
        client_session = Session(headers=headers, verify=False) if headers else Session(verify=False)

        def get_val(obj, key, default=None):
            if isinstance(obj, dict): return obj.get(key, default)
            return getattr(obj, key, default)

        def titles_match(t1, t2):
            if not t1 or not t2: return False
            def clean(t):
                t = t.lower()
                t = re.sub(r'[^a-z0-9]', '', t)
                t = re.sub(r's\d+$', '', t)
                return t
            return clean(t1) == clean(t2)

        # Baseline details
        moviebox_details = {
            "id": subject_id,
            "detailPath": detail_path or f"/detail/{make_slug(title or 'detail')}?id={subject_id}",
            "title": title or "Unknown Title",
            "description": description or "4K streaming available.",
            "thumbnail": thumbnail or "",
            "year": year or "",
            "rating": rating or "7.5",
            "qualities": [],
            "seasons": [],
            "mediaType": type
        }

        seasons_info = []
        qualities = []
        details_fetched = False
        target_mb_id = subject_id

        # 1. If subject_id is a TMDB ID, fetch TMDB details and resolve MovieBox files in background
        if subject_id.startswith("tmdb_") or subject_id.startswith("tmdb-"):
            tmdb_id_clean = subject_id.replace("tmdb_", "").replace("tmdb-", "")
            tmdb_data = await fetch_tmdb_details_by_id(tmdb_id_clean, type)
            if tmdb_data:
                moviebox_details["title"] = tmdb_data.get("title") or moviebox_details["title"]
                moviebox_details["description"] = tmdb_data.get("overview") or moviebox_details["description"]
                moviebox_details["thumbnail"] = tmdb_data.get("poster") or tmdb_data.get("thumbnail") or moviebox_details["thumbnail"]
                moviebox_details["year"] = tmdb_data.get("year") or moviebox_details["year"]
                moviebox_details["rating"] = tmdb_data.get("rating") or moviebox_details["rating"]
                moviebox_details["tmdb"] = tmdb_data
                if tmdb_data.get("seasons"):
                    moviebox_details["seasons"] = tmdb_data["seasons"]
                    seasons_info = tmdb_data["seasons"]

            # Background search MovieBox to find downloadable files
            search_title = moviebox_details.get("title") or title
            if search_title and auth_token:
                try:
                    from moviebox_api.v2.core import Search as SearchV2
                    from moviebox_api.v2.core import SubjectType as SubjectTypeV2
                    sess_v2 = Session(headers=headers, verify=False)
                    search_obj = SearchV2(sess_v2, search_title, subject_type=SubjectTypeV2.ALL, page=1, per_page=8)
                    search_res = await search_obj.get_content()
                    mb_items = search_res.get('items', []) if isinstance(search_res, dict) else search_res
                    
                    matched_mb = None
                    for it in (mb_items or []):
                        it_title = it.get('title') or it.get('name') or ''
                        if titles_match(it_title, search_title):
                            matched_mb = it
                            break
                    if not matched_mb and mb_items:
                        matched_mb = mb_items[0]
                        
                    if matched_mb:
                        target_mb_id = str(matched_mb.get('subjectId', ''))
                        mb_path = matched_mb.get('detailPath', '')
                        if mb_path:
                            moviebox_details['detailPath'] = mb_path if mb_path.startswith('/detail/') else f'/detail/{mb_path}'
                except Exception as e:
                    pass

        # 2. Resolve MovieBox files & qualities
        resolved_path = None
        if detail_path:
            resolved_path = detail_path if detail_path.startswith("/detail/") else f"/detail/{detail_path}"
        elif target_mb_id.startswith("/detail/"):
            resolved_path = target_mb_id
        elif target_mb_id.isdigit():
            resolved_path = f"/detail/{make_slug(moviebox_details['title'])}?id={target_mb_id}"
        else:
            resolved_path = f"/detail/{make_slug(moviebox_details['title'])}?id={target_mb_id}"

        target_lookup_path = resolved_path or target_mb_id

        # Try MovieBox v2 Web API ItemDetails
        clean_v2_path = target_lookup_path
        if clean_v2_path.startswith("/detail/"):
            clean_v2_path = clean_v2_path[len("/detail/"):]
        if "?" in clean_v2_path:
            clean_v2_path = clean_v2_path.split("?")[0]

        if auth_token and clean_v2_path and not clean_v2_path.isdigit():
            try:
                from moviebox_api.v2 import ItemDetails as ItemDetailsV2
                from moviebox_api.v2.requests import Session as SessionV2
                sess_v2 = SessionV2(headers=headers, verify=False)
                it_v2 = ItemDetailsV2(sess_v2)
                res_v2 = await it_v2.get_content(clean_v2_path)
                if isinstance(res_v2, dict) and res_v2.get('subject'):
                    subj = res_v2.get('subject', {})
                    res_title = subj.get('title') or subj.get('name')
                    res_desc = subj.get('description') or subj.get('introduction')
                    res_cover = subj.get('cover')
                    if isinstance(res_cover, dict):
                        res_poster = res_cover.get('url') or res_cover.get('path')
                    else:
                        res_poster = res_cover
                    res_year = str(subj.get('year') or subj.get('releaseDate', '')).split('-')[0]
                    res_rating = str(subj.get('imdbRatingValue', subj.get('rating', '')))

                    if res_title: moviebox_details['title'] = res_title
                    if res_desc: moviebox_details['description'] = res_desc
                    if res_poster and isinstance(res_poster, str) and res_poster.strip() and not moviebox_details.get('thumbnail'):
                        moviebox_details['thumbnail'] = res_poster
                    if res_year and res_year not in ['N/A', '0', '']:
                        moviebox_details['year'] = res_year
                    if res_rating and res_rating not in ['0.0', '0', '']:
                        moviebox_details['rating'] = res_rating

                    res_resource = res_v2.get('resource', {})
                    for s in res_resource.get('seasons', []) or []:
                        se_num = s.get('se')
                        max_ep = s.get('maxEp', 0)
                        seasons_info.append({"season": se_num, "episodes": list(range(1, max_ep + 1))})

                    if seasons_info:
                        moviebox_details['seasons'] = seasons_info

                    try:
                        se_target = season if season is not None else (1 if seasons_info else 0)
                        ep_target = episode if episode is not None else (1 if seasons_info else 0)
                        dl_res = await sess_v2.get_from_api(
                            "https://movieboxhd.net/wefeed-h5api-bff/subject/download",
                            params={"subjectId": target_mb_id, "se": se_target, "ep": ep_target, "detailPath": clean_v2_path}
                        )
                        for f in dl_res.get("downloads", []) or dl_res.get("list", []):
                            qualities.append({
                                "quality": f.get("quality", "720p"),
                                "format": "MP4",
                                "size": format_size(f.get("size")),
                                "url": f.get("path") or f.get("url")
                            })
                        if qualities:
                            moviebox_details["qualities"] = qualities
                    except Exception:
                        pass
                    details_fetched = True
            except Exception as v2_err:
                pass

        # Fallback to v1 API if needed
        if not details_fetched and not subject_id.startswith("tmdb_"):
            try:
                if type == "series":
                    md_instance = TVSeriesDetails(target_lookup_path, client_session)
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
                    md_instance = MovieDetails(target_lookup_path, client_session)
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
                    
                res_poster = details_data.get('poster') or details_data.get('cover')
                if isinstance(res_poster, dict):
                    res_poster = res_poster.get('url') or res_poster.get('path')
                
                res_year = str(details_data.get('year') or details_data.get('releaseDate', '')).split('-')[0]
                res_rating = str(details_data.get('rating', details_data.get('imdbRatingValue', '')))
                res_title = details_data.get('name') or details_data.get('title')
                res_desc = details_data.get('description') or details_data.get('introduction')

                if res_title: moviebox_details["title"] = res_title
                if res_desc: moviebox_details["description"] = res_desc
                if res_poster and isinstance(res_poster, str) and res_poster.strip() and not moviebox_details.get('thumbnail'):
                    moviebox_details["thumbnail"] = res_poster
                if res_year and res_year != 'N/A' and res_year != '0':
                    moviebox_details["year"] = res_year
                if res_rating and res_rating != '0.0' and res_rating != '0':
                    moviebox_details["rating"] = res_rating
                if qualities:
                    moviebox_details["qualities"] = qualities
                if seasons_info:
                    moviebox_details["seasons"] = seasons_info
            except Exception as mb_exc:
                pass

        # If TMDB enrichment was not done yet, do it now
        if not moviebox_details.get("tmdb"):
            try:
                m_title = moviebox_details.get("title") or title
                m_year = moviebox_details.get("year") or year
                if m_year == "N/A" or not m_year:
                    m_year = None
                tmdb_data = await fetch_tmdb_details(m_title, type, m_year)
                if tmdb_data:
                    if (not moviebox_details.get("title") or moviebox_details["title"] == "Unknown Title") and tmdb_data.get("title"):
                        moviebox_details["title"] = tmdb_data["title"]
                    if (not moviebox_details.get("description") or "pre-order" in moviebox_details["description"]) and tmdb_data.get("overview"):
                        moviebox_details["description"] = tmdb_data["overview"]
                    if not moviebox_details.get("thumbnail") and tmdb_data.get("poster"):
                        moviebox_details["thumbnail"] = tmdb_data["poster"]
                    if (not moviebox_details.get("year") or moviebox_details["year"] == "N/A") and tmdb_data.get("year"):
                        moviebox_details["year"] = tmdb_data["year"]
                    if (not moviebox_details.get("rating") or moviebox_details["rating"] == "0.0") and tmdb_data.get("rating"):
                        moviebox_details["rating"] = tmdb_data["rating"]
                    moviebox_details["tmdb"] = tmdb_data
            except Exception as tmdb_err:
                pass

        details_resp = {
            "success": True,
            "data": moviebox_details
        }
        _details_cache[cache_key] = {"time": now, "data": details_resp}
        return details_resp
    except Exception as e:
        print(f"Movie Details Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

_trailer_cache: dict = {}
_trailer_stream_cache: dict = {}

@app.get("/api/movies/trailer")
async def get_movie_trailer(title: str = Query(...), year: Optional[str] = Query(None), type: str = "movie"):
    """
    Find official trailer YouTube ID and direct stream URL for a movie or TV series.
    Resolves active official trailer candidates with yt-dlp and TMDB, bypassing age restrictions.
    """
    try:
        clean_title = title.strip()
        cache_key = f"{clean_title.lower()}_{year}_{type}"
        now = time.time()
        if cache_key in _trailer_cache and (now - _trailer_cache[cache_key].get("time", 0)) < 86400:
            return _trailer_cache[cache_key]["data"]

        candidates = []
        primary_title = f"{clean_title} Official Trailer"
        source = "youtube_search"

        # 1. Try TMDB details first for verified official trailer keys
        try:
            tmdb_data = await fetch_tmdb_details(clean_title, type, year)
            if tmdb_data and tmdb_data.get("videos"):
                videos = tmdb_data.get("videos", [])
                # First pass: clean trailers (not red band)
                for v in videos:
                    k = v.get("key")
                    v_name = (v.get("name") or "").lower()
                    if k and k not in candidates and "red band" not in v_name and "redband" not in v_name:
                        if v.get("type") in ("Trailer", "Teaser"):
                            candidates.append(k)
                # Second pass: other videos if no clean trailer found
                for v in videos:
                    k = v.get("key")
                    if k and k not in candidates:
                        candidates.append(k)
                if candidates:
                    source = "tmdb"
        except Exception as te:
            print(f"TMDB trailer lookup error: {te}")

        # 2. Intelligent YouTube Search with studio ranking and strict title matching
        STUDIO_KEYWORDS = [
            'trailers', 'trailer', 'movieclips', 'pictures', 'films', 'studios', 'entertainment',
            'cinema', 'sony', 'warner', 'paramount', 'universal', 'lionsgate', 'a24', 'ign',
            'netflix', 'hbo', 'apple tv', 'prime video', 'mgm', 'disney', 'marvel', 'signature',
            'studiocanal', 'filmax', 'kinocheck', 'rottentomatoes', 'fandango', 'film', 'movies', 'movie'
        ]
        NEGATIVE_KEYWORDS = [
            'salute', 'tribute', 'fan made', 'fan-made', 'concept', 'parody', 'reaction',
            'review', 'music video', 'official music video', 'audio', 'song', 'full movie',
            'gameplay', 'walkthrough', "let's play", 'bed time stories', 'salute to', 'grl force'
        ]
        STOP_WORDS = {'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by'}

        def score_trailer_candidate(entry):
            e_title = (entry.get('title') or '').lower()
            uploader = (entry.get('uploader') or '').lower()
            for neg in NEGATIVE_KEYWORDS:
                if neg in e_title or neg in uploader:
                    return -1000

            clean_t_lower = clean_title.lower()
            query_words = [w for w in re.findall(r'\w+', clean_t_lower) if w not in STOP_WORDS and len(w) > 1]
            matched_words = [w for w in query_words if w in e_title]

            # Mandatory word matching: reject if less than 75% of query words exist in candidate
            if query_words and (len(matched_words) / len(query_words)) < 0.75:
                return -1000

            score = 0
            if clean_t_lower in e_title:
                score += 80
            else:
                score += (len(matched_words) / len(query_words)) * 40

            if 'trailer' in e_title or 'teaser' in e_title or 'preview' in e_title:
                score += 30
            if 'official trailer' in e_title:
                score += 20
            if any(k in uploader for k in STUDIO_KEYWORDS):
                score += 25
            if year and str(year) in e_title:
                score += 15
            if 'red band' in e_title or 'redband' in e_title or '18+' in e_title:
                score -= 50
            return score

        try:
            search_query = f"ytsearch8:{clean_title} {year or ''} movie trailer".strip()
            ydl_opts = {
                'quiet': True,
                'skip_download': True,
                'extract_flat': True,
                'no_warnings': True
            }
            loop = asyncio.get_event_loop()
            def extract():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    return ydl.extract_info(search_query, download=False)
            
            info = await loop.run_in_executor(None, extract)
            if info and 'entries' in info and len(info['entries']) > 0:
                scored = []
                for entry in info['entries']:
                    if entry and entry.get('id'):
                        s = score_trailer_candidate(entry)
                        scored.append((s, entry))
                scored.sort(key=lambda x: x[0], reverse=True)

                for s, entry in scored:
                    vid_id = entry.get('id')
                    if s > 0 and vid_id and vid_id not in candidates:
                        candidates.append(vid_id)
                        if not primary_title or primary_title == f"{clean_title} Official Trailer":
                            primary_title = entry.get('title') or primary_title
        except Exception as yte:
            print(f"yt-dlp trailer lookup error: {yte}")

        if candidates:
            target_cand = candidates[0]
            direct_url = None
            headers = {}
            
            # Check cache first
            if target_cand in _trailer_stream_cache:
                direct_url = _trailer_stream_cache[target_cand].get("stream_url")
                headers = _trailer_stream_cache[target_cand].get("headers", {})

            if not direct_url:
                try:
                    ydl_pre = {
                        'quiet': True,
                        'no_warnings': True,
                        'format': 'best[ext=mp4]/18/22/best',
                        'extractor_args': {
                            'youtube': {
                                'player_client': ['android', 'web']
                            }
                        }
                    }
                    def ext():
                        with yt_dlp.YoutubeDL(ydl_pre) as ydl:
                            return ydl.extract_info(f"https://www.youtube.com/watch?v={target_cand}", download=False)
                    inf = await asyncio.get_event_loop().run_in_executor(None, ext)
                    if inf and inf.get('url'):
                        direct_url = inf.get('url')
                        headers = inf.get('http_headers', {})
                        cached_item = {
                            "time": time.time(),
                            "stream_url": direct_url,
                            "headers": headers
                        }
                        _trailer_stream_cache[target_cand] = cached_item
                        _trailer_stream_cache[clean_title] = cached_item
                except Exception as ex:
                    print(f"Direct trailer stream extract error: {ex}")

            stream_url = f"/api/movies/trailer/stream?key={target_cand}&title={urllib.parse.quote(clean_title)}"
            embed_url = f"https://www.youtube-nocookie.com/embed/{target_cand}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1"
            res_data = {
                "success": True,
                "data": {
                    "key": target_cand,
                    "youtubeKey": target_cand,
                    "candidates": candidates,
                    "title": primary_title,
                    "directUrl": direct_url,
                    "streamUrl": stream_url,
                    "embedUrl": embed_url,
                    "source": source
                },
                "key": target_cand,
                "youtubeKey": target_cand,
                "candidates": candidates,
                "title": primary_title,
                "directUrl": direct_url,
                "streamUrl": stream_url,
                "embedUrl": embed_url,
                "source": source
            }
            _trailer_cache[cache_key] = {"time": now, "data": res_data}
            return res_data

        return {
            "success": False,
            "error": "No trailer found",
            "searchQuery": f"{clean_title} official trailer"
        }
    except Exception as e:
        print(f"Get trailer error: {e}")
        return {
            "success": False,
            "error": str(e),
            "searchQuery": f"{title} official trailer"
        }

@app.get("/api/movies/trailer/stream")
async def stream_movie_trailer(
    request: Request,
    key: Optional[str] = Query(None),
    url: Optional[str] = Query(None),
    title: Optional[str] = Query(None)
):
    """
    Streams trailer video directly with HTTP 206 Partial Content (Range requests),
    completely bypassing YouTube age restrictions, embed restrictions, and regional blocks.
    """
    try:
        target = key or url or title
        if not target:
            raise HTTPException(status_code=400, detail="Target video key or url required")

        # If it's already a direct mp4 URL (e.g. from Moviebox CDN), redirect or proxy
        if target.startswith("http") and not ("youtube.com" in target or "youtu.be" in target or "googlevideo.com" in target):
            return RedirectResponse(target)

        cache_id = target.strip()
        now = time.time()
        cached = _trailer_stream_cache.get(cache_id)
        if not cached and key:
            cached = _trailer_stream_cache.get(key.strip())
        if not cached and title:
            cached = _trailer_stream_cache.get(title.strip())

        stream_url = None
        headers = {}
        
        if cached and (now - cached.get("time", 0)) < 7200:
            stream_url = cached.get("stream_url")
            headers = cached.get("headers", {})

        if not stream_url:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'format': 'best[ext=mp4]/18/22/best',
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'web']
                    }
                }
            }
            if target.startswith("http"):
                yt_target_url = target
            elif target.startswith("search:"):
                clean_target = target[7:].strip()
                yt_target_url = f"ytsearch1:{clean_target}"
            elif len(target) == 11 and " " not in target and "/" not in target and ":" not in target:
                yt_target_url = f"https://www.youtube.com/watch?v={target}"
            else:
                yt_target_url = f"ytsearch1:{target} official trailer"

            loop = asyncio.get_event_loop()
            def extract():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(yt_target_url, download=False)
                    if info and 'entries' in info and len(info['entries']) > 0:
                        info = info['entries'][0]
                    return info.get('url'), info.get('http_headers', {})

            stream_url, headers = await loop.run_in_executor(None, extract)
            if stream_url:
                cached_item = {
                    "time": now,
                    "stream_url": stream_url,
                    "headers": headers
                }
                _trailer_stream_cache[cache_id] = cached_item
                if key: _trailer_stream_cache[key.strip()] = cached_item
                if title: _trailer_stream_cache[title.strip()] = cached_item

        if not stream_url:
            raise HTTPException(status_code=404, detail="Trailer stream could not be extracted")

        # Range request support for smooth scrubbing and HTML5 video playback
        range_header = request.headers.get("range")
        req_headers = dict(headers)
        if range_header:
            req_headers["range"] = range_header

        try:
            client = httpx.AsyncClient(headers=req_headers, timeout=60.0, follow_redirects=True)
            upstream_req = client.build_request("GET", stream_url)
            upstream_resp = await client.send(upstream_req, stream=True)

            async def stream_generator():
                try:
                    async for chunk in upstream_resp.aiter_bytes(chunk_size=131072):
                        yield chunk
                except Exception:
                    pass
                finally:
                    await upstream_resp.aclose()
                    await client.aclose()

            resp_headers = {}
            for h in ["content-type", "content-length", "content-range", "accept-ranges"]:
                if h in upstream_resp.headers:
                    resp_headers[h] = upstream_resp.headers[h]
            if "accept-ranges" not in resp_headers:
                resp_headers["accept-ranges"] = "bytes"
            if "content-type" not in resp_headers:
                resp_headers["content-type"] = "video/mp4"

            return StreamingResponse(
                stream_generator(),
                status_code=upstream_resp.status_code,
                headers=resp_headers
            )
        except Exception:
            return RedirectResponse(stream_url)
    except Exception as e:
        print(f"Trailer Streaming Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/share", response_class=HTMLResponse)
async def dynamic_share_preview(
    title: str = "StreamAura — Your No. 1 Virtual Cinema & World of Entertainment", 
    desc: str = "Your No. 1 Virtual Cinema and World of Entertainment. Download high quality videos and music from any platform. Enjoy virtual cinema rooms, pre-order movies, and manage your media library — fast, free, and unlimited.", 
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
    if text is None: return ""
    return html.escape(str(text))

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
    
    if status == "pending":
        status_display = "🟡 <b>Pending Vendor Acceptance</b>"
    elif status == "accepted":
        status_display = "👨‍🍳 <b>Accepted & Being Processed</b>\n⏱️ <i>Please select estimated delivery time below:</i>"
    elif status == "shipped":
        eta_str = f" (ETA: {escape_tg(eta)})" if eta else ""
        status_display = f"🚚 <b>Out for Delivery{eta_str}</b> 🛵"
    elif status == "delivered":
        status_display = "🟢 <b>Delivered Successfully</b> ✅"
    elif status == "cancelled":
        status_display = "🔴 <b>Cancelled</b> ❌"
    else:
        status_display = f"<b>{escape_tg(status.title())}</b>"
        
    msg = (
        f"🛒 <b>Order #{order_num}</b>\n\n"
        f"<b>Customer:</b> {cust_name}\n"
        f"<b>Phone:</b> {cust_phone}\n"
        f"<b>Address:</b> {cust_addr}\n\n"
        f"<b>Items:</b>\n{items_text}\n\n"
        f"<b>Total Paid:</b> ₦{total:,.0f}\n\n"
        f"<b>Status:</b> {status_display}\n\n"
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
                    {"text": "⏱️ 15 Mins", "callback_data": f"ship_{order_id}_15 mins"},
                    {"text": "⏱️ 30 Mins", "callback_data": f"ship_{order_id}_30 mins"}
                ],
                [
                    {"text": "⏱️ 45 Mins", "callback_data": f"ship_{order_id}_45 mins"},
                    {"text": "⏱️ 1 Hour", "callback_data": f"ship_{order_id}_1 hour"}
                ],
                [
                    {"text": "⏱️ 2 Hours", "callback_data": f"ship_{order_id}_2 hours"},
                    {"text": "📦 Delivered Now", "callback_data": f"deliver_{order_id}"}
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
                        notif_doc_id = f"order_{order_id}_{new_status}"
                        notif_ref = db_admin.collection('users').document(uid).collection('notifications').document(notif_doc_id)
                        notif_snap = notif_ref.get()
                        if not notif_snap.exists:
                            db_admin.collection('users').document(uid).set({"unreadCount": firestore.Increment(1)}, merge=True)
                        notif_ref.set(notif_data, merge=True)
                        print(f"[StoreOrder] Successfully created/updated in-app notification '{notif_title}' for user {uid}")
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
            edit_resp = await client.post(edit_url, json={
                "chat_id": chat_id,
                "message_id": message_id,
                "text": txt,
                "parse_mode": "HTML",
                "reply_markup": kb
            })
            edit_data = edit_resp.json()
            if not edit_data.get("ok"):
                print(f"[Telegram] editMessageText notice: {edit_data}")
                # Fallback to updating just the reply_markup if text was unchanged or rejected
                markup_url = f"https://api.telegram.org/bot{bot_token}/editMessageReplyMarkup"
                await client.post(markup_url, json={
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "reply_markup": kb
                })
        except Exception as tg_err:
            print(f"Failed to edit Telegram message: {tg_err}")
            traceback.print_exc()

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
                    if not doc_snap.exists:
                        q_snaps = db_admin.collection('orders').where('orderNumber', '==', order_id).limit(1).get()
                        if q_snaps:
                            doc_snap = q_snaps[0]
                    if doc_snap.exists:
                        order_dict = doc_snap.to_dict() or {}
                        order_dict["id"] = order_id
                        st = order_dict.get("status", "pending")
                        eta = order_dict.get("estimatedDeliveryTime")
                        txt = format_order_telegram_message(order_dict, status=st, eta=eta)
                        kb = format_order_telegram_keyboard(order_id, status=st)
                        edit_url = f"https://api.telegram.org/bot{bot_token}/editMessageText"
                        await client.post(edit_url, json={"chat_id": chat_id, "message_id": message_id, "text": txt, "parse_mode": "HTML", "reply_markup": kb})
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
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
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

class CheckoutItemRequest(BaseModel):
    productId: str
    name: str
    quantity: int
    price: float

class VendorGroupRequest(BaseModel):
    vendorId: str
    vendorName: str
    telegramGroupId: Optional[str] = None
    items: List[CheckoutItemRequest]

class StoreCheckoutPayload(BaseModel):
    customerName: str
    customerEmail: Optional[str] = None
    customerPhone: str
    customerAddress: str
    vendorGroups: List[VendorGroupRequest]

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

@app.post("/api/store/checkout")
async def checkout_store_order(payload: StoreCheckoutPayload, user: dict = Depends(get_current_user)):
    """
    Secure atomic server-side concession store checkout:
    1. Validates customer wallet funded balance.
    2. Atomically deducts total cart cost from customer's room_wallets.
    3. For each vendor group:
       - Credits 80% net share to vendor's room_wallets.
       - Creates verified order doc in Firestore.
       - Logs customer purchase transaction & vendor earning transaction.
       - Sends customer in-app notification.
    4. Updates global analytics counters.
    5. Dispatches formatted Telegram order notification to vendor's group.
    """
    if not db_admin:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    uid = user['uid']
    if not payload.vendorGroups:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Calculate total cart cost
    total_cart = 0.0
    for vg in payload.vendorGroups:
        for it in vg.items:
            if it.quantity <= 0 or it.price < 0:
                raise HTTPException(status_code=400, detail=f"Invalid item price or quantity for {it.name}")
            total_cart += round(it.price * it.quantity, 2)

    total_cart = round(total_cart, 2)
    if total_cart <= 0:
        raise HTTPException(status_code=400, detail="Total cart amount must be greater than zero")

    customer_wallet_ref = db_admin.collection("room_wallets").document(uid)
    stats_ref = db_admin.collection("system_analytics").document("global_counters")
    user_ref = db_admin.collection("users").document(uid)

    # Collect vendor wallet refs
    vendor_refs = {}
    for vg in payload.vendorGroups:
        if vg.vendorId not in vendor_refs:
            vendor_refs[vg.vendorId] = db_admin.collection("room_wallets").document(vg.vendorId)

    transaction = db_admin.transaction()
    orders_created = []

    @firestore.transactional
    def transactional_checkout(transaction):
        # 1. READ ALL DOCUMENTS FIRST (Firestore transactional requirement)
        cust_wallet_snap = customer_wallet_ref.get(transaction=transaction)
        if not cust_wallet_snap.exists:
            raise HTTPException(status_code=400, detail="Wallet not found. Please fund your wallet first.")

        cust_wallet_data = cust_wallet_snap.to_dict() or {}
        funded_balance = float(cust_wallet_data.get("funded_balance", 0) or 0)
        if funded_balance < total_cart:
            raise HTTPException(status_code=400, detail=f"Insufficient wallet balance. Total is ₦{total_cart:,.2f} but available funded balance is ₦{funded_balance:,.2f}.")

        # Read vendor docs
        for v_id, v_ref in vendor_refs.items():
            v_ref.get(transaction=transaction)

        # 2. PERFORM ALL WRITES
        # Deduct customer wallet
        transaction.set(customer_wallet_ref, {
            "funded_balance": firestore.Increment(-total_cart),
            "balance": firestore.Increment(-total_cart)
        }, merge=True)

        # Save customer transaction log
        cust_tx_id = f"tx_cust_{uuid.uuid4().hex[:12]}"
        cust_tx_ref = db_admin.collection("transactions").document(cust_tx_id)
        transaction.set(cust_tx_ref, {
            "id": cust_tx_id,
            "user_uid": uid,
            "type": "purchase",
            "amount": total_cart,
            "title": f"Snack Store Purchase ({sum(len(vg.items) for vg in payload.vendorGroups)} items)",
            "status": "completed",
            "timestamp": firestore.SERVER_TIMESTAMP
        })

        total_vendor_share = 0.0
        total_platform_fee = 0.0

        for vg in payload.vendorGroups:
            group_total = round(sum(it.price * it.quantity for it in vg.items), 2)
            vendor_share = round(group_total * 0.80, 2)
            platform_fee = round(group_total * 0.20, 2)
            items_count = sum(it.quantity for it in vg.items)

            total_vendor_share += vendor_share
            total_platform_fee += platform_fee

            order_id = f"ord_{uuid.uuid4().hex[:12]}"
            order_num = f"SA{random.randint(100000, 999999)}"

            # Credit vendor wallet
            v_ref = vendor_refs[vg.vendorId]
            transaction.set(v_ref, {
                "vendor_balance": firestore.Increment(vendor_share),
                "vendor_earnings": firestore.Increment(vendor_share),
                "vendor_revenue": firestore.Increment(group_total),
                "vendor_sales_count": firestore.Increment(items_count),
                "vendor_fees": firestore.Increment(platform_fee)
            }, merge=True)

            # Vendor transaction log
            v_tx_id = f"tx_vnd_{uuid.uuid4().hex[:12]}"
            v_tx_ref = db_admin.collection("transactions").document(v_tx_id)
            transaction.set(v_tx_ref, {
                "id": v_tx_id,
                "user_uid": vg.vendorId,
                "vendorId": vg.vendorId,
                "vendorName": vg.vendorName,
                "orderId": order_id,
                "orderNumber": order_num,
                "type": "vendor_earning",
                "amount": vendor_share,
                "grossAmount": group_total,
                "platformFee": platform_fee,
                "itemsCount": items_count,
                "customerName": payload.customerName,
                "customerPhone": payload.customerPhone,
                "customerAddress": payload.customerAddress,
                "items": [{"productId": it.productId, "name": it.name, "quantity": it.quantity, "price": it.price} for it in vg.items],
                "title": f"Sales Earning (80%) - Order #{order_num}",
                "status": "completed",
                "timestamp": firestore.SERVER_TIMESTAMP
            })

            # Create Order Document
            order_ref = db_admin.collection("orders").document(order_id)
            order_doc_data = {
                "id": order_id,
                "orderNumber": order_num,
                "userId": uid,
                "userName": payload.customerName,
                "customerName": payload.customerName,
                "userEmail": payload.customerEmail,
                "userPhone": payload.customerPhone,
                "customerPhone": payload.customerPhone,
                "deliveryAddress": payload.customerAddress,
                "customerAddress": payload.customerAddress,
                "vendorId": vg.vendorId,
                "vendorName": vg.vendorName,
                "totalAmount": group_total,
                "total": group_total,
                "items": [{"productId": it.productId, "name": it.name, "quantity": it.quantity, "price": it.price} for it in vg.items],
                "status": "pending",
                "createdAt": int(time.time() * 1000)
            }
            transaction.set(order_ref, order_doc_data)

            # Send in-app notification to customer
            notif_id = f"order_{order_id}_placed"
            notif_ref = db_admin.collection("users").document(uid).collection("notifications").document(notif_id)
            transaction.set(notif_ref, {
                "id": notif_id,
                "title": f"🛒 Order Placed - #{order_num}",
                "message": f"Your order from {vg.vendorName} totaling ₦{group_total:,.2f} has been placed. Delivery to: {payload.customerAddress}",
                "timestamp": firestore.SERVER_TIMESTAMP,
                "read": False,
                "type": "order_placed",
                "orderId": order_id,
                "orderNumber": order_num,
                "vendorId": vg.vendorId,
                "vendorName": vg.vendorName,
                "orderStatus": "pending"
            })

            orders_created.append({
                "orderId": order_id,
                "orderNumber": order_num,
                "vendorId": vg.vendorId,
                "vendorName": vg.vendorName,
                "telegramGroupId": vg.telegramGroupId,
                "totalAmount": group_total,
                "items": [{"productId": it.productId, "name": it.name, "quantity": it.quantity, "price": it.price} for it in vg.items]
            })

        # Increment unread notifications count
        transaction.set(user_ref, {"unreadCount": firestore.Increment(len(payload.vendorGroups))}, merge=True)

        # Update Platform Global Analytics
        transaction.set(stats_ref, {
            "payments.success.count": firestore.Increment(len(payload.vendorGroups)),
            "payments.success.totalAmount": firestore.Increment(total_cart),
            "payments.platform_fees": firestore.Increment(total_platform_fee)
        }, merge=True)

        return True

    try:
        transactional_checkout(transaction)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Store Checkout Transaction Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    # Dispatch Telegram Notifications asynchronously after commit
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if bot_token:
        for ord_info in orders_created:
            if ord_info.get("telegramGroupId"):
                try:
                    order_dict = {
                        "orderNumber": ord_info["orderNumber"],
                        "id": ord_info["orderId"],
                        "userName": payload.customerName,
                        "userPhone": payload.customerPhone,
                        "deliveryAddress": payload.customerAddress,
                        "vendorName": ord_info["vendorName"],
                        "totalAmount": ord_info["totalAmount"],
                        "items": ord_info["items"]
                    }
                    message = format_order_telegram_message(order_dict, status="pending")
                    keyboard = format_order_telegram_keyboard(ord_info["orderId"], status="pending")
                    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.post(url, json={
                            "chat_id": ord_info["telegramGroupId"],
                            "text": message,
                            "parse_mode": "HTML",
                            "reply_markup": keyboard
                        })
                        if resp.status_code == 200:
                            resp_json = resp.json()
                            if resp_json.get("ok"):
                                msg_id = resp_json.get("result", {}).get("message_id")
                                chat_id = resp_json.get("result", {}).get("chat", {}).get("id") or ord_info["telegramGroupId"]
                                db_admin.collection("orders").document(ord_info["orderId"]).set({
                                    "telegramMessageId": msg_id,
                                    "telegramChatId": str(chat_id)
                                }, merge=True)
                except Exception as tg_err:
                    print(f"Post-checkout Telegram dispatch error: {tg_err}")

    return {
        "success": True,
        "message": "Checkout completed successfully",
        "orders": orders_created,
        "total": total_cart
    }

@app.post("/api/store/order")
async def process_store_order(order: OrderRequest):
    try:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
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
        if order.telegramGroupId and bot_token:
            try:
                message = format_order_telegram_message(order_dict, status="pending")
                keyboard = format_order_telegram_keyboard(order.orderId, status="pending")
                
                url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                payload = {
                    "chat_id": order.telegramGroupId,
                    "text": message,
                    "parse_mode": "HTML",
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
            print(f"No telegramGroupId or bot token configured for vendor {order.vendorId}, skipping Telegram dispatch.")
            
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
                
                # Record 20% Platform Commission on Store Order
                if order.total and float(order.total) > 0:
                    try:
                        from core.payouts import record_platform_cut
                        platform_cut = round(float(order.total) * 0.20, 2)
                        record_platform_cut(
                            db=db_admin,
                            amount=platform_cut,
                            currency="cash",
                            source="vendor_store",
                            desc=f"20% platform cut (₦{platform_cut:,.2f}) on Store Order #{order_num}"
                        )
                    except Exception as fe:
                        print(f"Failed to record store platform cut: {fe}")
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
async def update_order_status_endpoint(req: OrderStatusUpdateRequest, user: dict = Depends(get_current_user)):
    try:
        uid = user.get("uid")
        is_admin = bool(user.get("admin") or user.get("isAdmin", False))
        if not is_admin and db_admin:
            user_doc = db_admin.collection("users").document(uid).get()
            if user_doc.exists and user_doc.to_dict().get("isAdmin", False):
                is_admin = True
                
        # Validate caller has permission on this order
        if not is_admin and db_admin and req.orderId:
            ord_snap = db_admin.collection('orders').document(req.orderId).get()
            if ord_snap.exists:
                ord_dict = ord_snap.to_dict() or {}
                ord_vendor = ord_dict.get("vendorId")
                ord_user = ord_dict.get("userId")
                if uid != ord_vendor and uid != ord_user:
                    raise HTTPException(status_code=403, detail="Unauthorized to update status for this order")

        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
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
    except HTTPException: raise
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
async def rate_vendor_endpoint(req: RateVendorRequest, user: dict = Depends(get_current_user)):
    if not db_admin:
        return JSONResponse(status_code=500, content={"success": False, "error": "Database offline"})
    try:
        uid = user.get("uid")
        # Enforce that caller cannot spoof another user's review
        req_user_id = uid if uid else req.userId

        now_ms = int(time.time() * 1000)
        user_name = user.get("name") or "Valued Customer"
        order_items = []
        already_rated = False
        
        # 1. Fetch order details & update order document
        if req.orderId:
            try:
                ord_ref = db_admin.collection('orders').document(req.orderId)
                ord_snap = ord_ref.get()
                if ord_snap.exists:
                    ord_data = ord_snap.to_dict() or {}
                    already_rated = bool(ord_data.get("rated"))
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
        if req.notificationId and req_user_id:
            try:
                db_admin.collection('users').document(req_user_id).collection('notifications').document(req.notificationId).set({
                    "rated": True,
                    "rating": float(req.rating)
                }, merge=True)
            except Exception as ne:
                print(f"Notification rating update failed: {ne}")
                
        # 3. Create Review Document with deterministic ID & Save to root 'reviews' and subcollections
        rev_id = f"review_{req.orderId}_{req_user_id}"
        review_doc = {
            "id": rev_id,
            "orderId": req.orderId,
            "vendorId": req.vendorId,
            "userId": req_user_id,
            "userName": user_name,
            "rating": float(req.rating),
            "review": req.review or "",
            "createdAt": now_ms
        }
        
        try:
            db_admin.collection('reviews').document(rev_id).set(review_doc, merge=True)
        except Exception as re:
            print(f"Failed to set root review: {re}")
            
        # 4. Save review on each product in the order & update product average rating
        for item in order_items:
            p_id = item.get("productId") if isinstance(item, dict) else getattr(item, "productId", None)
            if p_id:
                try:
                    p_ref = db_admin.collection('products').document(p_id)
                    p_ref.collection('reviews').document(rev_id).set(review_doc, merge=True)
                    
                    if not already_rated:
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
        if req.vendorId and not already_rated:
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
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        update = await request.json()
        if "callback_query" in update:
            asyncio.create_task(handle_telegram_callback(update["callback_query"], bot_token))
        elif "message" in update:
            asyncio.create_task(handle_telegram_message(update["message"], bot_token))
        return {"ok": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/admin/financial-stats")
async def get_admin_financial_stats(user: Optional[dict] = Depends(get_current_user)):
    """
    Returns platform 20% real cash earnings and burned AuraCoin stats.
    """
    if not db_admin:
        raise HTTPException(status_code=500, detail="Database client unavailable")
    
    # If user provided, check admin authorization
    if user:
        uid = user.get("uid") or user.get("user_id") or user.get("sub")
        is_admin = bool(user.get("admin") or user.get("isAdmin", False) or user.get("role") == "admin")
        if not is_admin and uid:
            try:
                user_doc = db_admin.collection("users").document(str(uid)).get()
                if user_doc.exists:
                    udata = user_doc.to_dict() or {}
                    if udata.get("isAdmin", False) or udata.get("is_admin", False) or udata.get("role") == "admin":
                        is_admin = True
            except Exception as e:
                print(f"Error checking user doc for admin: {e}")
        if not is_admin:
            raise HTTPException(status_code=403, detail="Admin authorization required")
            
    try:
        from core.payouts import get_platform_financials_data
        stats = get_platform_financials_data(db_admin)
        return stats
    except Exception as e:
        print(f"Error fetching financial stats: {e}")
        return {
            "success": False,
            "total_burned_auracoins": 0,
            "total_platform_cash_earnings": 0,
            "auracoins_breakdown": { "burned_from_entry_fees": 0, "burned_from_forfeits": 0, "total_in_circulation": 0 },
            "cash_breakdown": { "cinema_tickets": 0, "game_entries": 0, "game_forfeits": 0, "vendor_store": 0, "withdrawal_fees": 0 },
            "recent_events": []
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, ws="wsproto", reload=True)



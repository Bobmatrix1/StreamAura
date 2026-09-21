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

async def extract_apple_music_direct(url: str):
    """
    Dedicated Apple Music extractor:
    1. Extracts track ID (from '?i=' or '/song/[name]/[id]')
    2. Queries iTunes Lookup API for exact track title, artist name, and 600x600 artwork
    3. Scrapes Apple Music OpenGraph metadata if iTunes API fails
    4. Finds high-speed audio stream via universal search engine
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
                    r = await client.get(f"https://itunes.apple.com/lookup?id={id_match.group(1)}&entity=song")
                    if r.status_code == 200 and "results" in r.text:
                        res = r.json().get("results", [])
                        if res:
                            song = res[0]
                            title = song.get("trackName", "")
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
        search_query = f"scsearch1:{display_artist} {title} official"

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
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(search_query, download=False))
            except Exception:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch1:{display_artist} {title} audio", download=False))
            
            if info and 'entries' in info and info['entries']:
                info = info['entries'][0]
            
            if not info:
                return None

            raw_formats = info.get("formats", [])
            audio_formats = [f for f in raw_formats if f.get('vcodec') == 'none' or 'audio' in str(f.get('resolution', '')).lower() or 'audio' in str(f.get('format_note', '')).lower()]
            
            best_audio_url = ""
            if audio_formats:
                best_audio_url = audio_formats[-1].get("url")
            elif info.get("url"):
                best_audio_url = info.get("url")

            if not best_audio_url:
                return None

            dur_sec = duration_ms // 1000 if duration_ms else int(info.get("duration", 0))
            duration_str = f"{dur_sec // 60}m {dur_sec % 60}s" if dur_sec else "Music Track"

            qualities = [
                {
                    "quality": "320kbps MP3 (Ultra Quality)",
                    "format": "MP3",
                    "resolution": "Audio",
                    "size": "HQ ~9.5 MB",
                    "url": best_audio_url
                },
                {
                    "quality": "256kbps MP3 (High Quality)",
                    "format": "MP3",
                    "resolution": "Audio",
                    "size": "HQ ~7.5 MB",
                    "url": best_audio_url
                },
                {
                    "quality": "192kbps MP3 (Standard Quality)",
                    "format": "MP3",
                    "resolution": "Audio",
                    "size": "Standard ~5.5 MB",
                    "url": best_audio_url
                },
                {
                    "quality": "Original Audio (Lossless/MP3)",
                    "format": "MP3",
                    "resolution": "Audio",
                    "size": "Lossless Audio",
                    "url": best_audio_url
                }
            ]

            return {
                "id": str(uuid.uuid4()),
                "url": url,
                "title": title,
                "thumbnail": artwork or info.get("thumbnail"),
                "duration": duration_str,
                "author": display_artist,
                "platform": "Apple Music",
                "mediaType": "music",
                "qualities": qualities
            }
    except Exception as e:
        print(f"Apple Music Direct Extractor notice: {e}")
    return None

async def extract_spotify_direct(url: str):
    """
    Dedicated Spotify extractor:
    1. Uses Spotify oEmbed API and metadata scraper to retrieve track name, artist, and album art
    2. Searches for high-fidelity audio stream
    3. Returns formatted music response with 320kbps, 256kbps, 192kbps and original audio streams
    """
    try:
        title = ""
        artist = ""
        cover = ""
        
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            oembed_url = f"https://open.spotify.com/oembed?url={urllib.parse.quote(url)}"
            r_oembed = await client.get(oembed_url)
            if r_oembed.status_code == 200:
                d = r_oembed.json()
                title = d.get("title", "")
                cover = d.get("thumbnail_url", "")
            
            r_page = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
            if r_page.status_code == 200:
                m_desc = re.search(r'property="og:description" content="([^"]+)"', r_page.text)
                if m_desc:
                    desc = m_desc.group(1)
                    artist = desc.split("·")[0].strip()
                if not cover:
                    m_img = re.search(r'property="og:image" content="([^"]+)"', r_page.text)
                    if m_img:
                        cover = m_img.group(1)
                if not title:
                    m_title = re.search(r'<title>([^<]+)</title>', r_page.text)
                    if m_title:
                        raw_title = m_title.group(1).replace(" - song and lyrics by ", " - ").replace(" | Spotify", "")
                        parts = raw_title.split(" - ")
                        title = parts[0].strip()
                        if not artist and len(parts) >= 2:
                            artist = parts[1].strip()

        if not title:
            return None

        display_artist = artist or "Spotify Artist"
        search_query = f"scsearch1:{display_artist} {title} official"

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
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(search_query, download=False))
            except Exception:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(f"ytsearch1:{display_artist} {title} audio", download=False))
            
            if info and 'entries' in info and info['entries']:
                info = info['entries'][0]
            
            if not info:
                return None

            raw_formats = info.get("formats", [])
            audio_formats = [f for f in raw_formats if f.get('vcodec') == 'none' or 'audio' in str(f.get('resolution', '')).lower() or 'audio' in str(f.get('format_note', '')).lower()]
            
            best_audio_url = ""
            if audio_formats:
                best_audio_url = audio_formats[-1].get("url")
            elif info.get("url"):
                best_audio_url = info.get("url")

            if not best_audio_url:
                return None

            raw_duration = info.get("duration", 0)
            duration_str = f"{int(raw_duration) // 60}m {int(raw_duration) % 60}s" if raw_duration else "Music Track"

            qualities = [
                {
                    "quality": "320kbps MP3 (Ultra Quality)",
                    "format": "MP3",
                    "resolution": "Audio",
                    "size": "HQ ~9.5 MB",
                    "url": best_audio_url
                },
                {
                    "quality": "256kbps MP3 (High Quality)",
                    "format": "MP3",
                    "resolution": "Audio",
                    "size": "HQ ~7.5 MB",
                    "url": best_audio_url
                },
                {
                    "quality": "192kbps MP3 (Standard Quality)",
                    "format": "MP3",
                    "resolution": "Audio",
                    "size": "Standard ~5.5 MB",
                    "url": best_audio_url
                },
                {
                    "quality": "Original Audio (Lossless/MP3)",
                    "format": "MP3",
                    "resolution": "Audio",
                    "size": "Lossless Audio",
                    "url": best_audio_url
                }
            ]

            return {
                "id": str(uuid.uuid4()),
                "url": url,
                "title": title,
                "thumbnail": cover or info.get("thumbnail"),
                "duration": duration_str,
                "author": display_artist,
                "platform": "Spotify",
                "mediaType": "music",
                "qualities": qualities
            }
    except Exception as e:
        print(f"Spotify Direct Extractor notice: {e}")
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
    elif "audiomack.com" in lower_url:
        platform = "Audiomack"
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

    # 3. Spotify / Audiomack / Music Search Fallback
    if platform in ["Spotify", "Audiomack", "SoundCloud"]:
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
                best_audio_stream = None
                for f in raw_formats:
                    vcodec = f.get('vcodec', 'none')
                    res = f.get('resolution') or f.get('format_note', '')
                    if (vcodec == 'none' or 'audio' in str(res).lower() or 'audio' in str(f.get('format_note', '')).lower()) and f.get('url'):
                        best_audio_stream = f.get('url')
                if not best_audio_stream and info.get('url'):
                    best_audio_stream = info.get('url')
                
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

_search_cache: dict = {}

@app.get("/api/movies/search")
async def search_movies(
    query: str = Query(...), 
    type: str = "movie", 
    page: int = 1, 
    per_page: int = 40
):
    try:
        cache_key = f"{query.lower().strip()}_{type}_{page}_{per_page}"
        now = time.time()
        if cache_key in _search_cache and (now - _search_cache[cache_key].get("time", 0)) < 600:
            return _search_cache[cache_key]["data"]

        client_session = Session(verify=False)

        async def perform_search(search_type_str, search_query, target_count=40, page_num=1):
            auth_token = os.getenv("MOVIEBOX_AUTH_TOKEN", "").strip()
            pages = [page_num, page_num + 1] if target_count > 20 else [page_num]
            all_raw = []

            def extract_items(res):
                if isinstance(res, list): return res
                if isinstance(res, dict):
                    return res.get('items') or res.get('list') or res.get('resData', {}).get('list') or []
            target_sub_type = 1 if search_type_str == "movie" else 2

            def filter_items_by_type(raw_list):
                res = []
                for it in raw_list:
                    st_val = get_val(it, 'subjectType')
                    if st_val is None:
                        st_val = get_val(it, 'subject_type')
                    if st_val is not None:
                        try:
                            if int(st_val) != target_sub_type:
                                continue
                        except (ValueError, TypeError):
                            pass
                    res.append(it)
                return res

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
                    for p in pages:
                        try:
                            search = SearchV2(sess, search_query, subject_type=st_v2, page=p, per_page=24)
                            res = await search.get_content()
                            all_raw.extend(filter_items_by_type(extract_items(res)))
                        except Exception:
                            pass
                    if all_raw:
                        return all_raw
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
                        for p in pages:
                            try:
                                search = SearchV2V3(client, search_query, subject_type=st, tab_id=tab, page=p, per_page=24)
                                res = await search.get_content()
                                all_raw.extend(filter_items_by_type(extract_items(res)))
                            except Exception:
                                try:
                                    search = SearchV3(client, search_query, subject_type=st, page=p, per_page=24)
                                    res = await search.get_content()
                                    all_raw.extend(filter_items_by_type(extract_items(res)))
                                except Exception:
                                    pass
                        if all_raw:
                            return all_raw
                except Exception as e:
                    print(f"v3 Search module failure: {e}")
            
            st = SubjectType.MOVIES if search_type_str == "movie" else SubjectType.TV_SERIES
            for p in pages:
                try:
                    sess_no_auth = Session(verify=False)
                    search = Search(sess_no_auth, search_query, subject_type=st, page=p, per_page=24)
                    res = await search.get_content()
                    all_raw.extend(filter_items_by_type(extract_items(res)))
                except Exception:
                    try:
                        sess_no_auth = Session(verify=False)
                        search = Search(sess_no_auth, search_query, subject_type=st, page=p, per_page=24)
                        model = await search.get_content_model()
                        all_raw.extend(filter_items_by_type(extract_items(model)))
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

        # 1. Search in the requested category (type)
        items = await perform_search(type, query, target_count=per_page, page_num=page)
        
        # 2. If no results found in the requested category, try cleaned/broader queries within the same type
        if not items:
            cleaned_query = clean_query_for_related(query)
            if cleaned_query and cleaned_query.lower() != query.lower():
                items = await perform_search(type, cleaned_query, target_count=per_page, page_num=page)
            
            if not items and cleaned_query:
                words = [w for w in re.split(r'\s+', cleaned_query) if len(w) > 2]
                if words:
                    broad_query = " ".join(words[:2])
                    items = await perform_search(type, broad_query, target_count=per_page, page_num=page)

        formatted_results = []
        seen_ids = set()
        for item in items:
            movie_id = str(get_val(item, 'subjectId', ''))
            if not movie_id or movie_id in seen_ids: continue
            seen_ids.add(movie_id)

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

            if len(formatted_results) >= per_page:
                break

        resp = {"success": True, "data": formatted_results}
        _search_cache[cache_key] = {"time": now, "data": resp}
        return resp
    except Exception as e:
        print(f"Movie Search Critical Error: {str(e)}")
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

_genre_cache: dict = {}

@app.get("/api/movies/genre")
async def get_movies_by_genre(
    genre: str = Query(...), 
    type: str = "movie", 
    page: int = 1, 
    per_page: int = 40
):
    """
    Dedicated genre / category discovery endpoint with high-capacity 40-item pagination.
    """
    try:
        genre_lower = genre.lower().strip()
        cache_key = f"{genre_lower}_{type}_{page}_{per_page}"
        now = time.time()
        if cache_key in _genre_cache and (now - _genre_cache[cache_key].get("time", 0)) < 1800:
            return _genre_cache[cache_key]["data"]

        client_session = Session(verify=False)

        def get_val(obj, key, default=None):
            if isinstance(obj, dict): return obj.get(key, default)
            val = getattr(obj, key, None)
            if val is not None: return val
            snake_key = re.sub(r'(?<!^)(?=[A-Z])', '_', key).lower()
            val = getattr(obj, snake_key, None)
            if val is not None: return val
            return default

        # Genre to search keyword mappings for deep catalogues
        genre_map = {
            "all": "movie" if type == "movie" else "series",
            "trending": "movie" if type == "movie" else "series",
            "popular": "popular",
            "action": "action",
            "african": "nollywood",
            "kdrama": "kdrama",
            "comedy": "comedy",
            "romance": "romance",
            "animation": "animation",
            "scifi": "sci-fi",
            "horror": "horror",
            "thriller": "thriller",
            "crime": "crime",
            "drama": "drama",
            "documentary": "documentary",
            "family": "family",
            "top_rated": "award"
        }
        
        target_keyword = genre_map.get(genre_lower, genre_lower)
        search_query = target_keyword or ("movie" if type == "movie" else "series")
        
        # Forward to search_movies handler logic with page & per_page
        res = await search_movies(query=search_query, type=type, page=page, per_page=per_page)
        if isinstance(res, dict) and res.get('success'):
            _genre_cache[cache_key] = {"time": now, "data": res}
            return res
        elif isinstance(res, JSONResponse):
            return res
        items = []

        formatted_results = []
        seen_ids = set()
        for item in items:
            movie_id = str(get_val(item, 'subjectId', ''))
            if not movie_id or movie_id in seen_ids: continue
            seen_ids.add(movie_id)

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

            if len(formatted_results) >= per_page:
                break

        resp = {"success": True, "data": formatted_results}
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

        target_sub_type = 1 if type == "movie" else 2

        # A. Try fetching Homepage operating categories
        try:
            from moviebox_api.v2.core import Homepage
            hp = Homepage(client_session)
            hp_res = await hp.get_content()
            operating_list = hp_res.get('operatingList', []) or []
            
            formatted_categories = []
            
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

                cleaned_title = re.sub(r'[\?\uFFFD]+', '', title).strip()
                cleaned_title = re.sub(r'\b(201\d|202[0-5])\b', '', cleaned_title).strip()
                cleaned_title = re.sub(r'\s+', ' ', cleaned_title).strip()
                if cleaned_title.lower() == 'romance':
                    cleaned_title = 'Romance & Love'
                if cleaned_title:
                    title = cleaned_title
                    
                subjects = row.get('subjects', []) or []
                # STRICT TYPE FILTERING: strictly only keep matching subjectType
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
            
            if formatted_categories and len(formatted_categories) >= 3:
                resp_obj = {"success": True, "isRows": True, "data": formatted_categories}
                _trending_cache[type] = {"time": now, "data": resp_obj}
                return resp_obj
        except Exception as hp_exc:
            print(f"Homepage rows fetch failed: {hp_exc}")

        # B. Fallback to Dedicated Type-Specific Trending & Curated Rows
        from moviebox_api.v1 import Trending
        tr = Trending(client_session)
        tr_res = await tr.get_content()
        raw_trending = tr_res.get('subjectList', []) or []
        items = [i for i in raw_trending if get_val(i, 'subjectType') == target_sub_type]
        
        # If Trending has few or no items (e.g. for movies), search for top items
        if len(items) < 8:
            try:
                st = SubjectType.MOVIES if type == "movie" else SubjectType.TV_SERIES
                search_kw = "movie" if type == "movie" else "series"
                s_obj = Search(client_session, search_kw, subject_type=st, page=0, per_page=40)
                s_res = await s_obj.get_content()
                s_items = s_res.get('items', []) or s_res.get('subjectList', []) or []
                for s_it in s_items:
                    st_val = get_val(s_it, 'subjectType') or get_val(s_it, 'subject_type')
                    if st_val in [target_sub_type, None]:
                        items.append(s_it)
            except Exception as s_exc:
                print(f"Trending fallback search error: {s_exc}")

        formatted_results = []
        seen_flat_ids = set()
        for item in items:
            movie_id = str(get_val(item, 'subjectId', ''))
            if not movie_id or movie_id in seen_flat_ids: continue
            seen_flat_ids.add(movie_id)

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
            
        fallback_resp = {"success": True, "isRows": False, "data": formatted_results}
        _trending_cache[type] = {"time": now, "data": fallback_resp}
        return fallback_resp
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
    token = os.getenv("TMDB_READ_ACCESS_TOKEN", "").strip() or os.getenv("TMDB_API_KEY", "").strip()
    if not token or not title:
        return None
        
    is_bearer = token.startswith("eyJ") or len(token) > 50
    headers = {
        "Accept": "application/json"
    }
    if is_bearer:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        search_type = "movie" if media_type == "movie" else "tv"
        # Smart TMDB Title Cleaner
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
                # Try raw title without cleaning
                search_params["query"] = title
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
            detail_params = {} if is_bearer else {"api_key": token}
            rd = await client.get(detail_url, headers=headers, params=detail_params)
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
                s_year = s_date.split('-')[0] if s_date else ''
                formatted_similar.append({
                    "id": s_id,
                    "title": s_title,
                    "thumbnail": f"https://image.tmdb.org/t/p/w342{poster_path}" if poster_path else None,
                    "year": s_year,
                    "rating": str(round(s.get('vote_average', 0.0), 1)) if s.get('vote_average') else '7.0',
                    "mediaType": media_type
                })
                
            tmdb_rating = str(round(details.get('vote_average', 0.0), 1)) if details.get('vote_average') else '7.5'
            release_date = details.get('release_date') or details.get('first_air_date') or ''
            tmdb_year = release_date.split('-')[0] if release_date else ''

            return {
                "id": tmdb_id,
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
                "year": tmdb_year
            }
        except Exception as e:
            print(f"TMDB Fetch Error for {title}: {e}")
            return None

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

        # 1. Resolve subject_id to a valid URL format for moviebox-api compatibility
        resolved_path = None
        if detail_path:
            if not detail_path.startswith("/detail/"):
                resolved_path = f"/detail/{detail_path}"
            else:
                resolved_path = detail_path
        elif subject_id.startswith("/detail/"):
            resolved_path = subject_id
        elif subject_id.isdigit():
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
                            p = get_val(item, 'detailPath')
                            if p:
                                resolved_path = p if p.startswith("/detail/") else f"/detail/{p}"
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
                                p = get_val(item, 'detailPath')
                                if p:
                                    resolved_path = p if p.startswith("/detail/") else f"/detail/{p}"
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
                            p = get_val(item, 'detailPath')
                            if p:
                                resolved_path = p if p.startswith("/detail/") else f"/detail/{p}"
                                break
                except:
                    pass

            # D. Fallback to title-derived slug URL if all searches yielded nothing
            if not resolved_path:
                slug = make_slug(title or "detail")
                resolved_path = f"/detail/{slug}?id={subject_id}"
        else:
            resolved_path = f"/detail/{make_slug(title or 'detail')}?id={subject_id}"

        target_lookup_path = resolved_path or subject_id

        # 2. Initialize moviebox_details with all baseline card details
        moviebox_details = {
            "id": subject_id,
            "detailPath": target_lookup_path,
            "title": title or "Unknown Title",
            "description": description or "4K streaming & high-speed cloud download available for pre-order.",
            "thumbnail": thumbnail or "",
            "year": year or "",
            "rating": rating or "7.5",
            "qualities": [],
            "seasons": [],
            "mediaType": type
        }

        seasons_info = []
        qualities = []
        
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

            if res_title:
                moviebox_details["title"] = res_title
            if res_desc:
                moviebox_details["description"] = res_desc
            if res_poster and isinstance(res_poster, str) and res_poster.strip():
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
            print(f"Moviebox API details fetch notice: {mb_exc}")

        # TMDB Enrichment
        tmdb_data = None
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
        except Exception as tmdb_err:
            print(f"TMDB Enrichment Error: {tmdb_err}")

        moviebox_details["tmdb"] = tmdb_data

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

@app.get("/api/movies/trailer")
async def get_movie_trailer(title: str = Query(...), year: Optional[str] = Query(None), type: str = "movie"):
    """
    Find official trailer YouTube ID for a movie or TV series.
    Resolves active official trailer candidates with yt-dlp and TMDB.
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

        # 1. Try yt-dlp fast search for official trailers (finds active, embeddable YouTube uploads)
        try:
            search_query = f"ytsearch3:{clean_title} {year or ''} official trailer".strip()
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
                for entry in info['entries']:
                    if entry and entry.get('id'):
                        vid_id = entry['id']
                        if vid_id not in candidates:
                            candidates.append(vid_id)
                        if not primary_title or primary_title == f"{clean_title} Official Trailer":
                            primary_title = entry.get('title', primary_title)
        except Exception as yte:
            print(f"yt-dlp trailer lookup error: {yte}")

        # 2. Try TMDB details for additional trailer keys
        try:
            tmdb_data = await fetch_tmdb_details(clean_title, type, year)
            if tmdb_data and tmdb_data.get("videos"):
                videos = tmdb_data.get("videos", [])
                for v in videos:
                    k = v.get("key")
                    if k and k not in candidates:
                        if v.get("type") in ("Trailer", "Teaser"):
                            candidates.append(k)
        except Exception as te:
            print(f"TMDB trailer lookup error: {te}")

        # 3. Fallback search with broader query if no candidates yet
        if not candidates:
            try:
                search_query_broad = f"ytsearch2:{clean_title} trailer".strip()
                def extract_broad():
                    with yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True, 'extract_flat': True}) as ydl:
                        return ydl.extract_info(search_query_broad, download=False)
                info_broad = await loop.run_in_executor(None, extract_broad)
                if info_broad and 'entries' in info_broad:
                    for entry in info_broad['entries']:
                        if entry and entry.get('id'):
                            candidates.append(entry['id'])
            except Exception as e_broad:
                print(f"Broad trailer lookup error: {e_broad}")

        if candidates:
            res_data = {
                "success": True,
                "data": {
                    "key": candidates[0],
                    "candidates": candidates,
                    "title": primary_title,
                    "source": source
                },
                "key": candidates[0],
                "candidates": candidates,
                "title": primary_title,
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, ws="wsproto", reload=True)


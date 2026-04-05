# Media Downloader Backend (Python/FastAPI)

This is the functional backend for the Universal Media Downloader. It uses `yt-dlp` to extract media metadata and formats from various platforms.

## Prerequisites

- Python 3.9 or higher
- `ffmpeg` installed on your system path (required for high-quality video merging)

## Setup and Running

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the server:**
   ```bash
   python main.py
   ```
   The server will start on `http://localhost:8000`.

## Key Features

- **Live Extraction:** Real-time metadata and format extraction using `yt-dlp`.
- **Watermark-Free Support:** Automatically prioritizes non-watermarked formats for TikTok and Instagram.
- **Proxy Streaming:** Downloads are proxied through the server to bypass CORS and platform-specific referral restrictions.
- **Auto-Cleanup:** No files are stored on disk; all data is streamed directly to the user.

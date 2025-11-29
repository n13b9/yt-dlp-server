# yt-dlp Server


Express.js API server for video metadata retrieval and audio conversion using yt-dlp.


## Features


- Get video metadata (`/info`)
- Convert video to audio (`/convert`)
- Download audio files (`/download`)


## Prerequisites


- Node.js (v14+)
- yt-dlp installed: `pip install yt-dlp` or download from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases)
- ffmpeg installed (for audio conversion)


## Installation
ash
npm install
npm start## API Endpoints


### GET `/info?url=<video-url>`
Returns media metadata (title, duration, author, formats, etc.)


**Query params:**
- `url` (required) - Video URL


### GET/POST `/convert?url=<video-url>`
Streams converted audio file directly to client.


### POST `/download`
Downloads audio file to disk and returns file path.


**Body:**
{ "url": "https://..." }### GET `/health`
Health check endpoint.


## Environment Variables


- `PORT` - Server port (default: 3000)
- `PROXY_URL` - Proxy server URL (optional)
- `HTTP_PROXY` / `HTTPS_PROXY` - Alternative proxy env vars


## Upgrading yt-dlp


### Option 1: Using pip
pip install --upgrade yt-dlp### Option 2: Using yt-dlp updater
yt-dlp -U### Option 3: Manual update
1. Download latest from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases)
2. Replace existing binary
3. Ensure it's in your PATH


### For Docker/Railway deployments:
Update the Dockerfile:rfile
RUN pip install --upgrade yt-dlp
# OR
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
   chmod a+rx /usr/local/bin/yt-dlp## Railway Deployment


1. Push code to GitHub
2. Create Railway project and connect repository
3. Railway auto-detects Dockerfile
4. Set environment variables in Railway dashboard
5. Deploy
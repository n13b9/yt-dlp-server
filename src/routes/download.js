const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function classifyYtdlpError(stderr) {
  const m = stderr.toLowerCase();
  if (m.includes('unsupported url')) return { code: 'UNSUPPORTED_URL', status: 400 };
  if (m.includes('private')) return { code: 'PRIVATE_VIDEO', status: 403 };
  if (m.includes('unavailable') || m.includes('not found')) return { code: 'VIDEO_UNAVAILABLE', status: 404 };
  if (m.includes('timeout')) return { code: 'YTDLP_TIMEOUT', status: 504 };
  return { code: 'YTDLP_ERROR', status: 500 };
}

const DOWNLOAD_DIR = path.join('/tmp', 'downloads');

function cleanupOldFiles(maxAgeMs) {
  if (!fs.existsSync(DOWNLOAD_DIR)) return;
  const now = Date.now();
  for (const file of fs.readdirSync(DOWNLOAD_DIR)) {
    const filePath = path.join(DOWNLOAD_DIR, file);
    const stat = fs.statSync(filePath);
    if (now - stat.mtimeMs > maxAgeMs) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

router.post('/download', async (req, res) => {
  try {
    const { url, format } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required', code: 'MISSING_URL' });

    let audioFormat = format ? format.toLowerCase() : 'mp3';
    if (!['mp3', 'm4a'].includes(audioFormat)) {
      return res.status(400).json({ error: 'Invalid format. Use mp3 or m4a', code: 'INVALID_FORMAT' });
    }

    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    cleanupOldFiles(Number(process.env.DOWNLOAD_CLEANUP_MS || 1000 * 60 * 60));

    const proxy = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const tmpInput = path.join('/tmp', `in-${Date.now()}.m4a`);
    const outputPath = path.join(DOWNLOAD_DIR, `${id}.${audioFormat}`);

    const ytArgs = [
      '--no-warnings',
      '--no-playlist',
      '-x',
      '--audio-format', 'm4a',
      '-o', tmpInput
    ];

    if (proxy) ytArgs.push('--proxy', proxy);
    ytArgs.push(url);

    let ytError = '';
    const yt = spawn('yt-dlp', ytArgs);

    yt.stderr.on('data', chunk => {
      const t = chunk.toString();
      ytError += t;
      console.error('yt-dlp:', t);
    });

    const timeoutMs = Number(process.env.DOWNLOAD_TIMEOUT_MS || 120000);
    const timeout = setTimeout(() => {
      if (!yt.killed) yt.kill('SIGKILL');
    }, timeoutMs);

    yt.on('exit', exitCode => {
      clearTimeout(timeout);

      if (exitCode !== 0 || !fs.existsSync(tmpInput)) {
        const { code: errorCode, status: statusCode } = classifyYtdlpError(ytError);
        return res.status(statusCode).json({ error: ytError.trim() || 'yt-dlp failed', code: errorCode });
      }

      const ffmpegArgs =
        audioFormat === 'mp3'
          ? ['-i', tmpInput, '-vn', '-acodec', 'libmp3lame', '-q:a', '3', '-threads', '0', outputPath]
          : ['-i', tmpInput, '-vn', '-acodec', 'aac', '-b:a', '128k', '-threads', '0', outputPath];

      const ff = spawn('ffmpeg', ffmpegArgs);
      let ffError = '';

      ff.stderr.on('data', chunk => {
        ffError += chunk.toString();
      });

      ff.on('exit', ffCode => {
        fs.unlink(tmpInput, () => {});

        if (ffCode !== 0 || !fs.existsSync(outputPath)) {
          return res.status(500).json({ error: ffError.trim() || 'ffmpeg conversion failed', code: 'FFMPEG_ERROR' });
        }

        res.json({ id, file_path: outputPath, format: audioFormat });
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'UNKNOWN_ERROR' });
  }
});

router.get('/download/:id', (req, res) => {
  const id = req.params.id;
  
  let filePath = path.join(DOWNLOAD_DIR, `${id}.mp3`);
  let contentType = 'audio/mpeg';
  
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DOWNLOAD_DIR, `${id}.m4a`);
    contentType = 'audio/mp4';
  }
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' });
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;

  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': contentType });
    return fs.createReadStream(filePath).pipe(res);
  }

  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

  if (start >= total || end >= total) {
    return res.status(416).send('Requested range not satisfiable');
  }

  const chunkSize = end - start + 1;
  const file = fs.createReadStream(filePath, { start, end });

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': contentType
  });

  file.pipe(res);
});

module.exports = router;
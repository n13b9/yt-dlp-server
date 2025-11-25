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
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required', code: 'MISSING_URL' });

    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    cleanupOldFiles(Number(process.env.DOWNLOAD_CLEANUP_MS || 1000 * 60 * 60));

    const proxy = process.env.PROXY_URL;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const outputPath = path.join(DOWNLOAD_DIR, `${id}.mp4`);

    const ytArgs = ['-f', 'bestvideo+bestaudio/best', '-o', outputPath];
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

      if (exitCode !== 0) {
        const { code: errorCode, status: statusCode } = classifyYtdlpError(ytError);
        return res.status(statusCode).json({ error: ytError.trim() || 'yt-dlp failed', code: errorCode });
      }

      if (!fs.existsSync(outputPath)) {
        return res.status(500).json({ error: 'File not created', code: 'FILE_ERROR' });
      }

      res.json({ id, file_path: outputPath });
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'UNKNOWN_ERROR' });
  }
});

router.get('/download/:id', (req, res) => {
  const id = req.params.id;
  const filePath = path.join(DOWNLOAD_DIR, `${id}.mp4`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' });
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;

  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': 'video/mp4' });
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
    'Content-Type': 'video/mp4'
  });

  file.pipe(res);
});

module.exports = router;

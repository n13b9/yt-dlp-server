const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const router = express.Router();

function classifyYtdlpError(stderr) {
  const m = stderr.toLowerCase();
  if (m.includes('unsupported url')) return { code: 'UNSUPPORTED_URL', status: 400 };
  if (m.includes('private video')) return { code: 'PRIVATE_VIDEO', status: 403 };
  if (m.includes('video unavailable')) return { code: 'VIDEO_UNAVAILABLE', status: 404 };
  if (m.includes('timeout')) return { code: 'YTDLP_TIMEOUT', status: 504 };
  return { code: 'YTDLP_ERROR', status: 500 };
}

router.all('/convert', async (req, res) => {
  const startTime = Date.now();
  const t = () => ((Date.now() - startTime) / 1000).toFixed(3) + 's';

  process.stderr.write(`[${t()}] === /convert endpoint called ===\n`);

  const url = req.method === 'GET' ? req.query.url : req.body?.url;
  let format = req.method === 'GET' ? req.query.format : req.body?.format;
  const proxyParam = req.method === 'GET' ? req.query.proxy : req.body?.proxy;

  process.stderr.write(`[${t()}] Request - URL: ${url}, Format: ${format || 'mp3'}\n`);

  if (!url) {
    process.stderr.write(`[${t()}] Error: url is required\n`);
    return res.status(400).json({ error: 'url is required' });
  }

  format = format ? format.toLowerCase() : 'mp3';
  if (!['mp3', 'm4a'].includes(format)) {
    process.stderr.write(`[${t()}] Error: invalid format\n`);
    return res.status(400).json({ error: 'invalid format' });
  }

  const tmpInput = path.join('/tmp', `in-${Date.now()}.m4a`);
  const tmpOutput = path.join('/tmp', `out-${Date.now()}.${format}`);

  process.stderr.write(`[${t()}] Temp files - Input: ${tmpInput}, Output: ${tmpOutput}\n`);

  const proxy =
    proxyParam ||
    process.env.PROXY_URL ||
    process.env.HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    null;
  
  process.stderr.write(`[${t()}] Proxy: ${proxy || 'none'}\n`);

  const ytArgs = [
    '--no-warnings',
    '--no-playlist',
    '-x',
    '--audio-format', 'm4a',
    '-o', tmpInput,
  ];
  
  if (proxy) ytArgs.push('--proxy', proxy);
  
  ytArgs.push(url);

  process.stderr.write(`[${t()}] Starting yt-dlp download...\n`);
  process.stderr.write(`[${t()}] yt-dlp args: ${ytArgs.join(' ')}\n`);

  const ytDownloadStart = Date.now();
  const yt = spawn('yt-dlp', ytArgs);

  let ytErr = '';
  let ytFirstOutput = false;

  yt.stderr.on('data', d => {
    if (!ytFirstOutput) {
      process.stderr.write(`[${t()}] yt-dlp first output received\n`);
      ytFirstOutput = true;
    }
    ytErr += d.toString();
  });

  yt.on('close', code => {
    const ytDownloadTime = ((Date.now() - ytDownloadStart) / 1000).toFixed(3);
    process.stderr.write(`[${t()}] yt-dlp download completed (${ytDownloadTime}s, code=${code})\n`);

    if (code !== 0 || !fs.existsSync(tmpInput)) {
      process.stderr.write(`[${t()}] yt-dlp failed - Error: ${ytErr.trim()}\n`);
      const { code: errCode, status } = classifyYtdlpError(ytErr);
      return res.status(status).json({ error: ytErr.trim() || 'yt-dlp failed', code: errCode });
    }

    const inputSize = fs.statSync(tmpInput).size;
    process.stderr.write(`[${t()}] Input file size: ${(inputSize / 1024 / 1024).toFixed(2)} MB\n`);

    const ffmpegArgs =
      format === 'mp3'
        ? ['-i', tmpInput, '-vn', '-acodec', 'libmp3lame', '-q:a', '3', '-threads', '0', tmpOutput]
        : ['-i', tmpInput, '-vn', '-acodec', 'aac', '-b:a', '128k', '-threads', '0', tmpOutput];

    process.stderr.write(`[${t()}] Starting ffmpeg conversion to ${format}...\n`);
    process.stderr.write(`[${t()}] ffmpeg args: ${ffmpegArgs.join(' ')}\n`);

    const ffmpegStart = Date.now();
    const ff = spawn('ffmpeg', ffmpegArgs);

    let ffErr = '';
    let ffFirstOutput = false;

    ff.stderr.on('data', d => {
      if (!ffFirstOutput) {
        process.stderr.write(`[${t()}] ffmpeg first output received\n`);
        ffFirstOutput = true;
      }
      ffErr += d.toString();
    });

    ff.on('close', code => {
      const ffmpegTime = ((Date.now() - ffmpegStart) / 1000).toFixed(3);
      process.stderr.write(`[${t()}] ffmpeg conversion completed (${ffmpegTime}s, code=${code})\n`);

      if (code !== 0 || !fs.existsSync(tmpOutput)) {
        process.stderr.write(`[${t()}] ffmpeg failed - Error: ${ffErr.trim()}\n`);
        return res.status(500).json({ error: ffErr.trim() || 'ffmpeg failed' });
      }

      const outputSize = fs.statSync(tmpOutput).size;
      process.stderr.write(`[${t()}] Output file size: ${(outputSize / 1024 / 1024).toFixed(2)} MB\n`);

      res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="audio.${format}"`);

      process.stderr.write(`[${t()}] Starting file stream to client...\n`);
      const streamStart = Date.now();

      const stream = fs.createReadStream(tmpOutput);
      stream.pipe(res);

      stream.on('close', () => {
        const streamTime = ((Date.now() - streamStart) / 1000).toFixed(3);
        process.stderr.write(`[${t()}] File stream completed (${streamTime}s)\n`);
        process.stderr.write(`[${t()}] Total conversion time: ${t()}\n`);

        fs.unlink(tmpInput, () => {});
        fs.unlink(tmpOutput, () => {});
        process.stderr.write(`[${t()}] Temp files cleaned up\n`);
      });
    });
  });
});

module.exports = router;
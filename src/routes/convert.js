const express = require('express');
const { spawn } = require('child_process');
const router = express.Router();

function classifyYtdlpError(stderr) {
    const message = stderr.toLowerCase();
    if (message.includes('unsupported url')) return { code: 'UNSUPPORTED_URL', status: 400 };
    if (message.includes('private video')) return { code: 'PRIVATE_VIDEO', status: 403 };
    if (message.includes('video unavailable')) return { code: 'VIDEO_UNAVAILABLE', status: 404 };
    if (message.includes('timeout')) return { code: 'YTDLP_TIMEOUT', status: 504 };
    return { code: 'YTDLP_ERROR', status: 500 };
}

router.all('/convert', async (req, res) => {
  const url = req.method === 'GET' ? req.query.url : req.body?.url;
  let format = req.method === 'GET' ? req.query.format : req.body?.format;
  if (!url) return res.status(400).json({ error: 'url is required' });

  format = format ? format.toLowerCase() : 'mp3';
  if (!['mp3', 'm4a'].includes(format)) {
    return res.status(400).json({ error: 'invalid format' });
  }

  const proxy = process.env.PROXY_URL;

  const ytArgs = [
    '-f', '140',
    '--no-playlist',
    '--no-warnings',
    '--no-cache-dir',
    '--youtube-skip-dash-manifest',
    '--no-check-formats',
    '--cookies-from-browser', 'chrome',
    '-o', '-'
  ];

  if (proxy) {
    ytArgs.push('--proxy', proxy);
  }
  ytArgs.push(url);

  const yt = spawn('yt-dlp', ytArgs);

  const ffmpegArgs =
    format === 'mp3'
      ? ['-i', 'pipe:0', '-vn', '-acodec', 'libmp3lame', '-q:a', '4', '-threads', '0', '-f', 'mp3', 'pipe:1']
      : ['-i', 'pipe:0', '-vn', '-acodec', 'aac', '-b:a', '128k', '-threads', '0', '-f', 'ipod', 'pipe:1'];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  let ytError = '';
  yt.stderr.on('data', c => ytError += c.toString());
  let ffmpegError = '';
  ffmpeg.stderr.on('data', c => ffmpegError += c.toString());

  yt.stdout.pipe(ffmpeg.stdin);

  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="audio.${format}"`);

  ffmpeg.stdout.pipe(res);

  const killAll = () => {
    if (!yt.killed) yt.kill('SIGKILL');
    if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
  };

  req.on('close', killAll);

  yt.on('exit', code => {
    if (code !== 0 && !res.headersSent) {
      killAll();
      const { code: errCode, status } = classifyYtdlpError(ytError);
      res.status(status).json({ error: ytError.trim() || 'yt-dlp failed', code: errCode });
    }
  });

  ffmpeg.on('exit', code => {
    if (code !== 0 && !res.headersSent) {
      killAll();
      res.status(500).json({ error: ffmpegError.trim() || 'ffmpeg failed' });
    }
  });

  const timeoutMs = Number(process.env.CONVERT_TIMEOUT_MS || 90000);
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      killAll();
      res.status(504).json({ error: 'Conversion timed out', code: 'CONVERT_TIMEOUT' });
    }
  }, timeoutMs);

  const finish = () => {
    clearTimeout(timeout);
    if (!yt.killed) yt.kill('SIGKILL');
    if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
  };

  ffmpeg.on('close', finish);
  res.on('close', finish);
});

module.exports = router;

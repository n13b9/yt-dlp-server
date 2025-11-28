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
  const url = req.method === 'GET' ? req.query.url : req.body?.url;
  let format = req.method === 'GET' ? req.query.format : req.body?.format;
  if (!url) return res.status(400).json({ error: 'url is required' });

  format = format ? format.toLowerCase() : 'mp3';
  if (!['mp3', 'm4a'].includes(format)) {
    return res.status(400).json({ error: 'invalid format' });
  }

  const tmpInput = path.join('/tmp', `in-${Date.now()}.m4a`);
  const tmpOutput = path.join('/tmp', `out-${Date.now()}.${format}`);

  const ytArgs = [
    '-f', '140',
    '--no-warnings',
    '--no-playlist',
    '-o', tmpInput,
    url
  ];

  const yt = spawn('yt-dlp', ytArgs);

  let ytErr = '';
  yt.stderr.on('data', d => ytErr += d.toString());

  yt.on('close', code => {
    if (code !== 0 || !fs.existsSync(tmpInput)) {
      const { code: errCode, status } = classifyYtdlpError(ytErr);
      return res.status(status).json({ error: ytErr.trim() || 'yt-dlp failed', code: errCode });
    }

    const ffmpegArgs =
      format === 'mp3'
        ? ['-i', tmpInput, '-vn', '-acodec', 'libmp3lame', '-q:a', '3', '-threads', '0', tmpOutput]
        : ['-i', tmpInput, '-vn', '-acodec', 'aac', '-b:a', '128k', '-threads', '0', tmpOutput];

    const ff = spawn('ffmpeg', ffmpegArgs);

    let ffErr = '';
    ff.stderr.on('data', d => ffErr += d.toString());

    ff.on('close', code => {
      if (code !== 0 || !fs.existsSync(tmpOutput)) {
        return res.status(500).json({ error: ffErr.trim() || 'ffmpeg failed' });
      }

      res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="audio.${format}"`);

      const stream = fs.createReadStream(tmpOutput);
      stream.pipe(res);

      stream.on('close', () => {
        fs.unlink(tmpInput, () => {});
        fs.unlink(tmpOutput, () => {});
      });
    });
  });
});

module.exports = router;

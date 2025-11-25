const express = require('express');
const { spawn } = require('child_process');

const router = express.Router();

router.all('/convert', async (req, res) => {
  const url = req.method === 'GET' ? req.query.url : req.body?.url;
  let format = req.method === 'GET' ? req.query.format : req.body?.format;

  if (!url) return res.status(400).json({ error: 'url is required' });

  format = format ? format.toLowerCase() : 'mp3';
  if (!['mp3', 'm4a'].includes(format)) {
    return res.status(400).json({ error: 'invalid format' });
  }

  const yt = spawn('yt-dlp', [
    '-f', 'bestaudio/best',
    '-o', '-',
    url
  ]);

  const ffmpegArgs =
    format === 'mp3'
      ? ['-i', 'pipe:0', '-vn', '-acodec', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1']
      : ['-i', 'pipe:0', '-vn', '-acodec', 'aac', '-b:a', '192k', '-f', 'ipod', 'pipe:1'];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  yt.stdout.pipe(ffmpeg.stdin);
  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="audio.${format}"`);

  ffmpeg.stdout.pipe(res);

  yt.stderr.on('data', d => console.error('yt-dlp:', d.toString()));
  ffmpeg.stderr.on('data', d => console.error('ffmpeg:', d.toString()));

  const killAll = () => {
    if (!yt.killed) yt.kill('SIGKILL');
    if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
  };

  req.on('close', killAll);

  yt.on('exit', code => {
    if (code !== 0 && !res.headersSent) {
      killAll();
      res.status(500).json({ error: 'yt-dlp failed' });
    }
  });

  ffmpeg.on('exit', code => {
    if (code !== 0 && !res.headersSent) {
      killAll();
      res.status(500).json({ error: 'ffmpeg failed' });
    }
  });
});

module.exports = router;

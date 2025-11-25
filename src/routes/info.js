const express = require('express');
const router = express.Router();
const { getVideoInfo } = require('../utils/ytdlp');

function classifyInfoError(message) {
  const m = message.toLowerCase();
  if (m.includes('unsupported url')) return { code: 'UNSUPPORTED_URL', status: 400 };
  if (m.includes('private')) return { code: 'PRIVATE_VIDEO', status: 403 };
  if (m.includes('unavailable') || m.includes('not found')) return { code: 'VIDEO_UNAVAILABLE', status: 404 };
  if (m.includes('timeout')) return { code: 'YTDLP_TIMEOUT', status: 504 };
  return { code: 'YTDLP_ERROR', status: 500 };
}

function curateVideoInfo(fullInfo) {
  const formats = fullInfo.formats || [];
  const requested = fullInfo.requested_formats || [];
  const best =
    requested[0] ||
    formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none') ||
    formats[0] ||
    null;

  return {
    id: fullInfo.id || null,
    title: fullInfo.title || null,
    duration: fullInfo.duration || null,
    author: fullInfo.uploader || fullInfo.channel || fullInfo.creator || null,
    channel: fullInfo.channel || fullInfo.uploader || null,
    thumbnail: fullInfo.thumbnail || fullInfo.thumbnails?.[0]?.url || null,
    description: fullInfo.description || null,
    view_count: fullInfo.view_count || null,
    like_count: fullInfo.like_count || null,
    upload_date: fullInfo.upload_date || null,
    url: fullInfo.url || fullInfo.webpage_url || null,
    best_format: best
      ? {
          format_id: best.format_id || null,
          ext: best.ext || null,
          resolution: best.resolution || null,
          filesize: best.filesize || null,
          url: best.url || null,
          vcodec: best.vcodec || null,
          acodec: best.acodec || null,
          fps: best.fps || null,
          tbr: best.tbr || null
        }
      : null,
    best_format_url: best?.url || null
  };
}

router.get('/info', async (req, res) => {
  try {
    const { url, full } = req.query;
    if (!url || typeof url !== 'string' || url.trim().length < 5) {
      return res.status(400).json({ error: 'Invalid or missing URL', code: 'MISSING_URL' });
    }

    const proxy =
      process.env.PROXY_URL ||
      process.env.HTTP_PROXY ||
      process.env.HTTPS_PROXY ||
      null;

    const info = await getVideoInfo(url, { proxy });

    if (full === 'true' || full === '1') {
      res.json(info);
    } else {
      res.json(curateVideoInfo(info));
    }
  } catch (err) {
    const message = err.message || 'Unknown error';
    const { code, status } = classifyInfoError(message);
    res.status(status).json({ error: message, code });
  }
});

module.exports = router;

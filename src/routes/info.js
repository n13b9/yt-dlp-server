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

function curateVideoInfo(info) {
  return {
    id: info.id || null,
    title: info.title || null,
    duration: info.duration || null,
    author: info.uploader || info.channel || null,
    channel: info.channel || info.uploader || null,
    thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || null,
    description: info.description || null,
    view_count: info.view_count || null,
    like_count: info.like_count || null,
    upload_date: info.upload_date || null,
    url: info.webpage_url || null
  };
}

router.get('/info', async (req, res) => {
  try {
    const { url, full, proxy: proxyParam } = req.query;

    if (!url || typeof url !== 'string' || url.trim().length < 5) {
      return res.status(400).json({ error: 'Invalid or missing URL', code: 'MISSING_URL' });
    }

    const proxy =
      proxyParam ||
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

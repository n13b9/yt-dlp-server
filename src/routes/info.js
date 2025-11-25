const express = require('express');
const router = express.Router();
const { getVideoInfo } = require('../utils/ytdlp');

function curateVideoInfo(fullInfo) {
  const bestFormat =
    fullInfo.requested_formats?.[0] ||
    fullInfo.formats?.find(f => f.vcodec !== 'none' && f.acodec !== 'none') ||
    fullInfo.formats?.[0];

  return {
    id: fullInfo.id,
    title: fullInfo.title,
    duration: fullInfo.duration,
    author: fullInfo.uploader || fullInfo.channel || fullInfo.creator,
    channel: fullInfo.channel || fullInfo.uploader,
    thumbnail: fullInfo.thumbnail || fullInfo.thumbnails?.[0]?.url,
    description: fullInfo.description,
    view_count: fullInfo.view_count,
    like_count: fullInfo.like_count,
    upload_date: fullInfo.upload_date,
    url: fullInfo.url || fullInfo.webpage_url,

    best_format: bestFormat
      ? {
          format_id: bestFormat.format_id,
          ext: bestFormat.ext,
          resolution: bestFormat.resolution,
          filesize: bestFormat.filesize,
          url: bestFormat.url,
          vcodec: bestFormat.vcodec,
          acodec: bestFormat.acodec,
          fps: bestFormat.fps,
          tbr: bestFormat.tbr
        }
      : null,

    best_format_url: bestFormat?.url || null
  };
}

/**
 * GET /info
 * Get video metadata from yt-dlp
 * Query params:
 *   - url (required): Video URL
 *   - full (optional): Return full dump if 'true' (default: false)
 */
router.get('/info', async (req, res) => {
  try {
    const { url, full } = req.query;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL parameter is required',
        code: 'MISSING_URL'
      });
    }
    
    // Get proxy from environment variables
    const proxy = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    
    const videoInfo = await getVideoInfo(url, { proxy });
    
    // Return full dump if requested, otherwise return curated response
    if (full === 'true' || full === '1') {
      res.json(videoInfo);
    } else {
      res.json(curateVideoInfo(videoInfo));
    }
  } catch (error) {
    // Determine error code based on error message
    let code = 'UNKNOWN_ERROR';
    if (error.message.includes('not found')) {
      code = 'YTDLP_NOT_FOUND';
    } else if (error.message.includes('Unsupported URL')) {
      code = 'UNSUPPORTED_URL';
    } else if (error.message.includes('Private video')) {
      code = 'PRIVATE_VIDEO';
    } else if (error.message.includes('Video unavailable')) {
      code = 'VIDEO_UNAVAILABLE';
    }
    
    res.status(500).json({
      error: error.message,
      code
    });
  }
});

module.exports = router;

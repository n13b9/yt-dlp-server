const express = require('express');
const router = express.Router();
const { getVideoInfo } = require('../utils/ytdlp');

/**
 * GET /info
 * Get video metadata from yt-dlp
 * Query params:
 *   - url (required): Video URL
 */
router.get('/info', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL parameter is required',
        code: 'MISSING_URL'
      });
    }
    
    // Get proxy from environment variables
    const proxy = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    
    const videoInfo = await getVideoInfo(url, { proxy });
    
    res.json(videoInfo);
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


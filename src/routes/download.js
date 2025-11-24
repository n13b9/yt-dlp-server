const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');

/**
 * GET /download
 * Download video/audio file
 * Query params:
 *   - url (required): Video URL
 *   - format (optional): Format selector (default: 'best')
 *   - extract_audio (optional): Extract audio only (default: false)
 */
router.get('/download', (req, res) => {
  try {
    const { url, format = 'best', extract_audio } = req.query;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL parameter is required',
        code: 'MISSING_URL'
      });
    }
    
    const args = ['-f', format];
    
    // Add audio extraction if requested
    if (extract_audio === 'true' || extract_audio === '1') {
      args.push('-x', '--audio-format', 'mp3');
    }
    
    // Add proxy if provided
    const proxy = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    if (proxy) {
      args.push('--proxy', proxy);
    }
    
    // Output to stdout for streaming
    args.push('-o', '-', url);
    
    const ytdlp = spawn('yt-dlp', args);
    
    // Set appropriate headers
    res.setHeader('Content-Type', extract_audio ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment');
    
    // Pipe yt-dlp output to response
    ytdlp.stdout.pipe(res);
    
    // Handle errors
    ytdlp.stderr.on('data', (data) => {
      console.error('yt-dlp stderr:', data.toString());
    });
    
    ytdlp.on('error', (error) => {
      if (error.code === 'ENOENT') {
        res.status(500).json({
          error: 'yt-dlp not found. Please ensure yt-dlp is installed and in your PATH.',
          code: 'YTDLP_NOT_FOUND'
        });
      } else {
        res.status(500).json({
          error: error.message,
          code: 'DOWNLOAD_ERROR'
        });
      }
    });
    
    ytdlp.on('close', (code) => {
      if (code !== 0 && !res.headersSent) {
        res.status(500).json({
          error: `yt-dlp process exited with code ${code}`,
          code: 'DOWNLOAD_FAILED'
        });
      }
    });
    
    // Handle client disconnect
    req.on('close', () => {
      ytdlp.kill();
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        code: 'INTERNAL_ERROR'
      });
    }
  }
});

/**
 * POST /download
 * Download video/audio file (alternative endpoint with JSON body)
 * Body:
 *   - url (required): Video URL
 *   - format (optional): Format selector (default: 'best')
 *   - extract_audio (optional): Extract audio only (default: false)
 */
router.post('/download', (req, res) => {
  try {
    const { url, format = 'best', extract_audio } = req.body;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL is required in request body',
        code: 'MISSING_URL'
      });
    }
    
    const args = ['-f', format];
    
    // Add audio extraction if requested
    if (extract_audio === true || extract_audio === 'true' || extract_audio === '1') {
      args.push('-x', '--audio-format', 'mp3');
    }
    
    // Add proxy if provided
    const proxy = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    if (proxy) {
      args.push('--proxy', proxy);
    }
    
    // Output to stdout for streaming
    args.push('-o', '-', url);
    
    const ytdlp = spawn('yt-dlp', args);
    
    // Set appropriate headers
    res.setHeader('Content-Type', extract_audio ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment');
    
    // Pipe yt-dlp output to response
    ytdlp.stdout.pipe(res);
    
    // Handle errors
    ytdlp.stderr.on('data', (data) => {
      console.error('yt-dlp stderr:', data.toString());
    });
    
    ytdlp.on('error', (error) => {
      if (error.code === 'ENOENT') {
        res.status(500).json({
          error: 'yt-dlp not found. Please ensure yt-dlp is installed and in your PATH.',
          code: 'YTDLP_NOT_FOUND'
        });
      } else {
        res.status(500).json({
          error: error.message,
          code: 'DOWNLOAD_ERROR'
        });
      }
    });
    
    ytdlp.on('close', (code) => {
      if (code !== 0 && !res.headersSent) {
        res.status(500).json({
          error: `yt-dlp process exited with code ${code}`,
          code: 'DOWNLOAD_FAILED'
        });
      }
    });
    
    // Handle client disconnect
    req.on('close', () => {
      ytdlp.kill();
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        code: 'INTERNAL_ERROR'
      });
    }
  }
});

module.exports = router;


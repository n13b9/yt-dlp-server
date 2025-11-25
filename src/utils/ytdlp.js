const { spawn } = require('child_process');

/**
 * Execute yt-dlp command and return JSON output
 * @param {string} url - Video URL
 * @param {Object} options - Additional options
 * @param {string} options.proxy - Proxy URL (optional)
 * @returns {Promise<Object>} - Parsed JSON output from yt-dlp
 */
function getVideoInfo(url, options = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--skip-download',
      '--no-warnings',
      '--no-call-home',
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]'
    ];
    
    
    
    
    // Add proxy if provided
    if (options.proxy) {
      args.push('--proxy', options.proxy);
    }
    
    // Add the URL
    args.push(url);
    
    const ytdlp = spawn('yt-dlp', args);
    
    let stdout = '';
    let stderr = '';
    
    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ytdlp.on('close', (code) => {
      if (code !== 0) {
        // Try to parse error message from stderr
        const errorMsg = stderr.trim() || `yt-dlp process exited with code ${code}`;
        reject(new Error(errorMsg));
        return;
      }
      
      try {
        const jsonData = JSON.parse(stdout);
        resolve(jsonData);
      } catch (parseError) {
        reject(new Error(`Failed to parse yt-dlp output: ${parseError.message}`));
      }
    });
    
    ytdlp.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('yt-dlp not found. Please ensure yt-dlp is installed and in your PATH.'));
      } else {
        reject(error);
      }
    });
  });
}

module.exports = {
  getVideoInfo
};


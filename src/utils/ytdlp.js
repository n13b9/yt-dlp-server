const { spawn } = require('child_process');

function getVideoInfo(url, options = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = () => ((Date.now() - start) / 1000).toFixed(3) + 's';

    console.error(`[${t()}] getVideoInfo() START for URL: ${url}`);

    const args = [
      '--skip-download',
      '--simulate',
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      '--no-call-home',
      '--no-check-certificate'
    ];

    if (options.proxy) {
      args.push('--proxy', options.proxy);
    }

    args.push(url);

    console.error(`[${t()}] USING YTDLP ARGS: ${args.join(" ")}`);
    console.error(`[${t()}] Spawning yt-dlp process...`);

    const ytdlp = spawn('yt-dlp', args);

    let stdout = '';
    let stderr = '';
    let firstStdout = false;
    let firstStderr = false;

    ytdlp.stdout.on('data', data => {
      if (!firstStdout) {
        console.error(`[${t()}] FIRST STDOUT (${data.length} bytes)`);
        firstStdout = true;
      }
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', data => {
      if (!firstStderr) {
        console.error(`[${t()}] FIRST STDERR (${data.length} bytes)`);
        firstStderr = true;
      }
      stderr += data.toString();
    });

    ytdlp.on('close', code => {
      console.error(`[${t()}] yt-dlp EXIT (code=${code})`);

      if (code !== 0) {
        console.error(`[${t()}] STDERR:\n${stderr}`);
        return reject(new Error(stderr || `yt-dlp exited with ${code}`));
      }

      console.error(`[${t()}] Parsing JSON...`);
      const parseStart = Date.now();

      try {
        const json = JSON.parse(stdout);
        const parseTime = ((Date.now() - parseStart) / 1000).toFixed(3);
        console.error(`[${parseTime}s] JSON parsed`);
        console.error(`[${t()}] getVideoInfo() FINISHED`);
        resolve(json);
      } catch (e) {
        reject(new Error(`JSON parse failed: ${e.message}`));
      }
    });

    ytdlp.on('error', err => {
      console.error(`[${t()}] Process ERROR: ${err.message}`);
      reject(err);
    });
  });
}

module.exports = { getVideoInfo };

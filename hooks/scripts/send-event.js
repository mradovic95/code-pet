'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const pathMod = require('path');

const PORT = parseInt(process.env.CODE_PET_PORT, 10) || 31425;
const DEBUG_LOG = pathMod.join(os.homedir(), '.code-pet', 'hooks-debug.log');

function debugLog(msg) {
  try {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.mkdirSync(pathMod.dirname(DEBUG_LOG), { recursive: true });
    fs.appendFileSync(DEBUG_LOG, line);
  } catch { /* ignore */ }
}

function sendEvent(eventName, data) {
  debugLog(`hook → ${eventName} (port ${PORT})`);
  return new Promise((resolve) => {
    const payload = JSON.stringify({ event: eventName, ...data });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/event',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 1000,
      },
      (res) => {
        res.resume(); // drain
        debugLog(`hook → ${eventName} ✓ (HTTP ${res.statusCode})`);
        resolve(true);
      }
    );

    req.on('error', (err) => {
      debugLog(`hook → ${eventName} ✗ (${err.message})`);
      resolve(false);
    });
    req.on('timeout', () => {
      debugLog(`hook → ${eventName} ✗ (timeout)`);
      req.destroy();
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { sendEvent, debugLog };

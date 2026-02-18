'use strict';

const http = require('http');

const PORT = parseInt(process.env.CODE_PET_PORT, 10) || 31425;

function sendEvent(eventName, data) {
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
        resolve(true);
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { sendEvent };

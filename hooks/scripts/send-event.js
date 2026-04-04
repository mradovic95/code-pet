'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const pathMod = require('path');
const { execFileSync } = require('child_process');

const PORT = parseInt(process.env.CODE_PET_PORT, 10) || 31425;
const DEBUG_LOG = pathMod.join(os.homedir(), '.code-pet', 'hooks-debug.log');
const PROJECT_NAME = pathMod.basename(process.cwd()).replace(/[-_]/g, ' ');

function captureTty(pid) {
  if (process.platform === 'win32') return null;
  try {
    const raw = execFileSync('ps', ['-o', 'tty=', '-p', String(pid)], { timeout: 1000 }).toString().trim();
    if (!raw || raw === '??' || raw === '-') return null;
    return raw.startsWith('/dev/') ? raw : `/dev/${raw}`;
  } catch {
    return null;
  }
}

function getProjectContext() {
  try {
    const cwd = process.cwd();
    const name = pathMod.basename(cwd).replace(/[-_]/g, ' ');
    const tty = captureTty(process.ppid);
    return { project: cwd, projectName: name, claudePid: process.ppid, tty };
  } catch {
    return { project: 'unknown', projectName: 'unknown', claudePid: process.ppid, tty: null };
  }
}

function debugLog(msg) {
  try {
    const line = `[${new Date().toISOString()}] [${PROJECT_NAME}] ${msg}\n`;
    fs.mkdirSync(pathMod.dirname(DEBUG_LOG), { recursive: true });
    fs.appendFileSync(DEBUG_LOG, line);
  } catch { /* ignore */ }
}

function sendEvent(eventName, data) {
  debugLog(`hook → ${eventName} (port ${PORT})`);
  return new Promise((resolve) => {
    const payload = JSON.stringify({ event: eventName, ...getProjectContext(), ...data });

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

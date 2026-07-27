'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const os = require('os');
const logger = require('./logger');

const STATE_DIR = path.join(os.homedir(), '.code-pet');
const PID_FILE = path.join(STATE_DIR, 'app.pid');
const PORT = parseInt(process.env.CODE_PET_PORT, 10) || 31425;

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function writePid(pid) {
  ensureStateDir();
  fs.writeFileSync(PID_FILE, String(pid));
}

function readPid() {
  try {
    const content = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`readPid failed: ${err.code} ${err.message}`);
    return null;
  }
}

function removePid() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`removePid failed: ${err.code} ${err.message}`);
  }
}

function killProcess(pid) {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/t'], { stdio: 'ignore' });
    } catch (err) {
      logger.warn(`killProcess(taskkill) failed for pid ${pid}: ${err.message}`);
    }
  } else {
    process.kill(pid, 'SIGTERM');
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/health',
        method: 'GET',
        timeout: 1000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(res.statusCode === 200));
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function isRunning() {
  const healthy = await healthCheck();
  if (healthy) return true;

  const pid = readPid();
  if (pid && isPidAlive(pid)) return true;

  // Stale PID file
  if (pid) removePid();
  return false;
}

function resolveElectronBinary(pluginRoot) {
  const electronPath = path.join(pluginRoot, 'node_modules', 'electron', 'dist');
  if (process.platform === 'darwin') {
    return path.join(electronPath, 'Electron.app', 'Contents', 'MacOS', 'Electron');
  } else if (process.platform === 'win32') {
    return path.join(electronPath, 'electron.exe');
  }
  return path.join(electronPath, 'electron');
}

async function launchApp(pluginRoot) {
  // Double-check: narrow the race window (single-instance lock is the true guard)
  if (await isRunning()) return readPid();

  const electronBin = resolveElectronBinary(pluginRoot);

  if (!fs.existsSync(electronBin)) {
    return null;
  }

  const mainScript = path.join(pluginRoot, 'src', 'app', 'main.js');
  const logFile = path.join(STATE_DIR, 'app.log');
  ensureStateDir();
  const logFd = fs.openSync(logFile, 'a');

  const child = spawn(electronBin, [mainScript], {
    cwd: pluginRoot,
    stdio: ['ignore', logFd, logFd],
    detached: true,
    env: {
      ...process.env,
      CODE_PET_PORT: String(PORT),
      CODE_PET_PLUGIN_ROOT: pluginRoot,
    },
  });

  const pid = child.pid;
  writePid(pid);
  child.unref();

  try {
    fs.closeSync(logFd);
  } catch { /* ignore */ }

  return pid;
}

function stopApp() {
  return new Promise((resolve) => {
    // Try graceful shutdown via HTTP
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/shutdown',
        method: 'POST',
        timeout: 2000,
      },
      () => {
        removePid();
        resolve(true);
      }
    );
    req.on('error', () => {
      // Fallback: kill via PID
      const pid = readPid();
      if (pid) {
        try {
          killProcess(pid);
        } catch (err) {
          if (err.code !== 'ESRCH') logger.warn(`stopApp fallback kill failed for pid ${pid}: ${err.code} ${err.message}`);
        }
      }
      removePid();
      resolve(false);
    });
    req.on('timeout', () => {
      req.destroy();
      const pid = readPid();
      if (pid) {
        try {
          killProcess(pid);
        } catch (err) {
          if (err.code !== 'ESRCH') logger.warn(`stopApp timeout kill failed for pid ${pid}: ${err.code} ${err.message}`);
        }
      }
      removePid();
      resolve(false);
    });
    req.end();
  });
}

module.exports = {
  PORT,
  STATE_DIR,
  writePid,
  readPid,
  removePid,
  killProcess,
  isRunning,
  healthCheck,
  launchApp,
  stopApp,
};

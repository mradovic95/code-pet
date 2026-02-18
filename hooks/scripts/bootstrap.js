'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const STATE_DIR = path.join(os.homedir(), '.code-pet');
const LOCK_FILE = path.join(STATE_DIR, 'installing');

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function isElectronInstalled(pluginRoot) {
  try {
    const electronPkg = path.join(pluginRoot, 'node_modules', 'electron', 'package.json');
    return fs.existsSync(electronPkg);
  } catch {
    return false;
  }
}

function isInstalling() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return false;
    const stat = fs.statSync(LOCK_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    // Stale lock: if older than 10 minutes, remove it
    if (ageMs > 10 * 60 * 1000) {
      fs.unlinkSync(LOCK_FILE);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function startInstall(pluginRoot) {
  ensureStateDir();
  fs.writeFileSync(LOCK_FILE, String(process.pid));

  const logFile = path.join(STATE_DIR, 'install.log');
  const logFd = fs.openSync(logFile, 'a');

  const child = spawn('npm', ['install', '--prefix', pluginRoot], {
    cwd: pluginRoot,
    stdio: ['ignore', logFd, logFd],
    detached: true,
    shell: process.platform === 'win32',
  });

  child.on('exit', (code) => {
    try {
      fs.closeSync(logFd);
    } catch { /* ignore */ }
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch { /* ignore */ }
  });

  child.unref();
}

function bootstrap(pluginRoot) {
  if (!pluginRoot) {
    pluginRoot = path.resolve(__dirname, '..', '..');
  }

  if (isElectronInstalled(pluginRoot)) {
    return { ready: true };
  }

  if (isInstalling()) {
    return { ready: false, reason: 'install-in-progress' };
  }

  startInstall(pluginRoot);
  return { ready: false, reason: 'install-started' };
}

module.exports = { bootstrap };

// Allow direct execution for testing
if (require.main === module) {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
  const result = bootstrap(pluginRoot);
  console.log(JSON.stringify(result));
}

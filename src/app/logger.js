'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = path.join(os.homedir(), '.code-pet');
const LOG_FILE = path.join(STATE_DIR, 'code-pet.log');
const MAX_SIZE = 1 * 1024 * 1024; // 1MB

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function rotateIfNeeded() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_SIZE) {
      fs.truncateSync(LOG_FILE, 0);
    }
  } catch { /* file doesn't exist yet, that's fine */ }
}

function log(level, message) {
  ensureStateDir();
  rotateIfNeeded();
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch { /* ignore write errors */ }
}

module.exports = {
  info: (msg) => log('INFO', msg),
  warn: (msg) => log('WARN', msg),
  error: (msg) => log('ERROR', msg),
};

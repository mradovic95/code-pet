'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = path.join(os.homedir(), '.code-pet');
const PID_FILE = path.join(STATE_DIR, 'app.pid');
const PLUGIN_ROOT = path.resolve(__dirname, '..');

// Kill running Electron
try {
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  if (pid > 0) {
    process.kill(pid, 'SIGTERM');
    console.log(`Stopped Electron process (PID ${pid}).`);
  }
} catch { /* not running */ }

// Remove state directory
try {
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
  console.log(`Removed ${STATE_DIR}`);
} catch (err) {
  console.warn(`Could not remove ${STATE_DIR}: ${err.message}`);
}

// Remove node_modules
try {
  const nm = path.join(PLUGIN_ROOT, 'node_modules');
  fs.rmSync(nm, { recursive: true, force: true });
  console.log(`Removed ${nm}`);
} catch (err) {
  console.warn(`Could not remove node_modules: ${err.message}`);
}

console.log('\nCode Pet: uninstalled.');
console.log('Plugin hooks removed separately via: claude plugin remove code-pet');

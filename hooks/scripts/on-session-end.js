'use strict';

const path = require('path');
const { sendEvent } = require('./send-event');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

async function main() {
  const sent = await sendEvent('falling_asleep');
  if (!sent) {
    // Server unreachable — clean up orphaned Electron as safety net
    const pm = require(path.join(PLUGIN_ROOT, 'src', 'app', 'process-manager'));
    await pm.stopApp();
  }
  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

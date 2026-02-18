'use strict';

const path = require('path');
const { sendEvent } = require('./send-event');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

async function main() {
  // Send sleep event so the dog plays the sleep animation
  await sendEvent('sleep');

  // Wait for the sleep animation to be visible before shutting down
  await new Promise((r) => setTimeout(r, 1500));

  // Gracefully shut down the Electron app
  const pm = require(path.join(PLUGIN_ROOT, 'src', 'app', 'process-manager'));
  await pm.stopApp();

  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

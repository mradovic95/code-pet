'use strict';

const path = require('path');
const { bootstrap } = require('./bootstrap');
const { sendEvent } = require('./send-event');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

async function main() {
  // Step 1: Ensure dependencies are installed
  const result = bootstrap(PLUGIN_ROOT);

  if (!result.ready) {
    const { debugLog } = require('./send-event');
    const msg = result.reason === 'install-started'
      ? 'Code Pet: Installing Electron (~85MB), pet will appear on next session...'
      : 'Code Pet: Installation in progress, pet will appear soon...';
    debugLog(msg);
    process.stderr.write(msg + '\n');
    process.stdout.write('{}');
    process.exit(0);
  }

  // Step 2: Ensure Electron app is running
  // Require process-manager only after bootstrap confirms deps are ready
  // (process-manager itself only uses built-ins, but we gate on readiness for launchApp)
  const pm = require(path.join(PLUGIN_ROOT, 'src', 'app', 'process-manager'));

  const running = await pm.isRunning();
  if (!running) {
    await pm.launchApp(PLUGIN_ROOT);

    // Wait up to 2s for app to become healthy
    let healthy = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 200));
      healthy = await pm.healthCheck();
      if (healthy) break;
    }
  }

  // Step 3: Send awaken event
  await sendEvent('awaken');

  process.stdout.write('{}');
}

main().catch((err) => {
  const { debugLog } = require('./send-event');
  debugLog(`on-session-start FAILED: ${err.message || err}`);
  process.stderr.write(`Code Pet: startup failed — ${err.message || err}\n`);
  process.stdout.write('{}');
  process.exit(0);
});

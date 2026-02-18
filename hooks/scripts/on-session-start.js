'use strict';

const path = require('path');
const { bootstrap } = require('./bootstrap');
const { sendEvent } = require('./send-event');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

async function main() {
  // Step 1: Ensure dependencies are installed
  const result = bootstrap(PLUGIN_ROOT);

  if (!result.ready) {
    // Dependencies installing in background, dog can't launch yet
    process.stdout.write('{}');
    process.exit(0);
  }

  // Step 2: Ensure Electron app is running
  // Require process-manager only after bootstrap confirms deps are ready
  // (process-manager itself only uses built-ins, but we gate on readiness for launchApp)
  const pm = require(path.join(PLUGIN_ROOT, 'src', 'app', 'process-manager'));

  const running = await pm.isRunning();
  if (!running) {
    pm.launchApp(PLUGIN_ROOT);

    // Wait up to 2s for app to become healthy
    let healthy = false;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 200));
      healthy = await pm.healthCheck();
      if (healthy) break;
    }
  }

  // Step 3: Send wake event
  await sendEvent('wake');

  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

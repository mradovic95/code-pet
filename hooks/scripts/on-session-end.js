'use strict';

const path = require('path');
const { sendEvent, debugLog, fetchLastEvent } = require('./send-event');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

async function main() {
  // Send falling_asleep event (server tracks it for shutdown or suppresses if pet is active)
  await sendEvent('falling_asleep');

  // Brief delay to allow any in-flight events to settle before checking last-event
  await new Promise((r) => setTimeout(r, 1500));

  // Check if another session already started (awaken received after our falling_asleep)
  const last = await fetchLastEvent();
  if (last && last.event && last.event !== 'falling_asleep') {
    debugLog(`on-session-end: skipping shutdown — last event is "${last.event}", not "falling_asleep"`);
    process.stdout.write('{}');
    return;
  }

  debugLog('on-session-end: proceeding with shutdown');

  // Gracefully shut down the Electron app
  const pm = require(path.join(PLUGIN_ROOT, 'src', 'app', 'process-manager'));
  await pm.stopApp();

  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

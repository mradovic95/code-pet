'use strict';

const path = require('path');
const { sendEvent, readStdin } = require('./send-event');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

async function main() {
  const input = await readStdin();
  const sent = await sendEvent('falling_asleep', { sessionId: input.session_id });
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

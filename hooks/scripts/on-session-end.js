'use strict';

const path = require('path');
const { sendEvent, debugLog } = require('./send-event');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

async function main() {
  const input = await readStdin();

  debugLog(`on-session-end stdin: ${JSON.stringify(input)}`);

  // /clear and /resume end the session in place and immediately start a new
  // one in the same terminal — keep the pet alive for those.
  if (input.reason === 'clear' || input.reason === 'resume') {
    process.stdout.write('{}');
    return;
  }

  const sent = await sendEvent('falling_asleep', { reason: input.reason });
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

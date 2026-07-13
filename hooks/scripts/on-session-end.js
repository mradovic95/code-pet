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
    // sendEvent returns false on a connection error OR a 1s timeout, and a
    // timeout can just mean the server is briefly busy. The Electron app is
    // shared by every concurrent session, so quitting it on that signal alone
    // wipes out everyone's pets. Confirm the server is genuinely unreachable
    // with a second probe before tearing down an orphaned process — a healthy
    // server removes this project itself and self-shuts-down when it empties.
    const pm = require(path.join(PLUGIN_ROOT, 'src', 'app', 'process-manager'));
    const alive = await pm.healthCheck();
    if (!alive) {
      await pm.stopApp();
    }
  }
  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

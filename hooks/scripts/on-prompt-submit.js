'use strict';

const { sendEvent, debugLog } = require('./send-event');

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

  debugLog(`on-prompt-submit stdin: ${JSON.stringify(input)}`);

  const event = input.permission_mode === 'plan' ? 'planning_started' : 'working_started';
  await sendEvent(event, { prompt_length: input.prompt?.length });

  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

'use strict';

const { sendEvent } = require('./send-event');

async function main() {
  // Drain stdin (hook may pipe data)
  for await (const _chunk of process.stdin) { /* discard */ }

  await sendEvent('thinking');

  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

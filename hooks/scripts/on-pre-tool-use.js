'use strict';

const { sendEvent } = require('./send-event');

const TYPING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let toolName = '';
  try {
    const data = JSON.parse(input);
    toolName = data.tool_name || '';
  } catch { /* ignore parse errors */ }

  const event = TYPING_TOOLS.has(toolName) ? 'typing' : 'thinking';
  await sendEvent(event);

  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

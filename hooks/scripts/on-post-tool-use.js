'use strict';

const { sendEvent } = require('./send-event');

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let event = 'success';
  try {
    const data = JSON.parse(input);
    // Check for error indicators in tool result
    const result = data.tool_result || '';
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    if (
      data.tool_error ||
      data.error ||
      resultStr.includes('Error') ||
      resultStr.includes('ENOENT') ||
      resultStr.includes('failed')
    ) {
      event = 'error';
    }
  } catch { /* ignore parse errors, default to success */ }

  await sendEvent(event);

  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

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
  debugLog(`on-pre-tool-use stdin: ${JSON.stringify(input)}`);

  // Fires only for Skill and mcp__* tools (matcher in hooks.json). The server
  // pairs this with the PostToolUse action_completed to compute a duration.
  await sendEvent('action_started', {
    toolName: input.tool_name,
    toolUseId: input.tool_use_id,
    agentId: input.agent_id,
  });

  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

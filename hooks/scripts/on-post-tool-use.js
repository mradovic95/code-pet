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
  debugLog(`on-post-tool-use stdin: ${JSON.stringify(input)}`);

  const toolName = input.tool_name || 'unknown';
  const toolInput = input.tool_input ? JSON.stringify(input.tool_input) : '{}';
  const toolOutput = input.tool_output ? JSON.stringify(input.tool_output).slice(0, 500) : '{}';

  debugLog(`PostToolUse: tool=${toolName} input=${toolInput} output=${toolOutput}`);

  debugLog(`PostToolUse: tool completed → sending action_completed (permissionMode=${input.permission_mode || 'none'})`);
  await sendEvent('action_completed', { permissionMode: input.permission_mode, toolName: input.tool_name, toolInput: input.tool_input, agentId: input.agent_id, agentType: input.agent_type, toolUseId: input.tool_use_id });

  process.stdout.write('{}');
}

main().catch(() => {
  process.stdout.write('{}');
  process.exit(0);
});

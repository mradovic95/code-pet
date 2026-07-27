'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const TestHttpServer = require('../helpers/test-http-server');

const HOOK_SCRIPT = path.join(__dirname, '../../hooks/scripts/on-pre-tool-use.js');

describe('on-pre-tool-use hook', () => {
  const server = new TestHttpServer();
  let port;

  before(async () => {
    port = await server.start();
  });

  beforeEach(() => {
    server.reset();
  });

  after(async () => {
    await server.close();
  });

  function spawnHook(stdinJson, { env = {}, cwd } = {}) {
    return new Promise((resolve) => {
      let stdout = '';
      // Strip CLAUDE_PROJECT_DIR inherited from a Claude Code session running
      // the tests, so only the env explicitly passed by a test is in effect.
      const baseEnv = { ...process.env, CODE_PET_PORT: String(port) };
      delete baseEnv.CLAUDE_PROJECT_DIR;
      const sut = spawn('node', [HOOK_SCRIPT], {
        env: { ...baseEnv, ...env },
        cwd,
      });
      sut.stdout.on('data', (d) => (stdout += d));
      sut.stdin.write(JSON.stringify(stdinJson));
      sut.stdin.end();
      sut.on('close', (code) => resolve({ code, stdout }));
    });
  }

  it('sends action_started with the tool name', async () => {
    // GIVEN
    const input = { tool_name: 'Skill', tool_input: { skill: 'commit' } };

    // WHEN
    const { code, stdout } = await spawnHook(input);

    // THEN
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
    const requests = server.getRequests();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.event, 'action_started');
    assert.equal(requests[0].body.toolName, 'Skill');
  });

  it('forwards tool_use_id and agent_id when present', async () => {
    // GIVEN
    const input = {
      tool_name: 'mcp__db__query',
      tool_use_id: 'toolu_abc123',
      agent_id: 'a8917150403d66ba2',
    };

    // WHEN
    await spawnHook(input);

    // THEN
    const requests = server.getRequests();
    assert.equal(requests[0].body.toolUseId, 'toolu_abc123');
    assert.equal(requests[0].body.agentId, 'a8917150403d66ba2');
  });

  it('sends action_started for a subagent spawn (Task matcher)', async () => {
    // GIVEN — hooks.json matches Task/Agent so subagent runs get duration-paired
    const input = {
      tool_name: 'Task',
      tool_input: { subagent_type: 'Explore', prompt: 'find usages' },
      tool_use_id: 'toolu_task42',
    };

    // WHEN
    await spawnHook(input);

    // THEN
    const requests = server.getRequests();
    assert.equal(requests[0].body.event, 'action_started');
    assert.equal(requests[0].body.toolName, 'Task');
    assert.equal(requests[0].body.toolUseId, 'toolu_task42');
  });

  it('exits cleanly with {} on empty stdin', async () => {
    // GIVEN
    const input = {};

    // WHEN
    const { code, stdout } = await spawnHook(input);

    // THEN
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
  });

  it('exits cleanly even when the event server is unreachable', async () => {
    // GIVEN — point the hook at a port nobody listens on
    const input = { tool_name: 'Skill' };

    // WHEN
    const { code, stdout } = await spawnHook(input, { env: { CODE_PET_PORT: '9' } });

    // THEN
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
  });
});

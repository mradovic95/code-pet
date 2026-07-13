'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const TestHttpServer = require('../helpers/test-http-server');

const HOOK_SCRIPT = path.join(__dirname, '../../hooks/scripts/on-post-tool-use.js');

describe('on-post-tool-use hook', () => {
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

  it('sends action_completed with tool info', async () => {
    // GIVEN
    const input = {
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test.js' },
      permission_mode: 'auto-edit',
    };

    // WHEN
    const { code, stdout } = await spawnHook(input);

    // THEN
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
    const requests = server.getRequests();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.event, 'action_completed');
    assert.equal(requests[0].body.toolName, 'Read');
    assert.equal(requests[0].body.permissionMode, 'auto-edit');
  });

  it('forwards agent_id from stdin as agentId', async () => {
    // GIVEN
    const input = {
      tool_name: 'WebFetch',
      permission_mode: 'dontAsk',
      agent_id: 'a8917150403d66ba2',
      agent_type: 'Explore',
    };

    // WHEN
    await spawnHook(input);

    // THEN
    const requests = server.getRequests();
    assert.equal(requests[0].body.event, 'action_completed');
    assert.equal(requests[0].body.agentId, 'a8917150403d66ba2');
  });

  it('sends action_completed with plan permissionMode', async () => {
    // GIVEN
    const input = {
      tool_name: 'Bash',
      permission_mode: 'plan',
    };

    // WHEN
    await spawnHook(input);

    // THEN
    const requests = server.getRequests();
    assert.equal(requests[0].body.event, 'action_completed');
    assert.equal(requests[0].body.permissionMode, 'plan');
  });

  it('uses CLAUDE_PROJECT_DIR as project even when cwd has drifted to a subfolder', async () => {
    // GIVEN — the hook runs with cwd deep inside the repo, but the session root is set
    const projectRoot = path.join(__dirname, '../..');
    const driftedCwd = __dirname; // a subfolder of the project root
    const input = { tool_name: 'Read' };

    // WHEN
    await spawnHook(input, { env: { CLAUDE_PROJECT_DIR: projectRoot }, cwd: driftedCwd });

    // THEN
    const requests = server.getRequests();
    assert.equal(requests[0].body.project, projectRoot);
    assert.equal(requests[0].body.projectName, path.basename(projectRoot).replace(/[-_]/g, ' '));
  });

  it('falls back to cwd as project when CLAUDE_PROJECT_DIR is not set', async () => {
    // GIVEN
    const cwd = __dirname;
    const input = { tool_name: 'Read' };

    // WHEN
    await spawnHook(input, { cwd });

    // THEN
    const requests = server.getRequests();
    assert.equal(requests[0].body.project, cwd);
  });
});

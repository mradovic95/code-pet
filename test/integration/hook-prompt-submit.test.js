'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const TestHttpServer = require('../helpers/test-http-server');

const HOOK_SCRIPT = path.join(__dirname, '../../hooks/scripts/on-prompt-submit.js');

describe('on-prompt-submit hook', () => {
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

  function spawnHook(stdinJson) {
    return new Promise((resolve) => {
      let stdout = '';
      const sut = spawn('node', [HOOK_SCRIPT], {
        env: { ...process.env, CODE_PET_PORT: String(port) },
      });
      sut.stdout.on('data', (d) => (stdout += d));
      sut.stdin.write(JSON.stringify(stdinJson));
      sut.stdin.end();
      sut.on('close', (code) => resolve({ code, stdout }));
    });
  }

  it('sends planning_started when permission_mode is plan', async () => {
    // GIVEN
    const input = { permission_mode: 'plan', prompt: 'design the feature' };

    // WHEN
    const { code, stdout } = await spawnHook(input);

    // THEN
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
    const requests = server.getRequests();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.event, 'planning_started');
  });

  it('sends working_started when permission_mode is not plan', async () => {
    // GIVEN
    const input = { permission_mode: 'auto-edit', prompt: 'fix the bug' };

    // WHEN
    const { code, stdout } = await spawnHook(input);

    // THEN
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
    const requests = server.getRequests();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.event, 'working_started');
  });

  it('sends working_started when no permission_mode provided', async () => {
    // GIVEN
    const input = { prompt: 'hello' };

    // WHEN
    const { code } = await spawnHook(input);

    // THEN
    assert.equal(code, 0);
    const requests = server.getRequests();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.event, 'working_started');
  });

  it('includes prompt_length in payload', async () => {
    // GIVEN
    const input = { permission_mode: 'auto-edit', prompt: 'hello world' };

    // WHEN
    await spawnHook(input);

    // THEN
    const requests = server.getRequests();
    assert.equal(requests[0].body.prompt_length, 11);
  });

  it('exits 0 with {} on malformed stdin', async () => {
    // GIVEN / WHEN
    const { code, stdout } = await new Promise((resolve) => {
      let out = '';
      const sut = spawn('node', [HOOK_SCRIPT], {
        env: { ...process.env, CODE_PET_PORT: String(port) },
      });
      sut.stdout.on('data', (d) => (out += d));
      sut.stdin.write('not json');
      sut.stdin.end();
      sut.on('close', (c) => resolve({ code: c, stdout: out }));
    });

    // THEN
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
  });
});

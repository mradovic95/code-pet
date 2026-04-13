'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const TestHttpServer = require('../helpers/test-http-server');

const HOOK_SCRIPT = path.join(__dirname, '../../hooks/scripts/on-stop.js');

describe('on-stop hook', () => {
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

  it('sends work_finished event', async () => {
    // GIVEN
    const input = { stop_reason: 'end_turn' };

    // WHEN
    const { code, stdout } = await spawnHook(input);

    // THEN
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
    const requests = server.getRequests();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.event, 'work_finished');
    assert.equal(requests[0].body.stop_reason, 'end_turn');
  });
});

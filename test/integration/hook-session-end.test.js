'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const TestHttpServer = require('../helpers/test-http-server');

const HOOK_SCRIPT = path.join(__dirname, '../../hooks/scripts/on-session-end.js');

describe('on-session-end hook', () => {
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

  it('sends falling_asleep event', async () => {
    // GIVEN / WHEN
    const { code, stdout } = await new Promise((resolve) => {
      let out = '';
      const sut = spawn('node', [HOOK_SCRIPT], {
        env: { ...process.env, CODE_PET_PORT: String(port) },
      });
      sut.stdout.on('data', (d) => (out += d));
      sut.stdin.end();
      sut.on('close', (c) => resolve({ code: c, stdout: out }));
    });

    // THEN
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
    const requests = server.getRequests();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.event, 'falling_asleep');
  });

  it('exits 0 when server is unreachable', async () => {
    // GIVEN — use a port where nothing is listening
    const { code, stdout } = await new Promise((resolve) => {
      let out = '';
      const sut = spawn('node', [HOOK_SCRIPT], {
        env: { ...process.env, CODE_PET_PORT: '19999' },
      });
      sut.stdout.on('data', (d) => (out += d));
      sut.stdin.end();
      sut.on('close', (c) => resolve({ code: c, stdout: out }));
    });

    // THEN — should still exit cleanly
    assert.equal(code, 0);
    assert.equal(stdout, '{}');
  });
});

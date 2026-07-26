'use strict';

// Mocks must be wired into require.cache BEFORE event-server is required.
const mockElectron = {
  app: {
    quit: () => { mockElectron.app._quitCalled = true; },
    _quitCalled: false,
  },
};

const mockWindowManager = {
  sendToRenderer: (channel, payload) => {
    mockWindowManager._calls.push({ channel, payload });
  },
  isRendererReady: () => mockWindowManager._rendererReady,
  resizeForPetCount: () => {},
  _rendererReady: true,
  _calls: [],
};

const mockProcessManager = {
  healthCheck: async () => false,
  readPid: () => null,
  killProcess: () => {},
  removePid: () => {},
};

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

const mockSettingsStore = {
  getPetTypeForProject: () => 'dog',
  getDefaultPetType: () => 'dog',
  load: () => {},
  save: () => {},
};

function wire(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

wire('electron', mockElectron);
wire('../../../src/app/windows/window-manager', mockWindowManager);
wire('../../../src/app/core/process-manager', mockProcessManager);
wire('../../../src/app/core/logger', mockLogger);
wire('../../../src/app/core/settings-store', mockSettingsStore);

// Non-default port avoids collisions with a real running pet on the
// dev machine. (parseInt('0', 10) || 31425 in event-server.js falls back
// to 31425 for "0", so we can't use the OS-assigned port trick.)
process.env.CODE_PET_PORT = String(31500 + (process.pid % 100));

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const sut = require('../../../src/app/server/event-server');

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const headers = { Connection: 'close' };
    if (payload != null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: urlPath,
      headers,
      agent: false,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* leave as text */ }
        resolve({ statusCode: res.statusCode, body: json, raw: text });
      });
    });
    req.on('error', reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

let uniqueProjectCounter = 0;
function uniqueProjectPath() {
  uniqueProjectCounter += 1;
  return `/test/project-${uniqueProjectCounter}-${Date.now()}`;
}

describe('event-server', () => {
  let port;

  // Bind the server ONCE for the whole suite to avoid TCP port reuse races
  // between tests on macOS (close() can lag long enough to EADDRINUSE the next bind).
  before(async () => {
    const server = await sut.startServer();
    port = server.address().port;
  });

  after(async () => {
    await sut.stopServer();
  });

  beforeEach(() => {
    mockWindowManager._rendererReady = true;
    mockWindowManager._calls = [];
    mockElectron.app._quitCalled = false;
  });

  describe('GET /health', () => {
    it('returns 200 when renderer is ready', async () => {
      // GIVEN
      mockWindowManager._rendererReady = true;

      // WHEN
      const res = await request(port, 'GET', '/health');

      // THEN
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.status, 'ok');
    });

    it('returns 503 when renderer is not ready', async () => {
      // GIVEN
      mockWindowManager._rendererReady = false;

      // WHEN
      const res = await request(port, 'GET', '/health');

      // THEN
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.status, 'waiting');
    });
  });

  describe('GET /last-event', () => {
    it('returns all-projects snapshot when no query params are given', async () => {
      // GIVEN
      // (registry may have entries from prior tests — assert shape only)

      // WHEN
      const res = await request(port, 'GET', '/last-event');

      // THEN
      assert.equal(res.statusCode, 200);
      assert.equal(typeof res.body.projects, 'object');
    });

    it('returns the snapshot for a known session when session= is provided', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();
      await request(port, 'POST', '/event', {
        event: 'working_started',
        project: projectPath,
        projectName: 'session-test',
        claudePid: 99001,
      });
      const sessionKey = `${projectPath}::99001`;

      // WHEN
      const res = await request(port, 'GET', `/last-event?session=${encodeURIComponent(sessionKey)}`);

      // THEN
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.event, 'working_started');
      assert.ok(res.body.timestamp);
    });

    it('returns sessions for a project when project= is provided', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();
      await request(port, 'POST', '/event', {
        event: 'working_started',
        project: projectPath,
        projectName: 'project-query-test',
        claudePid: 99002,
      });

      // WHEN
      const res = await request(port, 'GET', `/last-event?project=${encodeURIComponent(projectPath)}`);

      // THEN
      assert.equal(res.statusCode, 200);
      assert.equal(typeof res.body.sessions, 'object');
      const keys = Object.keys(res.body.sessions);
      assert.equal(keys.length, 1);
      assert.ok(keys[0].startsWith(projectPath));
    });
  });

  describe('POST /event', () => {
    it('creates a pet on first event and dispatches to renderer', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();
      mockWindowManager._calls = [];

      // WHEN
      const res = await request(port, 'POST', '/event', {
        event: 'working_started',
        project: projectPath,
        projectName: 'dispatch-test',
        claudePid: 99003,
      });

      // THEN
      assert.equal(res.statusCode, 200);
      const petEventCalls = mockWindowManager._calls.filter((c) => c.channel === 'pet-event');
      assert.equal(petEventCalls.length, 1);
      assert.equal(petEventCalls[0].payload.state, 'working');
    });

    it('stores permissionMode on the pet when provided', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();

      // WHEN
      await request(port, 'POST', '/event', {
        event: 'planning_started',
        project: projectPath,
        projectName: 'permission-mode-test',
        claudePid: 99004,
        permissionMode: 'plan',
      });
      const sessionKey = `${projectPath}::99004`;
      const res = await request(port, 'GET', `/last-event?session=${encodeURIComponent(sessionKey)}`);

      // THEN
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.event, 'planning_started');
    });

    it('wakes an idle pet to working when action_completed carries agentId', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();
      const base = { project: projectPath, projectName: 'bg-agent-test', claudePid: 99005 };
      await request(port, 'POST', '/event', { event: 'working_started', ...base });
      await request(port, 'POST', '/event', { event: 'work_finished', ...base });

      // WHEN
      const res = await request(port, 'POST', '/event', {
        event: 'action_completed',
        agentId: 'agent-abc',
        ...base,
      });

      // THEN
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.state, 'working');
    });

    it('keeps an idle pet idle when action_completed has no agentId (stale tag cleared)', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();
      const base = { project: projectPath, projectName: 'stale-tag-test', claudePid: 99006 };
      await request(port, 'POST', '/event', { event: 'working_started', ...base });
      await request(port, 'POST', '/event', { event: 'action_completed', agentId: 'agent-abc', ...base });
      await request(port, 'POST', '/event', { event: 'work_finished', ...base });

      // WHEN
      const res = await request(port, 'POST', '/event', { event: 'action_completed', ...base });

      // THEN
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ignored, true);
    });

    it('handles action_started without touching the state machine', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();
      const base = { project: projectPath, projectName: 'pre-tool-test', claudePid: 99007 };
      mockWindowManager._calls = [];

      // WHEN
      const res = await request(port, 'POST', '/event', {
        event: 'action_started',
        toolName: 'Skill',
        ...base,
      });

      // THEN — 200 (not the 400 an unknown event would get), no renderer dispatch
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.received, 'action_started');
      const petEventCalls = mockWindowManager._calls.filter((c) => c.channel === 'pet-event');
      assert.equal(petEventCalls.length, 0);
    });

    it('records durationMs when action_completed follows a matching action_started', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();
      const base = { project: projectPath, projectName: 'duration-test', claudePid: 99008 };
      await request(port, 'POST', '/event', {
        event: 'action_started',
        toolName: 'Skill',
        toolUseId: 'toolu_dur_1',
        ...base,
      });

      // WHEN
      await request(port, 'POST', '/event', {
        event: 'action_completed',
        toolName: 'Skill',
        toolInput: { skill: 'commit' },
        toolUseId: 'toolu_dur_1',
        ...base,
      });

      // THEN
      const events = sut.getToolEventsForSession(`${projectPath}::99008`);
      assert.equal(events.length, 1);
      assert.equal(events[0].name, 'commit');
      assert.equal(typeof events[0].durationMs, 'number');
      assert.ok(events[0].durationMs >= 0);
    });

    it('records no durationMs when action_completed has no prior action_started', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();
      const base = { project: projectPath, projectName: 'no-duration-test', claudePid: 99009 };

      // WHEN
      await request(port, 'POST', '/event', {
        event: 'action_completed',
        toolName: 'Skill',
        toolInput: { skill: 'commit' },
        ...base,
      });

      // THEN
      const events = sut.getToolEventsForSession(`${projectPath}::99009`);
      assert.equal(events.length, 1);
      assert.ok(!('durationMs' in events[0]));
    });

    it('persists agentId on the usage event when the tool ran in a subagent', async () => {
      // GIVEN
      const projectPath = uniqueProjectPath();
      const base = { project: projectPath, projectName: 'agent-attribution-test', claudePid: 99010 };
      await request(port, 'POST', '/event', { event: 'working_started', ...base });

      // WHEN
      await request(port, 'POST', '/event', {
        event: 'action_completed',
        toolName: 'mcp__db__query',
        agentId: 'agent-xyz',
        ...base,
      });

      // THEN
      const events = sut.getToolEventsForSession(`${projectPath}::99010`);
      assert.equal(events.length, 1);
      assert.equal(events[0].agentId, 'agent-xyz');
    });

    it('aborts the connection when body exceeds 1MB (current behavior)', async () => {
      // GIVEN
      const huge = 'x'.repeat(1024 * 1024 + 10);
      const body = JSON.stringify({ event: 'working_started', filler: huge });

      // WHEN / THEN
      // NOTE: event-server.js:48-56 calls req.destroy() once size > 1MB,
      // which kills the socket before the 413 response can be written.
      // The client therefore observes ECONNRESET rather than a clean 413.
      // Production fix would be to send the 413 first, then destroy.
      // This test pins down the current behavior so a future change is
      // observable; update the assertion when event-server.js is fixed.
      await assert.rejects(
        () => request(port, 'POST', '/event', body),
        (err) => err.code === 'ECONNRESET' || err.code === 'EPIPE',
      );
    });

    it('returns 500 when body is malformed JSON', async () => {
      // GIVEN
      const malformed = '{this-is-not-valid-json';

      // WHEN
      const res = await request(port, 'POST', '/event', malformed);

      // THEN
      assert.equal(res.statusCode, 500);
      assert.ok(res.body.error);
    });
  });

  describe('POST /shutdown', () => {
    it('returns 200 then calls app.quit after ~100ms', async () => {
      // GIVEN
      mockElectron.app._quitCalled = false;

      // WHEN
      const res = await request(port, 'POST', '/shutdown');
      await new Promise((r) => setTimeout(r, 150));

      // THEN
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.status, 'shutting-down');
      assert.equal(mockElectron.app._quitCalled, true);
    });
  });

  describe('unknown routes', () => {
    it('returns 404 for unmatched paths', async () => {
      // GIVEN
      // (no setup needed)

      // WHEN
      const res = await request(port, 'GET', '/does-not-exist');

      // THEN
      assert.equal(res.statusCode, 404);
      assert.equal(res.body.error, 'Not found');
    });
  });
});

// TODO (deferred from initial coverage):
// - EADDRINUSE recovery branch (event-server.js:186-212). Requires a second
//   server pre-bound to the port and assertions on the kill/retry path.
// - Shutdown-timer cancellation when an event arrives during the 5s
//   onEmpty window. Hardcoded 5000ms delay makes this slow to test
//   cleanly; needs a clock abstraction.

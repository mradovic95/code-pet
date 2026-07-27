'use strict';

// Mocks must be wired into require.cache BEFORE window-manager is required.
const syncListeners = new Map();
const invokeHandlers = new Map();

class MockBrowserWindow {
  constructor(options) {
    this.options = options;
    this.loadedFile = null;
    this.destroyed = false;
    this._listeners = {};
    MockBrowserWindow.instances.push(this);
  }
  loadFile(p) { this.loadedFile = p; }
  setAlwaysOnTop() {}
  focus() {}
  isDestroyed() { return this.destroyed; }
  getBounds() { return { x: 0, y: 0, width: 120, height: 100 }; }
  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
  }
  close() {
    this.destroyed = true;
    for (const fn of this._listeners.closed || []) fn();
  }
}
MockBrowserWindow.instances = [];

const mockElectron = {
  BrowserWindow: MockBrowserWindow,
  ipcMain: {
    on: (channel, fn) => syncListeners.set(channel, fn),
    handle: (channel, fn) => invokeHandlers.set(channel, fn),
  },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  shell: { openExternal: () => {} },
};

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} };

// Records what the handler asks the reader for, so the test can assert on the
// exact string used to locate the transcript directory.
const readerCalls = [];
const mockTranscriptReader = {
  readFileEvents: async (projectPath) => {
    readerCalls.push(projectPath);
    return [{ tool: 'Read', filePath: `${projectPath}/CLAUDE.md`, sessionId: 's1', cwd: projectPath, timestamp: null }];
  },
};

function wire(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

wire('electron', mockElectron);
wire('../../../src/app/core/logger', mockLogger);
wire('../../../src/tracking/transcript-reader', mockTranscriptReader);

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const sut = require('../../../src/app/windows/window-manager');

function send(channel, ...args) {
  syncListeners.get(channel)({}, ...args);
}

function invoke(channel, ...args) {
  return invokeHandlers.get(channel)(null, ...args);
}

describe('get-file-activity', () => {
  beforeEach(() => {
    sut.closeSettingsWindow();
    MockBrowserWindow.instances.length = 0;
    readerCalls.length = 0;
  });

  it('reads transcripts for the bare project path, not the session key', async () => {
    // GIVEN settings opened for a session keyed "<projectPath>::<claudePid>"
    send('open-settings', '/Users/dev/my_projects/code-pet::81234');

    // WHEN the Files tab requests file activity
    await invoke('get-file-activity');

    // THEN the reader got the project path — a session key would encode to a
    // transcript directory that does not exist, yielding a silently empty tab
    assert.deepEqual(readerCalls, ['/Users/dev/my_projects/code-pet']);
  });

  it('reports the resolved project alongside the events', async () => {
    // GIVEN settings opened for a session
    send('open-settings', '/Users/dev/my_projects/code-pet::81234');

    // WHEN the Files tab requests file activity
    const result = await invoke('get-file-activity');

    // THEN main reports which project the events belong to — the renderer needs
    // it to shorten absolute paths and has no other source for it
    assert.equal(result.projectPath, '/Users/dev/my_projects/code-pet');
    assert.equal(result.events.length, 1);
  });

  it('resolves the project without the renderer supplying it', async () => {
    // GIVEN settings opened for a session
    send('open-settings', '/Users/dev/my_projects/code-pet::81234');

    // WHEN the renderer passes an unrelated project path
    const result = await invoke('get-file-activity', '/Users/dev/some/other/project');

    // THEN it is ignored — the open settings window decides whose transcripts
    // are read, so the renderer cannot request an arbitrary project
    assert.deepEqual(readerCalls, ['/Users/dev/my_projects/code-pet']);
    assert.equal(result.projectPath, '/Users/dev/my_projects/code-pet');
  });

  it('returns an empty result when settings is opened without a session key', async () => {
    // GIVEN settings opened with no session key
    send('open-settings', null);

    // WHEN the Files tab requests file activity
    const result = await invoke('get-file-activity');

    // THEN no transcripts are read and the shape still holds
    assert.deepEqual(result, { projectPath: '', events: [] });
    assert.deepEqual(readerCalls, []);
  });
});

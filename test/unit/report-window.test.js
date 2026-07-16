'use strict';

// Mocks must be wired into require.cache BEFORE report-window is required.
const registeredHandlers = new Map();

class MockBrowserWindow {
  constructor(options) {
    this.options = options;
    this.loadedFile = null;
    this.focusCalls = 0;
    this.destroyed = false;
    this._listeners = {};
    this.webContents = {
      reloadCalls: 0,
      reload: () => { this.webContents.reloadCalls++; },
    };
    MockBrowserWindow.instances.push(this);
  }
  loadFile(p) { this.loadedFile = p; }
  focus() { this.focusCalls++; }
  isDestroyed() { return this.destroyed; }
  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
  }
  emit(event) {
    for (const fn of this._listeners[event] || []) fn();
  }
  close() {
    this.destroyed = true;
    this.emit('closed');
  }
}
MockBrowserWindow.instances = [];

const mockElectron = {
  BrowserWindow: MockBrowserWindow,
  ipcMain: {
    handle: (channel, fn) => registeredHandlers.set(channel, fn),
  },
  dialog: {
    showSaveDialog: async (_win, options) => {
      mockElectron.dialog._calls.push(options);
      return mockElectron.dialog._result;
    },
    _result: { canceled: true },
    _calls: [],
  },
  nativeTheme: { shouldUseDarkColors: false },
};

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
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
wire('../../src/app/logger', mockLogger);

const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

require('../../src/app/report-window');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-window-test-'));

function invoke(channel, ...args) {
  return registeredHandlers.get(channel)(null, ...args);
}

function liveWindow() {
  return MockBrowserWindow.instances.find((w) => !w.destroyed) || null;
}

describe('report-window', () => {
  beforeEach(() => {
    // Reset module state by closing any window left over from a prior test.
    const win = liveWindow();
    if (win) win.close();
    MockBrowserWindow.instances = [];
    mockElectron.dialog._calls = [];
    mockElectron.dialog._result = { canceled: true };
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null from get-report-html before any report is opened', async () => {
    // GIVEN no report has been opened (fresh state from beforeEach)
    // WHEN the report html is requested
    const html = await invoke('get-report-html');
    // THEN there is nothing to show
    assert.equal(html, null);
  });

  it('creates a report window loading report-preview.html', async () => {
    // GIVEN no report window exists
    // WHEN a report is opened
    const result = await invoke('open-usage-report', { html: '<html>r</html>', md: '# r' });
    // THEN a locked-down window is created showing the preview shell
    assert.deepEqual(result, { opened: true });
    assert.equal(MockBrowserWindow.instances.length, 1);
    const win = MockBrowserWindow.instances[0];
    assert.equal(win.options.webPreferences.contextIsolation, true);
    assert.equal(win.options.webPreferences.nodeIntegration, false);
    assert.ok(win.options.webPreferences.preload.endsWith('report-preload.js'));
    assert.ok(win.loadedFile.endsWith(path.join('renderer', 'report-preview.html')));
  });

  it('rejects invalid report contents without opening a window', async () => {
    // GIVEN a payload missing the markdown variant
    // WHEN the report is opened
    const result = await invoke('open-usage-report', { html: '<html>r</html>' });
    // THEN no window is created and an error is returned
    assert.equal(result.opened, false);
    assert.ok(result.error);
    assert.equal(MockBrowserWindow.instances.length, 0);
  });

  it('reuses an existing window on a second open', async () => {
    // GIVEN an open report window
    await invoke('open-usage-report', { html: '<html>1</html>', md: '# 1' });
    const win = MockBrowserWindow.instances[0];
    // WHEN a report is opened again
    const result = await invoke('open-usage-report', { html: '<html>2</html>', md: '# 2' });
    // THEN the same window is reloaded and focused instead of creating a second one
    assert.deepEqual(result, { opened: true });
    assert.equal(MockBrowserWindow.instances.length, 1);
    assert.equal(win.webContents.reloadCalls, 1);
    assert.equal(win.focusCalls, 1);
  });

  it('returns the latest stored html after consecutive opens', async () => {
    // GIVEN two consecutive opens with different contents
    await invoke('open-usage-report', { html: '<html>1</html>', md: '# 1' });
    await invoke('open-usage-report', { html: '<html>2</html>', md: '# 2' });
    // WHEN the report html is requested
    const html = await invoke('get-report-html');
    // THEN the most recent report is returned
    assert.equal(html, '<html>2</html>');
  });

  it('writes the pristine markdown variant for format "md"', async () => {
    // GIVEN an open report and a save dialog that accepts a target path
    await invoke('open-usage-report', { html: '<html>r</html>', md: '# pristine md' });
    const target = path.join(tmpDir, 'report.md');
    mockElectron.dialog._result = { canceled: false, filePath: target };
    // WHEN saving as markdown
    const result = await invoke('save-report', 'md');
    // THEN the dialog offered a markdown default and exactly the stored md string is written
    assert.deepEqual(result, { saved: true, path: target });
    assert.equal(mockElectron.dialog._calls.length, 1);
    assert.ok(mockElectron.dialog._calls[0].defaultPath.endsWith('code-pet-skill-report.md'));
    assert.deepEqual(mockElectron.dialog._calls[0].filters, [{ name: 'Markdown report', extensions: ['md'] }]);
    assert.equal(fs.readFileSync(target, 'utf8'), '# pristine md');
  });

  it('writes the pristine html variant for format "html"', async () => {
    // GIVEN an open report and a save dialog that accepts a target path
    await invoke('open-usage-report', { html: '<html>pristine</html>', md: '# r' });
    const target = path.join(tmpDir, 'report.html');
    mockElectron.dialog._result = { canceled: false, filePath: target };
    // WHEN saving as html
    const result = await invoke('save-report', 'html');
    // THEN the dialog offered an html default and exactly the stored html string is written
    assert.deepEqual(result, { saved: true, path: target });
    assert.ok(mockElectron.dialog._calls[0].defaultPath.endsWith('code-pet-skill-report.html'));
    assert.deepEqual(mockElectron.dialog._calls[0].filters, [{ name: 'HTML report', extensions: ['html'] }]);
    assert.equal(fs.readFileSync(target, 'utf8'), '<html>pristine</html>');
  });

  it('returns canceled when the save dialog is dismissed', async () => {
    // GIVEN an open report and a dialog the user cancels
    await invoke('open-usage-report', { html: '<html>r</html>', md: '# r' });
    mockElectron.dialog._result = { canceled: true };
    // WHEN saving
    const result = await invoke('save-report', 'html');
    // THEN nothing is written and the cancellation is reported
    assert.deepEqual(result, { saved: false, canceled: true });
  });

  it('rejects an unknown format without showing a dialog', async () => {
    // GIVEN an open report
    await invoke('open-usage-report', { html: '<html>r</html>', md: '# r' });
    // WHEN saving with an unsupported format
    const result = await invoke('save-report', 'pdf');
    // THEN no dialog is shown and an error is returned
    assert.equal(result.saved, false);
    assert.ok(result.error);
    assert.equal(mockElectron.dialog._calls.length, 0);
  });

  it('clears stored contents when the report window closes', async () => {
    // GIVEN an open report window
    await invoke('open-usage-report', { html: '<html>r</html>', md: '# r' });
    // WHEN the window is closed
    MockBrowserWindow.instances[0].close();
    // THEN the stored report is gone and the next open constructs a fresh window
    assert.equal(await invoke('get-report-html'), null);
    await invoke('open-usage-report', { html: '<html>new</html>', md: '# new' });
    assert.equal(MockBrowserWindow.instances.length, 2);
    assert.equal(await invoke('get-report-html'), '<html>new</html>');
  });
});

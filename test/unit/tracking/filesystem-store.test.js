'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FilesystemStore = require('../../../src/tracking/stores/filesystem-store');
const UsageEvent = require('../../../src/tracking/usage-event');

let tmpFile;
let sut;

function freshPath() {
  return path.join(os.tmpdir(), `code-pet-fs-store-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
}

describe('FilesystemStore', () => {
  beforeEach(() => {
    tmpFile = freshPath();
    sut = new FilesystemStore({ path: tmpFile });
  });

  afterEach(async () => {
    if (sut) await sut.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('appends a single event as one NDJSON line', async () => {
    // GIVEN
    const event = new UsageEvent('skill', 'commit', 'session-1', '/home/user/proj');

    // WHEN
    await sut.append(event);
    await sut.flush();

    // THEN
    const data = fs.readFileSync(tmpFile, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.type, 'skill');
    assert.equal(parsed.name, 'commit');
    assert.equal(parsed.sessionId, 'session-1');
    assert.equal(parsed.projectPath, '/home/user/proj');
  });

  it('appends plain object events (no toJSON)', async () => {
    // GIVEN
    const plain = { type: 'mcp_tool', name: 'mcp__db__query', timestamp: 123, sessionId: 's' };

    // WHEN
    await sut.append(plain);
    await sut.flush();

    // THEN
    const data = fs.readFileSync(tmpFile, 'utf8');
    assert.deepEqual(JSON.parse(data.trim()), plain);
  });

  it('readAll returns parsed events from disk', async () => {
    // GIVEN
    await sut.append(new UsageEvent('skill', 'a', 's'));
    await sut.append(new UsageEvent('skill', 'b', 's'));
    await sut.flush();

    // WHEN
    const events = await sut.readAll();

    // THEN
    assert.equal(events.length, 2);
    assert.equal(events[0].name, 'a');
    assert.equal(events[1].name, 'b');
  });

  it('readAll preserves all UsageEvent fields (contract for settings UI)', async () => {
    // GIVEN — an event with every field populated
    const event = new UsageEvent('mcp_tool', 'mcp__db__query', 'abc-123', '/home/user/proj');
    await sut.append(event);
    await sut.flush();

    // WHEN
    const [read] = await sut.readAll();

    // THEN — all 5 fields survive the NDJSON round-trip
    assert.equal(read.type, 'mcp_tool');
    assert.equal(read.name, 'mcp__db__query');
    assert.equal(read.sessionId, 'abc-123');
    assert.equal(read.projectPath, '/home/user/proj');
    assert.equal(typeof read.timestamp, 'number');
  });

  it('readAll filters by type', async () => {
    // GIVEN
    await sut.append(new UsageEvent('skill', 'a', 's'));
    await sut.append(new UsageEvent('mcp_tool', 'b', 's'));
    await sut.append(new UsageEvent('skill', 'c', 's'));
    await sut.flush();

    // WHEN
    const events = await sut.readAll({ type: 'skill' });

    // THEN
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.name), ['a', 'c']);
  });

  it('readAll filters by since timestamp', async () => {
    // GIVEN
    await sut.append({ type: 'skill', name: 'old', timestamp: 1000, sessionId: 's' });
    await sut.append({ type: 'skill', name: 'mid', timestamp: 2000, sessionId: 's' });
    await sut.append({ type: 'skill', name: 'new', timestamp: 3000, sessionId: 's' });
    await sut.flush();

    // WHEN
    const events = await sut.readAll({ since: 2000 });

    // THEN
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.name), ['mid', 'new']);
  });

  it('readAll respects limit (returns most recent)', async () => {
    // GIVEN
    for (let i = 0; i < 10; i++) {
      await sut.append({ type: 'skill', name: `e${i}`, timestamp: i, sessionId: 's' });
    }
    await sut.flush();

    // WHEN
    const events = await sut.readAll({ limit: 3 });

    // THEN
    assert.equal(events.length, 3);
    assert.deepEqual(events.map((e) => e.name), ['e7', 'e8', 'e9']);
  });

  it('readAll returns empty array when file does not exist', async () => {
    // GIVEN
    const ghostStore = new FilesystemStore({ path: freshPath() });

    // WHEN
    const events = await ghostStore.readAll();

    // THEN
    assert.deepEqual(events, []);
  });

  it('readAll skips malformed lines without throwing', async () => {
    // GIVEN
    fs.writeFileSync(tmpFile, '{"type":"skill","name":"good","timestamp":1,"sessionId":"s"}\n{not json\n{"type":"skill","name":"good2","timestamp":2,"sessionId":"s"}\n');

    // WHEN
    const events = await sut.readAll();

    // THEN
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.name), ['good', 'good2']);
  });

  it('serializes concurrent appends without torn lines', async () => {
    // GIVEN
    const N = 500;

    // WHEN — fire all without awaiting individually
    for (let i = 0; i < N; i++) {
      sut.append(new UsageEvent('skill', `tool_${i}`, 'concurrent-session'));
    }
    await sut.flush();

    // THEN — every line must be parseable JSON, count must match
    const data = fs.readFileSync(tmpFile, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    assert.equal(lines.length, N);
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `torn line: ${line}`);
    }
  });

  it('flush waits for pending writes to land on disk', async () => {
    // GIVEN
    sut.append(new UsageEvent('skill', 'a', 's'));
    sut.append(new UsageEvent('skill', 'b', 's'));

    // WHEN
    await sut.flush();

    // THEN
    const data = fs.readFileSync(tmpFile, 'utf8');
    assert.equal(data.split('\n').filter(Boolean).length, 2);
  });

  it('creates parent directory if missing', () => {
    // GIVEN
    const nested = path.join(os.tmpdir(), `code-pet-nested-${Date.now()}`, 'sub', 'usage.log');

    // WHEN
    const store = new FilesystemStore({ path: nested });

    // THEN
    assert.ok(fs.existsSync(path.dirname(nested)));

    // CLEANUP
    fs.rmSync(path.dirname(path.dirname(nested)), { recursive: true, force: true });
    return store.close();
  });
});

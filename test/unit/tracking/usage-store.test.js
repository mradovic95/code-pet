'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const { UsageStore, createStore } = require('../../../src/tracking/usage-store');
const MemoryStore = require('../../../src/tracking/stores/memory-store');
const FilesystemStore = require('../../../src/tracking/stores/filesystem-store');

function tmpPath(name) {
  return path.join(os.tmpdir(), `code-pet-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
}

describe('createStore factory', () => {
  it('returns a MemoryStore for type=memory', () => {
    // GIVEN / WHEN
    const sut = createStore({ type: 'memory' });

    // THEN
    assert.ok(sut instanceof MemoryStore);
    assert.ok(sut instanceof UsageStore);
  });

  it('defaults to memory when no type is given', () => {
    // GIVEN / WHEN
    const sut = createStore();

    // THEN
    assert.ok(sut instanceof MemoryStore);
  });

  it('returns a FilesystemStore for type=filesystem', async () => {
    // GIVEN
    const file = tmpPath('factory');

    // WHEN
    const sut = createStore({ type: 'filesystem', path: file });

    // THEN
    assert.ok(sut instanceof FilesystemStore);
    assert.ok(sut instanceof UsageStore);

    // CLEANUP
    await sut.close();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  it('throws on unknown store type', () => {
    // GIVEN / WHEN / THEN
    assert.throws(() => createStore({ type: 'sqlite' }), /Unknown UsageStore type/);
  });
});

describe('UsageStore base class', () => {
  it('has no-op default methods', async () => {
    // GIVEN
    const sut = new UsageStore();

    // WHEN / THEN
    await assert.doesNotReject(() => sut.append({ type: 'x', name: 'y' }));
    assert.deepEqual(await sut.readAll(), []);
    await assert.doesNotReject(() => sut.flush());
    await assert.doesNotReject(() => sut.close());
  });
});

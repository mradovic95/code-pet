'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MemoryStore = require('../../../src/tracking/stores/memory-store');
const { UsageStore } = require('../../../src/tracking/usage-store');

describe('MemoryStore', () => {
  it('is a UsageStore', () => {
    // GIVEN / WHEN
    const sut = new MemoryStore();

    // THEN
    assert.ok(sut instanceof UsageStore);
  });

  it('append resolves without throwing', async () => {
    // GIVEN
    const sut = new MemoryStore();

    // WHEN / THEN
    await assert.doesNotReject(() => sut.append({ type: 'skill', name: 'x' }));
  });

  it('readAll always returns an empty array', async () => {
    // GIVEN
    const sut = new MemoryStore();
    await sut.append({ type: 'skill', name: 'x' });

    // WHEN
    const events = await sut.readAll();

    // THEN
    assert.deepEqual(events, []);
  });

  it('flush and close are no-op promises', async () => {
    // GIVEN
    const sut = new MemoryStore();

    // WHEN / THEN
    await assert.doesNotReject(() => sut.flush());
    await assert.doesNotReject(() => sut.close());
  });
});

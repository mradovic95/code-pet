'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const UsageTracker = require('../../../src/tracking/usage-tracker');

describe('UsageTracker', () => {
  let sut;

  beforeEach(() => {
    sut = new UsageTracker({ sessionId: 'test-session' });
  });

  it('starts with zero events', () => {
    // GIVEN
    // (fresh instance)

    // WHEN
    const size = sut.size;

    // THEN
    assert.equal(size, 0);
  });

  it('records an event and increments size', () => {
    // GIVEN
    // sut is empty

    // WHEN
    const event = sut.record('mcp_tool', 'mcp__db__query');

    // THEN
    assert.equal(sut.size, 1);
    assert.equal(event.type, 'mcp_tool');
    assert.equal(event.name, 'mcp__db__query');
  });

  it('returns aggregated counts by type', () => {
    // GIVEN
    sut.record('mcp_tool', 'mcp__db__query');
    sut.record('mcp_tool', 'mcp__db__query');
    sut.record('mcp_tool', 'mcp__slack__send');
    sut.record('skill', 'commit');

    // WHEN
    const counts = sut.getAggregatedCounts('mcp_tool');

    // THEN
    assert.equal(counts['mcp__db__query'], 2);
    assert.equal(counts['mcp__slack__send'], 1);
    assert.equal(counts['commit'], undefined);
  });

  it('returns usage snapshot with mcp and skills', () => {
    // GIVEN
    sut.record('mcp_tool', 'mcp__db__query');
    sut.record('skill', 'commit');
    sut.record('skill', 'commit');

    // WHEN
    const snap = sut.getUsageSnapshot();

    // THEN
    assert.equal(snap.mcp['mcp__db__query'], 1);
    assert.equal(snap.skills['commit'], 2);
  });

  it('evicts oldest events when maxEvents exceeded', () => {
    // GIVEN
    const smallSut = new UsageTracker({ maxEvents: 10, sessionId: 'test' });
    for (let i = 0; i < 12; i++) {
      smallSut.record('mcp_tool', `tool_${i}`);
    }

    // WHEN
    const size = smallSut.size;

    // THEN — should have evicted 25% of 10 = 2, then added 2 more = 10
    assert.ok(size <= 10, `expected <= 10, got ${size}`);
  });

  it('drains events and clears internal state', () => {
    // GIVEN
    sut.record('mcp_tool', 'tool_a');
    sut.record('skill', 'commit');

    // WHEN
    const drained = sut.drain();

    // THEN
    assert.equal(drained.sessionId, 'test-session');
    assert.equal(drained.events.length, 2);
    assert.equal(sut.size, 0);
  });

  it('filters events by type', () => {
    // GIVEN
    sut.record('mcp_tool', 'tool_a');
    sut.record('skill', 'commit');
    sut.record('mcp_tool', 'tool_b');

    // WHEN
    const filtered = sut.getEvents({ type: 'skill' });

    // THEN
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, 'commit');
  });

  it('filters events by name', () => {
    // GIVEN
    sut.record('mcp_tool', 'tool_a');
    sut.record('mcp_tool', 'tool_b');
    sut.record('mcp_tool', 'tool_a');

    // WHEN
    const filtered = sut.getEvents({ name: 'tool_a' });

    // THEN
    assert.equal(filtered.length, 2);
  });

  it('returns all events when no filter provided', () => {
    // GIVEN
    sut.record('mcp_tool', 'tool_a');
    sut.record('skill', 'commit');

    // WHEN
    const all = sut.getEvents();

    // THEN
    assert.equal(all.length, 2);
  });

  it('generates sessionId when not provided', () => {
    // GIVEN / WHEN
    const tracker = new UsageTracker();

    // THEN
    assert.ok(tracker.sessionId);
    assert.ok(tracker.sessionId.length > 0);
  });

  it('forwards each recorded event to the injected store', () => {
    // GIVEN
    const seen = [];
    const fakeStore = { append: (e) => { seen.push(e); } };
    const tracker = new UsageTracker({ sessionId: 'ts', store: fakeStore });

    // WHEN
    tracker.record('skill', 'commit');
    tracker.record('mcp_tool', 'mcp__db__query');

    // THEN
    assert.equal(seen.length, 2);
    assert.equal(seen[0].name, 'commit');
    assert.equal(seen[1].name, 'mcp__db__query');
    assert.equal(seen[0].sessionId, 'ts');
  });

  it('uses a no-op MemoryStore when no store is provided', () => {
    // GIVEN
    const tracker = new UsageTracker({ sessionId: 'ts' });

    // WHEN — should not throw and should not require an explicit store
    tracker.record('skill', 'commit');

    // THEN
    assert.equal(tracker.size, 1);
    assert.ok(tracker.store, 'tracker should always have a store');
  });
});

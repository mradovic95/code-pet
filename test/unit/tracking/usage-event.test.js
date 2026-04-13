'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const UsageEvent = require('../../../src/tracking/usage-event');

describe('UsageEvent', () => {
  it('stores type, name, and sessionId', () => {
    // GIVEN
    const type = 'mcp_tool';
    const name = 'mcp__db__query';
    const sessionId = 'sess-123';

    // WHEN
    const sut = new UsageEvent(type, name, sessionId);

    // THEN
    assert.equal(sut.type, type);
    assert.equal(sut.name, name);
    assert.equal(sut.sessionId, sessionId);
    assert.ok(sut.timestamp > 0);
  });

  it('is frozen after construction', () => {
    // GIVEN
    const sut = new UsageEvent('skill', 'commit', 'sess-1');

    // WHEN / THEN
    assert.throws(() => { sut.type = 'changed'; }, TypeError);
  });

  it('returns correct shape from toJSON', () => {
    // GIVEN
    const sut = new UsageEvent('mcp_tool', 'mcp__slack__send', 'sess-1');

    // WHEN
    const json = sut.toJSON();

    // THEN
    assert.deepEqual(Object.keys(json).sort(), ['name', 'sessionId', 'timestamp', 'type']);
    assert.equal(json.type, 'mcp_tool');
    assert.equal(json.name, 'mcp__slack__send');
    assert.equal(json.sessionId, 'sess-1');
    assert.equal(json.timestamp, sut.timestamp);
  });
});

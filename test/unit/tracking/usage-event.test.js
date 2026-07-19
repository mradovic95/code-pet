'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const UsageEvent = require('../../../src/tracking/usage-event');

describe('UsageEvent', () => {
  it('stores type, name, sessionId, and projectPath', () => {
    // GIVEN
    const type = 'mcp_tool';
    const name = 'mcp__db__query';
    const sessionId = 'sess-123';
    const projectPath = '/home/user/proj';

    // WHEN
    const sut = new UsageEvent(type, name, sessionId, projectPath);

    // THEN
    assert.equal(sut.type, type);
    assert.equal(sut.name, name);
    assert.equal(sut.sessionId, sessionId);
    assert.equal(sut.projectPath, projectPath);
    assert.ok(sut.timestamp > 0);
  });

  it('defaults projectPath to null when omitted', () => {
    // GIVEN / WHEN
    const sut = new UsageEvent('skill', 'commit', 'sess-1');

    // THEN
    assert.equal(sut.projectPath, null);
  });

  it('is frozen after construction', () => {
    // GIVEN
    const sut = new UsageEvent('skill', 'commit', 'sess-1', '/p');

    // WHEN / THEN
    assert.throws(() => { sut.type = 'changed'; }, TypeError);
  });

  it('stores durationMs and agentId when provided via extra', () => {
    // GIVEN
    const extra = { durationMs: 1234, agentId: 'agent-1' };

    // WHEN
    const sut = new UsageEvent('skill', 'commit', 'sess-1', '/p', extra);

    // THEN
    assert.equal(sut.durationMs, 1234);
    assert.equal(sut.agentId, 'agent-1');
    const json = sut.toJSON();
    assert.equal(json.durationMs, 1234);
    assert.equal(json.agentId, 'agent-1');
  });

  it('omits extra fields from toJSON when not provided', () => {
    // GIVEN / WHEN
    const sut = new UsageEvent('skill', 'commit', 'sess-1', '/p');

    // THEN
    const json = sut.toJSON();
    assert.ok(!('durationMs' in json));
    assert.ok(!('agentId' in json));
  });

  it('ignores non-finite durationMs and empty agentId', () => {
    // GIVEN
    const extra = { durationMs: NaN, agentId: '' };

    // WHEN
    const sut = new UsageEvent('skill', 'commit', 'sess-1', '/p', extra);

    // THEN
    assert.equal(sut.durationMs, undefined);
    assert.equal(sut.agentId, undefined);
  });

  it('is frozen with extra fields present', () => {
    // GIVEN
    const sut = new UsageEvent('skill', 'commit', 'sess-1', '/p', { durationMs: 10 });

    // WHEN / THEN
    assert.throws(() => { sut.durationMs = 99; }, TypeError);
  });

  it('returns correct shape from toJSON', () => {
    // GIVEN
    const sut = new UsageEvent('mcp_tool', 'mcp__slack__send', 'sess-1', '/home/user/proj');

    // WHEN
    const json = sut.toJSON();

    // THEN
    assert.deepEqual(Object.keys(json).sort(), ['name', 'projectPath', 'sessionId', 'timestamp', 'type']);
    assert.equal(json.type, 'mcp_tool');
    assert.equal(json.name, 'mcp__slack__send');
    assert.equal(json.sessionId, 'sess-1');
    assert.equal(json.projectPath, '/home/user/proj');
    assert.equal(json.timestamp, sut.timestamp);
  });
});

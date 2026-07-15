'use strict';

const { setupMocks } = require('../../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const PetContext = require('../../../src/app/state-machine/pet-context');

describe('PetContext', () => {
  let sut;

  beforeEach(() => {
    sut = new PetContext('my-project', 'dog');
  });

  it('starts in idle state', () => {
    // GIVEN
    // (fresh instance from beforeEach)

    // WHEN
    const snap = sut.getSnapshot();

    // THEN
    assert.equal(sut.state.name, 'idle');
    assert.equal(snap.projectName, 'my-project');
    assert.equal(snap.petType, 'dog');
  });

  it('transitions to working when working_started received', () => {
    // GIVEN
    // sut is in idle state

    // WHEN
    const result = sut.handleEvent('working_started');

    // THEN
    assert.equal(result.statusCode, 200);
    assert.equal(sut.state.name, 'working');
    assert.equal(sut.lastActiveEvent, 'working_started');
  });

  it('transitions to planning when planning_started received', () => {
    // GIVEN
    // sut is in idle state

    // WHEN
    const result = sut.handleEvent('planning_started');

    // THEN
    assert.equal(result.statusCode, 200);
    assert.equal(sut.state.name, 'planning');
    assert.equal(sut.lastActiveEvent, 'planning_started');
  });

  it('transitions to waiting_for_action when action_requested received', () => {
    // GIVEN
    // sut is in idle state

    // WHEN
    const result = sut.handleEvent('action_requested');

    // THEN
    assert.equal(result.statusCode, 200);
    assert.equal(sut.state.name, 'waiting_for_action');
  });

  it('returns 400 when event is invalid', () => {
    // GIVEN
    // sut is in idle state

    // WHEN
    const result = sut.handleEvent('invalid_event');

    // THEN
    assert.equal(result.statusCode, 400);
    assert.ok(result.response.error);
    assert.ok(Array.isArray(result.response.valid));
  });

  it('completes full lifecycle: idle -> working -> waiting -> working -> idle', () => {
    // GIVEN
    // sut is in idle state

    // WHEN / THEN — walk through lifecycle
    sut.handleEvent('working_started');
    assert.equal(sut.state.name, 'working');

    sut.handleEvent('action_requested');
    assert.equal(sut.state.name, 'waiting_for_action');

    sut.handleEvent('action_completed');
    assert.equal(sut.state.name, 'working');

    sut.handleEvent('work_finished');
    assert.equal(sut.state.name, 'idle');
  });

  it('updates process info when updateProcessInfo called', () => {
    // GIVEN
    // sut has no process info

    // WHEN
    sut.updateProcessInfo(12345, '/dev/ttys001');

    // THEN
    assert.equal(sut.claudePid, 12345);
    assert.equal(sut.tty, '/dev/ttys001');
  });

  it('records mcp tool usage', () => {
    // GIVEN
    // sut has empty tracker

    // WHEN
    sut.recordToolUsage('mcp__database__query', {});

    // THEN
    const snap = sut.getUsageSnapshot();
    assert.equal(snap.mcp['mcp__database__query'], 1);
  });

  it('records skill usage', () => {
    // GIVEN
    // sut has empty tracker

    // WHEN
    sut.recordToolUsage('Skill', { skill: 'commit' });

    // THEN
    const snap = sut.getUsageSnapshot();
    assert.equal(snap.skills['commit'], 1);
  });

  it('forwards tool usage to the injected store', () => {
    // GIVEN
    const seen = [];
    const fakeStore = { append: (e) => { seen.push(e); } };
    const ctx = new PetContext('proj', 'dog', { store: fakeStore });

    // WHEN
    ctx.recordToolUsage('Skill', { skill: 'commit' });
    ctx.recordToolUsage('mcp__db__query', {});

    // THEN
    assert.equal(seen.length, 2);
    assert.equal(seen[0].type, 'skill');
    assert.equal(seen[0].name, 'commit');
    assert.equal(seen[1].type, 'mcp_tool');
    assert.equal(seen[1].name, 'mcp__db__query');
  });

  it('stamps projectPath on recorded events', () => {
    // GIVEN
    const seen = [];
    const fakeStore = { append: (e) => { seen.push(e); } };
    const ctx = new PetContext('proj', 'dog', { store: fakeStore, projectPath: '/home/user/proj' });

    // WHEN
    ctx.recordToolUsage('Skill', { skill: 'commit' });

    // THEN
    assert.equal(seen.length, 1);
    assert.equal(seen[0].projectPath, '/home/user/proj');
    assert.equal(ctx.getUsageEvents()[0].projectPath, '/home/user/proj');
  });

  it('returns snapshot with expected shape', () => {
    // GIVEN
    sut.handleEvent('working_started');

    // WHEN
    const snap = sut.getSnapshot();

    // THEN
    assert.equal(snap.lastEventName, 'working_started');
    assert.equal(snap.lastActiveEvent, 'working_started');
    assert.equal(snap.projectName, 'my-project');
    assert.equal(snap.petType, 'dog');
    assert.ok(snap.lastEventTime > 0);
    assert.ok(snap.createdAt > 0);
    assert.ok(snap.usage);
  });

  it('forwards extra fields from recordToolUsage to the tracker', () => {
    // GIVEN
    // sut is a fresh context

    // WHEN
    sut.recordToolUsage('Skill', { skill: 'commit' }, { durationMs: 750, agentId: 'agent-1' });

    // THEN
    const events = sut.getUsageEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].durationMs, 750);
    assert.equal(events[0].agentId, 'agent-1');
  });

  it('pairs a tool start with its completion into a duration', () => {
    // GIVEN
    sut.noteToolStart('toolu_123', 'Skill');

    // WHEN
    const durationMs = sut.resolveToolDuration('toolu_123', 'Skill');

    // THEN
    assert.equal(typeof durationMs, 'number');
    assert.ok(durationMs >= 0);
  });

  it('pairs by tool name when no toolUseId is available', () => {
    // GIVEN — PreToolUse payloads carry no tool_use_id (not in official docs)
    sut.noteToolStart(undefined, 'Skill');

    // WHEN
    const durationMs = sut.resolveToolDuration(undefined, 'Skill');

    // THEN
    assert.equal(typeof durationMs, 'number');
  });

  it('returns undefined when no matching start exists', () => {
    // GIVEN
    // no noteToolStart

    // WHEN
    const durationMs = sut.resolveToolDuration('toolu_missing', 'Read');

    // THEN
    assert.equal(durationMs, undefined);
  });

  it('resolves a start only once', () => {
    // GIVEN
    sut.noteToolStart('toolu_1', 'Skill');
    sut.resolveToolDuration('toolu_1', 'Skill');

    // WHEN
    const second = sut.resolveToolDuration('toolu_1', 'Skill');

    // THEN
    assert.equal(second, undefined);
  });

  it('evicts the oldest pending start when the cap is reached', () => {
    // GIVEN — fill past the cap of 50
    for (let i = 0; i < 55; i++) {
      sut.noteToolStart(`toolu_${i}`, 'Skill');
    }

    // WHEN
    const evicted = sut.resolveToolDuration('toolu_0', undefined);
    const kept = sut.resolveToolDuration('toolu_54', undefined);

    // THEN
    assert.equal(evicted, undefined);
    assert.equal(typeof kept, 'number');
  });

  function requireFreshPetContext() {
    const resolved = require.resolve('../../../src/app/state-machine/pet-context');
    delete require.cache[resolved];
    const FreshPetContext = require('../../../src/app/state-machine/pet-context');
    delete require.cache[resolved]; // keep the shared cached copy for other tests
    return FreshPetContext;
  }

  it('honors CODE_PET_MAX_PENDING_TOOL_STARTS env override', () => {
    // GIVEN
    process.env.CODE_PET_MAX_PENDING_TOOL_STARTS = '2';
    try {
      const FreshPetContext = requireFreshPetContext();
      const ctx = new FreshPetContext('proj', 'dog');

      // WHEN — third insert must evict the first under a cap of 2
      ctx.noteToolStart('toolu_a', 'Skill');
      ctx.noteToolStart('toolu_b', 'Skill');
      ctx.noteToolStart('toolu_c', 'Skill');

      // THEN
      assert.equal(ctx.resolveToolDuration('toolu_a', undefined), undefined);
      assert.equal(typeof ctx.resolveToolDuration('toolu_c', undefined), 'number');
    } finally {
      delete process.env.CODE_PET_MAX_PENDING_TOOL_STARTS;
    }
  });

  it('falls back to the default cap when the env override is not a positive integer', () => {
    // GIVEN
    process.env.CODE_PET_MAX_PENDING_TOOL_STARTS = 'notanumber';
    try {
      const FreshPetContext = requireFreshPetContext();
      const ctx = new FreshPetContext('proj', 'dog');

      // WHEN — 3 inserts stay well under the default cap of 50
      ctx.noteToolStart('toolu_a', 'Skill');
      ctx.noteToolStart('toolu_b', 'Skill');
      ctx.noteToolStart('toolu_c', 'Skill');

      // THEN — nothing was evicted
      assert.equal(typeof ctx.resolveToolDuration('toolu_a', undefined), 'number');
    } finally {
      delete process.env.CODE_PET_MAX_PENDING_TOOL_STARTS;
    }
  });
});

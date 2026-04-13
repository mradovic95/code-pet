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
});

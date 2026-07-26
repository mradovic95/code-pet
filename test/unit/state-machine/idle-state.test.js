'use strict';

const { setupMocks } = require('../../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createMockContext } = require('../../helpers/mock-context');

const IdleState = require('../../../src/app/pet/state-machine/idle-state');

describe('IdleState', () => {
  let sut;
  let ctx;

  beforeEach(() => {
    ctx = createMockContext();
    sut = new IdleState(ctx);
  });

  it('returns waking_up rendererState when awaken received', () => {
    // GIVEN
    // sut is an IdleState

    // WHEN
    const result = sut.handleEvent('awaken');

    // THEN
    assert.equal(result.rendererState, 'waking_up');
    assert.equal(result.response.state, 'waking_up');
    // Does NOT change server state
    assert.equal(ctx._lastChangedTo, null);
  });

  it('sets lastEventName when awaken received', () => {
    // GIVEN
    // ctx.lastEventName is null

    // WHEN
    sut.handleEvent('awaken');

    // THEN
    assert.equal(ctx.lastEventName, 'awaken');
  });

  it('transitions to working when working_started received', () => {
    // GIVEN
    // sut is an IdleState

    // WHEN
    const result = sut.handleEvent('working_started');

    // THEN
    assert.equal(result.rendererState, 'working');
    assert.equal(ctx._lastChangedTo, 'working');
    assert.equal(ctx.lastActiveEvent, 'working_started');
  });

  it('transitions to planning when planning_started received', () => {
    // GIVEN
    // sut is an IdleState

    // WHEN
    const result = sut.handleEvent('planning_started');

    // THEN
    assert.equal(result.rendererState, 'planning');
    assert.equal(ctx._lastChangedTo, 'planning');
    assert.equal(ctx.lastActiveEvent, 'planning_started');
  });

  it('transitions to waiting_for_action when action_requested received', () => {
    // GIVEN
    // sut is an IdleState

    // WHEN
    const result = sut.handleEvent('action_requested');

    // THEN
    assert.equal(result.rendererState, 'waiting_for_action');
    assert.equal(ctx._lastChangedTo, 'waiting_for_action');
  });

  it('removes project when falling_asleep received', () => {
    // GIVEN
    // sut is an IdleState

    // WHEN
    const result = sut.handleEvent('falling_asleep');

    // THEN
    assert.equal(result.action, 'remove_project');
    assert.equal(result.response.removed, true);
  });

  it('removes project when dismiss received', () => {
    // GIVEN
    // sut is an IdleState

    // WHEN
    const result = sut.handleEvent('dismiss');

    // THEN
    assert.equal(result.action, 'remove_project');
    assert.equal(result.response.removed, true);
  });

  it('ignores work_finished', () => {
    // GIVEN
    // sut is an IdleState

    // WHEN
    const result = sut.handleEvent('work_finished');

    // THEN
    assert.equal(result.response.ignored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('ignores action_completed without subagent tag', () => {
    // GIVEN
    // ctx.lastAgentId is null (main-agent tool event, e.g. racing in after Stop)

    // WHEN
    const result = sut.handleEvent('action_completed');

    // THEN
    assert.equal(result.response.ignored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('transitions to working when action_completed received from a background subagent', () => {
    // GIVEN
    ctx.lastAgentId = 'agent-123';

    // WHEN
    const result = sut.handleEvent('action_completed');

    // THEN
    assert.equal(result.rendererState, 'working');
    assert.equal(ctx._lastChangedTo, 'working');
    assert.equal(ctx.lastActiveEvent, 'working_started');
  });

  it('transitions to planning when action_completed received from a background subagent in plan mode', () => {
    // GIVEN
    ctx.lastAgentId = 'agent-123';
    ctx.permissionMode = 'plan';

    // WHEN
    const result = sut.handleEvent('action_completed');

    // THEN
    assert.equal(result.rendererState, 'planning');
    assert.equal(ctx._lastChangedTo, 'planning');
    assert.equal(ctx.lastActiveEvent, 'planning_started');
  });
});

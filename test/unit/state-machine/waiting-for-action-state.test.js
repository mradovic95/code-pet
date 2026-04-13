'use strict';

const { setupMocks } = require('../../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createMockContext } = require('../../helpers/mock-context');

const WaitingForActionState = require('../../../src/app/state-machine/waiting-for-action-state');

describe('WaitingForActionState', () => {
  let sut;
  let ctx;

  beforeEach(() => {
    ctx = createMockContext({ lastActiveEvent: 'working_started' });
    sut = new WaitingForActionState(ctx);
  });

  it('restores to working when action_completed with lastActiveEvent set', () => {
    // GIVEN
    ctx.permissionMode = null;
    ctx.lastActiveEvent = 'working_started';

    // WHEN
    const result = sut.handleEvent('action_completed');

    // THEN
    assert.equal(ctx._lastChangedTo, 'working');
    assert.equal(result.rendererState, 'working');
    assert.equal(result.response.restored, true);
  });

  it('transitions to planning when action_completed with permissionMode=plan', () => {
    // GIVEN
    ctx.permissionMode = 'plan';

    // WHEN
    const result = sut.handleEvent('action_completed');

    // THEN
    assert.equal(ctx._lastChangedTo, 'planning');
    assert.equal(result.rendererState, 'planning');
    assert.equal(ctx.lastActiveEvent, 'planning_started');
  });

  it('transitions to working when action_completed with non-plan permissionMode', () => {
    // GIVEN
    ctx.permissionMode = 'auto-edit';

    // WHEN
    const result = sut.handleEvent('action_completed');

    // THEN
    assert.equal(ctx._lastChangedTo, 'working');
    assert.equal(result.rendererState, 'working');
    assert.equal(ctx.lastActiveEvent, 'working_started');
  });

  it('ignores action_completed when no permissionMode and no lastActiveEvent', () => {
    // GIVEN
    ctx.permissionMode = null;
    ctx.lastActiveEvent = null;

    // WHEN
    const result = sut.handleEvent('action_completed');

    // THEN
    assert.equal(result.response.ignored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('transitions to working when working_started received', () => {
    // GIVEN
    // sut is in waiting_for_action

    // WHEN
    const result = sut.handleEvent('working_started');

    // THEN
    assert.equal(ctx._lastChangedTo, 'working');
    assert.equal(ctx.lastActiveEvent, 'working_started');
  });

  it('transitions to planning when planning_started received', () => {
    // GIVEN
    // sut is in waiting_for_action

    // WHEN
    const result = sut.handleEvent('planning_started');

    // THEN
    assert.equal(ctx._lastChangedTo, 'planning');
    assert.equal(ctx.lastActiveEvent, 'planning_started');
  });

  it('ignores falling_asleep', () => {
    // GIVEN
    // sut is in waiting_for_action

    // WHEN
    const result = sut.handleEvent('falling_asleep');

    // THEN
    assert.equal(result.response.ignored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('ignores awaken', () => {
    // GIVEN
    // sut is in waiting_for_action

    // WHEN
    const result = sut.handleEvent('awaken');

    // THEN
    assert.equal(result.response.ignored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('removes project when dismiss received', () => {
    // GIVEN
    // sut is in waiting_for_action

    // WHEN
    const result = sut.handleEvent('dismiss');

    // THEN
    assert.equal(result.action, 'remove_project');
    assert.equal(result.response.removed, true);
  });
});

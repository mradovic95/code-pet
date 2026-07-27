'use strict';

const { setupMocks } = require('../../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createMockContext } = require('../../helpers/mock-context');

const WorkingState = require('../../../src/app/pet/state-machine/working-state');

describe('WorkingState', () => {
  let sut;
  let ctx;

  beforeEach(() => {
    ctx = createMockContext({ lastActiveEvent: 'working_started' });
    sut = new WorkingState(ctx);
  });

  it('transitions to planning when planning_started received', () => {
    // GIVEN
    // sut is a WorkingState

    // WHEN
    const result = sut.handleEvent('planning_started');

    // THEN
    assert.equal(result.rendererState, 'planning');
    assert.equal(ctx._lastChangedTo, 'planning');
    assert.equal(ctx.lastActiveEvent, 'planning_started');
  });

  it('transitions to waiting_for_action when action_requested received', () => {
    // GIVEN
    // sut is a WorkingState

    // WHEN
    const result = sut.handleEvent('action_requested');

    // THEN
    assert.equal(result.rendererState, 'waiting_for_action');
    assert.equal(ctx._lastChangedTo, 'waiting_for_action');
  });

  it('transitions to idle and clears lastActiveEvent when work_finished received', () => {
    // GIVEN
    // sut is a WorkingState

    // WHEN
    const result = sut.handleEvent('work_finished');

    // THEN
    assert.equal(result.rendererState, 'idle');
    assert.equal(ctx._lastChangedTo, 'idle');
    assert.equal(ctx.lastActiveEvent, null);
  });

  it('re-affirms working state when action_completed received', () => {
    // GIVEN
    // sut is a WorkingState

    // WHEN
    const result = sut.handleEvent('action_completed');

    // THEN
    assert.equal(result.rendererState, 'working');
    assert.equal(result.response.restored, true);
    // Does not change state
    assert.equal(ctx._lastChangedTo, null);
  });

  it('ignores awaken', () => {
    // GIVEN
    // sut is a WorkingState

    // WHEN
    const result = sut.handleEvent('awaken');

    // THEN
    assert.equal(result.response.ignored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('ignores falling_asleep', () => {
    // GIVEN
    // sut is a WorkingState

    // WHEN
    const result = sut.handleEvent('falling_asleep');

    // THEN
    assert.equal(result.response.ignored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('removes project when dismiss received', () => {
    // GIVEN
    // sut is a WorkingState

    // WHEN
    const result = sut.handleEvent('dismiss');

    // THEN
    assert.equal(result.action, 'remove_project');
    assert.equal(result.response.removed, true);
  });
});

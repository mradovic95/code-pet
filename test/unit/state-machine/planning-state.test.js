'use strict';

const { setupMocks } = require('../../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createMockContext } = require('../../helpers/mock-context');

const PlanningState = require('../../../src/app/pet/state-machine/planning-state');

describe('PlanningState', () => {
  let sut;
  let ctx;

  beforeEach(() => {
    ctx = createMockContext({ lastActiveEvent: 'planning_started' });
    sut = new PlanningState(ctx);
  });

  it('transitions to working when working_started received', () => {
    // GIVEN
    // sut is a PlanningState

    // WHEN
    const result = sut.handleEvent('working_started');

    // THEN
    assert.equal(result.rendererState, 'working');
    assert.equal(ctx._lastChangedTo, 'working');
    assert.equal(ctx.lastActiveEvent, 'working_started');
  });

  it('transitions to waiting_for_action when action_requested received', () => {
    // GIVEN
    // sut is a PlanningState

    // WHEN
    const result = sut.handleEvent('action_requested');

    // THEN
    assert.equal(result.rendererState, 'waiting_for_action');
    assert.equal(ctx._lastChangedTo, 'waiting_for_action');
  });

  it('transitions to idle and clears lastActiveEvent when work_finished received', () => {
    // GIVEN
    // sut is a PlanningState

    // WHEN
    const result = sut.handleEvent('work_finished');

    // THEN
    assert.equal(result.rendererState, 'idle');
    assert.equal(ctx._lastChangedTo, 'idle');
    assert.equal(ctx.lastActiveEvent, null);
  });

  it('re-affirms planning state when action_completed received', () => {
    // GIVEN
    // sut is a PlanningState

    // WHEN
    const result = sut.handleEvent('action_completed');

    // THEN
    assert.equal(result.rendererState, 'planning');
    assert.equal(result.response.restored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('ignores awaken', () => {
    // GIVEN
    // sut is a PlanningState

    // WHEN
    const result = sut.handleEvent('awaken');

    // THEN
    assert.equal(result.response.ignored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('ignores falling_asleep', () => {
    // GIVEN
    // sut is a PlanningState

    // WHEN
    const result = sut.handleEvent('falling_asleep');

    // THEN
    assert.equal(result.response.ignored, true);
    assert.equal(ctx._lastChangedTo, null);
  });

  it('removes project when dismiss received', () => {
    // GIVEN
    // sut is a PlanningState

    // WHEN
    const result = sut.handleEvent('dismiss');

    // THEN
    assert.equal(result.action, 'remove_project');
  });
});

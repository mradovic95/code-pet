'use strict';

const { setupMocks } = require('../../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createMockContext } = require('../../helpers/mock-context');

const WorkingState = require('../../../src/app/state-machine/working-state');
const PlanningState = require('../../../src/app/state-machine/planning-state');

describe('ActiveState (shared behavior)', () => {
  describe('via WorkingState', () => {
    let sut;
    let ctx;

    beforeEach(() => {
      ctx = createMockContext({ lastActiveEvent: 'working_started' });
      sut = new WorkingState(ctx);
    });

    it('transitions to waiting_for_action on action_requested', () => {
      // GIVEN
      // sut is in an active state

      // WHEN
      const result = sut.handleEvent('action_requested');

      // THEN
      assert.equal(result.rendererState, 'waiting_for_action');
      assert.equal(ctx._lastChangedTo, 'waiting_for_action');
    });

    it('transitions to idle and clears lastActiveEvent on work_finished', () => {
      // GIVEN
      assert.equal(ctx.lastActiveEvent, 'working_started');

      // WHEN
      const result = sut.handleEvent('work_finished');

      // THEN
      assert.equal(result.rendererState, 'idle');
      assert.equal(ctx._lastChangedTo, 'idle');
      assert.equal(ctx.lastActiveEvent, null);
    });

    it('re-affirms current state on action_completed', () => {
      // GIVEN
      // sut is in working state

      // WHEN
      const result = sut.handleEvent('action_completed');

      // THEN
      assert.equal(result.rendererState, 'working');
      assert.equal(result.response.restored, true);
      assert.equal(ctx._lastChangedTo, null);
    });
  });

  describe('via PlanningState', () => {
    let sut;
    let ctx;

    beforeEach(() => {
      ctx = createMockContext({ lastActiveEvent: 'planning_started' });
      sut = new PlanningState(ctx);
    });

    it('re-affirms planning state on action_completed', () => {
      // GIVEN
      // sut is in planning state

      // WHEN
      const result = sut.handleEvent('action_completed');

      // THEN
      assert.equal(result.rendererState, 'planning');
      assert.equal(result.response.restored, true);
      assert.equal(ctx._lastChangedTo, null);
    });
  });

  describe('default ignores (inherited from BaseState)', () => {
    let sut;
    let ctx;

    beforeEach(() => {
      ctx = createMockContext();
      sut = new WorkingState(ctx);
    });

    it('ignores awaken', () => {
      // GIVEN / WHEN
      const result = sut.handleEvent('awaken');

      // THEN
      assert.equal(result.response.ignored, true);
      assert.equal(ctx._lastChangedTo, null);
    });

    it('ignores falling_asleep', () => {
      // GIVEN / WHEN
      const result = sut.handleEvent('falling_asleep');

      // THEN
      assert.equal(result.response.ignored, true);
      assert.equal(ctx._lastChangedTo, null);
    });
  });
});

'use strict';

const { setupMocks } = require('../../helpers/mock-modules');
setupMocks();

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createState } = require('../../../src/app/state-machine/state-factory');

describe('createState', () => {
  const fakeContext = { projectName: 'test', lastActiveEvent: null };

  it('creates IdleState when given idle', () => {
    // GIVEN
    const stateName = 'idle';

    // WHEN
    const sut = createState(stateName, fakeContext);

    // THEN
    assert.equal(sut.name, 'idle');
    assert.equal(sut.constructor.name, 'IdleState');
  });

  it('creates WorkingState when given working', () => {
    // GIVEN
    const stateName = 'working';

    // WHEN
    const sut = createState(stateName, fakeContext);

    // THEN
    assert.equal(sut.name, 'working');
    assert.equal(sut.constructor.name, 'WorkingState');
  });

  it('creates PlanningState when given planning', () => {
    // GIVEN
    const stateName = 'planning';

    // WHEN
    const sut = createState(stateName, fakeContext);

    // THEN
    assert.equal(sut.name, 'planning');
    assert.equal(sut.constructor.name, 'PlanningState');
  });

  it('creates WaitingForActionState when given waiting_for_action', () => {
    // GIVEN
    const stateName = 'waiting_for_action';

    // WHEN
    const sut = createState(stateName, fakeContext);

    // THEN
    assert.equal(sut.name, 'waiting_for_action');
    assert.equal(sut.constructor.name, 'WaitingForActionState');
  });

  it('throws when given unknown state name', () => {
    // GIVEN
    const stateName = 'bogus';

    // WHEN / THEN
    assert.throws(() => createState(stateName, fakeContext), /Unknown state/);
  });
});

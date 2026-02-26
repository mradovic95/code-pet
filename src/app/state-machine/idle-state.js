'use strict';

const BaseState = require('./base-state');
const { STATES } = require('./events');

class IdleState extends BaseState {
  constructor(context) {
    super(STATES.IDLE, context);
  }

  onAwaken() {
    this.context.lastEventName = this.eventName;
    return this.result({
      rendererState: 'waking_up',
      response: { state: 'waking_up' },
    });
  }

  onWorkingStarted() {
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.WORKING);
  }

  onPlanningStarted() {
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.PLANNING);
  }

  onActionRequested() {
    return this.transitionTo(STATES.WAITING_FOR_ACTION);
  }

  onFallingAsleep() {
    return this.removeProject();
  }
}

module.exports = IdleState;

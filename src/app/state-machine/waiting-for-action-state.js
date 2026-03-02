'use strict';

const BaseState = require('./base-state');
const { STATES } = require('./events');

class WaitingForActionState extends BaseState {
  constructor(context) {
    super(STATES.WAITING_FOR_ACTION, context);
  }

  onWorkingStarted() {
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.WORKING);
  }

  onPlanningStarted() {
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.PLANNING);
  }

  onWorkFinished() {
    this.context.lastActiveEvent = null;
    return this.transitionTo(STATES.IDLE);
  }

  onActionCompleted() {
    return this.restore(() => this.ignore());
  }

  onFallingAsleep() {
    return this.restore(() => this.removeProject());
  }
}

module.exports = WaitingForActionState;

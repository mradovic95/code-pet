'use strict';

const ActiveState = require('./active-state');
const { EVENTS, STATES } = require('./events');

class PlanningState extends ActiveState {
  constructor(context) {
    super(STATES.PLANNING, EVENTS.PLANNING_STARTED, context);
  }

  onWorkingStarted() {
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.WORKING);
  }
}

module.exports = PlanningState;

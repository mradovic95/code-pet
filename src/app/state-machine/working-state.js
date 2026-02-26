'use strict';

const ActiveState = require('./active-state');
const { EVENTS, STATES } = require('./events');

class WorkingState extends ActiveState {
  constructor(context) {
    super(STATES.WORKING, EVENTS.WORKING_STARTED, context);
  }

  onPlanningStarted() {
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.PLANNING);
  }
}

module.exports = WorkingState;

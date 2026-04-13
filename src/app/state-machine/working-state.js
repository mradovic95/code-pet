'use strict';

const ActiveState = require('./active-state');
const { EVENTS, STATES } = require('./events');
const logger = require('../logger');

class WorkingState extends ActiveState {
  constructor(context) {
    super(STATES.WORKING, EVENTS.WORKING_STARTED, context);
  }

  onPlanningStarted() {
    logger.info(`[${this.context.projectName}] WorkingState.onPlanningStarted: switching from working to planning`);
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.PLANNING);
  }
}

module.exports = WorkingState;

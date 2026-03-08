'use strict';

const ActiveState = require('./active-state');
const { EVENTS, STATES } = require('./events');
const logger = require('../logger');

class PlanningState extends ActiveState {
  constructor(context) {
    super(STATES.PLANNING, EVENTS.PLANNING_STARTED, context);
  }

  onWorkingStarted() {
    logger.info(`[${this.context.project}] PlanningState.onWorkingStarted: switching from planning to working`);
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.WORKING);
  }
}

module.exports = PlanningState;

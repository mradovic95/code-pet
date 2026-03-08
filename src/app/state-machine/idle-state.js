'use strict';

const BaseState = require('./base-state');
const { STATES } = require('./events');
const logger = require('../logger');

class IdleState extends BaseState {
  constructor(context) {
    super(STATES.IDLE, context);
  }

  onAwaken() {
    logger.info(`[${this.context.projectName}] IdleState.onAwaken: sending waking_up to renderer`);
    this.context.lastEventName = this.eventName;
    return this.result({
      rendererState: 'waking_up',
      response: { state: 'waking_up' },
    });
  }

  onWorkingStarted() {
    logger.info(`[${this.context.projectName}] IdleState.onWorkingStarted: transitioning to working`);
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.WORKING);
  }

  onPlanningStarted() {
    logger.info(`[${this.context.projectName}] IdleState.onPlanningStarted: transitioning to planning`);
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.PLANNING);
  }

  onActionRequested() {
    logger.info(`[${this.context.projectName}] IdleState.onActionRequested: transitioning to waiting_for_action`);
    return this.transitionTo(STATES.WAITING_FOR_ACTION);
  }

  onFallingAsleep() {
    logger.info(`[${this.context.projectName}] IdleState.onFallingAsleep: removing project`);
    return this.removeProject();
  }
}

module.exports = IdleState;

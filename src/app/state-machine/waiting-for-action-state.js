'use strict';

const BaseState = require('./base-state');
const { EVENTS, STATES } = require('./events');
const logger = require('../logger');

class WaitingForActionState extends BaseState {
  constructor(context) {
    super(STATES.WAITING_FOR_ACTION, context);
  }

  onWorkingStarted() {
    logger.info(`[${this.context.project}] WaitingForActionState.onWorkingStarted: transitioning to working`);
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.WORKING);
  }

  onPlanningStarted() {
    logger.info(`[${this.context.project}] WaitingForActionState.onPlanningStarted: transitioning to planning`);
    this.context.lastActiveEvent = this.eventName;
    return this.transitionTo(STATES.PLANNING);
  }

  onWorkFinished() {
    logger.info(`[${this.context.project}] WaitingForActionState.onWorkFinished: clearing lastActiveEvent, transitioning to idle`);
    this.context.lastActiveEvent = null;
    return this.transitionTo(STATES.IDLE);
  }

  onActionCompleted() {
    const mode = this.context.permissionMode;
    logger.info(`[${this.context.project}] WaitingForActionState.onActionCompleted: permissionMode=${mode}, lastActiveEvent=${this.context.lastActiveEvent}`);
    if (mode === 'plan') {
      logger.info(`[${this.context.project}] WaitingForActionState.onActionCompleted: transitioning to planning (plan mode)`);
      this.context.lastActiveEvent = EVENTS.PLANNING_STARTED;
      return this.transitionTo(STATES.PLANNING);
    }
    if (mode) {
      logger.info(`[${this.context.project}] WaitingForActionState.onActionCompleted: transitioning to working (mode=${mode})`);
      this.context.lastActiveEvent = EVENTS.WORKING_STARTED;
      return this.transitionTo(STATES.WORKING);
    }
    logger.info(`[${this.context.project}] WaitingForActionState.onActionCompleted: no permissionMode, falling back to restore`);
    return this.restore(() => this.ignore());
  }

  onFallingAsleep() {
    logger.info(`[${this.context.project}] WaitingForActionState.onFallingAsleep: attempting restore, fallback to remove`);
    return this.restore(() => this.removeProject());
  }
}

module.exports = WaitingForActionState;

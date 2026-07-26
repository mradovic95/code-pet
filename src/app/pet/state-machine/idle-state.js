'use strict';

const BaseState = require('./base-state');
const { EVENTS, STATES } = require('./events');
const logger = require('../../core/logger');

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

  onActionCompleted() {
    // Only subagent-tagged events wake the pet; untagged ones may be a
    // main-agent tool completion racing in after Stop, with no later Stop
    // to put the pet back to sleep.
    if (!this.context.lastAgentId) {
      return this.ignore();
    }
    if (this.context.permissionMode === 'plan') {
      logger.info(`[${this.context.projectName}] IdleState.onActionCompleted: background subagent active (${this.context.lastAgentId}), transitioning to planning`);
      this.context.lastActiveEvent = EVENTS.PLANNING_STARTED;
      return this.transitionTo(STATES.PLANNING);
    }
    logger.info(`[${this.context.projectName}] IdleState.onActionCompleted: background subagent active (${this.context.lastAgentId}), transitioning to working`);
    this.context.lastActiveEvent = EVENTS.WORKING_STARTED;
    return this.transitionTo(STATES.WORKING);
  }

  onFallingAsleep() {
    logger.info(`[${this.context.projectName}] IdleState.onFallingAsleep: removing project`);
    return this.removeProject();
  }
}

module.exports = IdleState;

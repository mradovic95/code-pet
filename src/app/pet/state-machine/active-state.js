'use strict';

const BaseState = require('./base-state');
const { STATES } = require('./events');
const logger = require('../../core/logger');

class ActiveState extends BaseState {
  constructor(stateName, selfEvent, context) {
    super(stateName, context);
    this.selfEvent = selfEvent;
  }

  onActionRequested() {
    logger.info(`[${this.context.projectName}] ${this.constructor.name}.onActionRequested: transitioning to waiting_for_action`);
    return this.transitionTo(STATES.WAITING_FOR_ACTION);
  }

  onWorkFinished() {
    logger.info(`[${this.context.projectName}] ${this.constructor.name}.onWorkFinished: clearing lastActiveEvent, transitioning to idle`);
    this.context.lastActiveEvent = null;
    return this.transitionTo(STATES.IDLE);
  }

  onActionCompleted() {
    logger.info(`[${this.context.projectName}] ${this.constructor.name}.onActionCompleted: re-affirming state '${this.name}'`);
    this.context.lastEventName = this.selfEvent;
    return this.result({
      rendererState: this.name,
      response: { state: this.name, restored: true },
    });
  }
}

module.exports = ActiveState;

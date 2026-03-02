'use strict';

const BaseState = require('./base-state');
const { STATES } = require('./events');

class ActiveState extends BaseState {
  constructor(stateName, selfEvent, context) {
    super(stateName, context);
    this.selfEvent = selfEvent;
  }

  onActionRequested() {
    return this.transitionTo(STATES.WAITING_FOR_ACTION);
  }

  onWorkFinished() {
    this.context.lastActiveEvent = null;
    return this.transitionTo(STATES.IDLE);
  }

  onFallingAsleep() {
    return this.removeProject();
  }

  onActionCompleted() {
    this.context.lastEventName = this.selfEvent;
    return this.result({
      rendererState: this.name,
      response: { state: this.name, restored: true },
    });
  }
}

module.exports = ActiveState;

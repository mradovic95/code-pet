'use strict';

const { EVENT_TO_STATE, EVENTS } = require('./events');

const EVENT_METHOD_MAP = {
  [EVENTS.AWAKEN]:            'onAwaken',
  [EVENTS.WORKING_STARTED]:   'onWorkingStarted',
  [EVENTS.PLANNING_STARTED]:  'onPlanningStarted',
  [EVENTS.ACTION_REQUESTED]:  'onActionRequested',
  [EVENTS.WORK_FINISHED]:     'onWorkFinished',
  [EVENTS.ACTION_COMPLETED]:  'onActionCompleted',
  [EVENTS.FALLING_ASLEEP]:    'onFallingAsleep',
};

class BaseState {
  constructor(name, context) {
    this.name = name;
    this.context = context;
  }

  handleEvent(eventName) {
    this.eventName = eventName;
    const method = EVENT_METHOD_MAP[eventName];
    return this[method]();
  }

  // --- Defaults: ignore all events (states whitelist what they handle) ---

  onAwaken()           { return this.ignore(); }
  onWorkingStarted()   { return this.ignore(); }
  onPlanningStarted()  { return this.ignore(); }
  onActionRequested()  { return this.ignore(); }
  onWorkFinished()     { return this.ignore(); }
  onActionCompleted()  { return this.ignore(); }
  onFallingAsleep()    { return this.ignore(); }

  // --- Helpers ---

  transitionTo(stateName, responseExtras = {}) {
    this.context.lastEventName = this.eventName;
    this.context.changeState(stateName);
    return this.result({
      rendererState: stateName,
      response: { state: stateName, ...responseExtras },
    });
  }

  restore(fallback) {
    if (this.context.lastActiveEvent) {
      const restoredState = EVENT_TO_STATE[this.context.lastActiveEvent];
      this.context.lastEventName = this.context.lastActiveEvent;
      this.context.changeState(restoredState);
      return this.result({
        rendererState: restoredState,
        response: { state: restoredState, restored: true },
      });
    }
    return fallback();
  }

  suppress() {
    return this.result({
      response: { suppressed: true },
    });
  }

  ignore() {
    return this.result({
      response: { ignored: true },
    });
  }

  removeProject() {
    this.context.lastEventName = this.eventName;
    return this.result({
      action: 'remove_project',
      response: { removed: true },
    });
  }

  result(overrides = {}) {
    return {
      rendererState: undefined,
      response: {},
      statusCode: 200,
      action: undefined,
      ...overrides,
    };
  }
}

module.exports = BaseState;

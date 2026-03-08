'use strict';

const { EVENT_TO_STATE, EVENTS } = require('./events');
const logger = require('../logger');

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
    logger.info(`[${this.context.project}] ${this.constructor.name}.handleEvent: received '${eventName}', dispatching to ${method}()`);
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
    logger.info(`[${this.context.project}] ${this.constructor.name}.transitionTo: ${this.name} -> ${stateName}`);
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
      logger.info(`[${this.context.project}] ${this.constructor.name}.restore: restoring to ${restoredState} (lastActiveEvent=${this.context.lastActiveEvent})`);
      this.context.lastEventName = this.context.lastActiveEvent;
      this.context.changeState(restoredState);
      return this.result({
        rendererState: restoredState,
        response: { state: restoredState, restored: true },
      });
    }
    logger.info(`[${this.context.project}] ${this.constructor.name}.restore: no lastActiveEvent, using fallback`);
    return fallback();
  }

  suppress() {
    logger.info(`[${this.context.project}] ${this.constructor.name}.suppress: suppressing '${this.eventName}' in state '${this.name}'`);
    return this.result({
      response: { suppressed: true },
    });
  }

  ignore() {
    logger.info(`[${this.context.project}] ${this.constructor.name}.ignore: ignoring '${this.eventName}' in state '${this.name}'`);
    return this.result({
      response: { ignored: true },
    });
  }

  removeProject() {
    logger.info(`[${this.context.project}] ${this.constructor.name}.removeProject: removing project`);
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

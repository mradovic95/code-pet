'use strict';

const { VALID_EVENTS, STATES } = require('./events');

class PetContext {
  constructor(projectName, petType) {
    this.lastActiveEvent = null;
    this.lastEventName = null;
    this.lastEventTime = 0;
    this.projectName = projectName || 'unknown';
    this.petType = petType || 'dog';
    this.claudePid = null;
    this.tty = null;
    this.changeState(STATES.IDLE);
  }

  changeState(stateName) {
    const { createState } = require('./state-factory');
    this.state = createState(stateName, this);
  }

  handleEvent(eventName) {
    if (!VALID_EVENTS.has(eventName)) {
      return {
        statusCode: 400,
        response: { error: 'Invalid event', valid: [...VALID_EVENTS] },
      };
    }
    this.lastEventTime = Date.now();
    const result = this.state.handleEvent(eventName);
    result.response.received = eventName;
    return result;
  }

  updateProcessInfo(claudePid, tty) {
    if (claudePid) this.claudePid = claudePid;
    if (tty) this.tty = tty;
  }

  getSnapshot() {
    return {
      lastEventName: this.lastEventName,
      lastActiveEvent: this.lastActiveEvent,
      lastEventTime: this.lastEventTime,
      projectName: this.projectName,
      petType: this.petType,
      claudePid: this.claudePid,
      tty: this.tty,
    };
  }
}

module.exports = PetContext;

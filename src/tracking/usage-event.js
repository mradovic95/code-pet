'use strict';

class UsageEvent {
  constructor(type, name, sessionId) {
    this.type = type;
    this.name = name;
    this.timestamp = Date.now();
    this.sessionId = sessionId;
    Object.freeze(this);
  }

  toJSON() {
    return {
      type: this.type,
      name: this.name,
      timestamp: this.timestamp,
      sessionId: this.sessionId,
    };
  }
}

module.exports = UsageEvent;

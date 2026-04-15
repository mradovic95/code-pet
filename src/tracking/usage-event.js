'use strict';

class UsageEvent {
  constructor(type, name, sessionId, projectPath) {
    this.type = type;
    this.name = name;
    this.timestamp = Date.now();
    this.sessionId = sessionId;
    this.projectPath = projectPath == null ? null : projectPath;
    Object.freeze(this);
  }

  toJSON() {
    return {
      type: this.type,
      name: this.name,
      timestamp: this.timestamp,
      sessionId: this.sessionId,
      projectPath: this.projectPath,
    };
  }
}

module.exports = UsageEvent;

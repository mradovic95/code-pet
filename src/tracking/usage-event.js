'use strict';

class UsageEvent {
  constructor(type, name, sessionId, projectPath, extra = {}) {
    this.type = type;
    this.name = name;
    this.timestamp = Date.now();
    this.sessionId = sessionId;
    this.projectPath = projectPath == null ? null : projectPath;
    // Optional enrichment — absent on events recorded before duration tracking.
    if (extra && typeof extra.durationMs === 'number' && isFinite(extra.durationMs)) {
      this.durationMs = extra.durationMs;
    }
    if (extra && typeof extra.agentId === 'string' && extra.agentId !== '') {
      this.agentId = extra.agentId;
    }
    Object.freeze(this);
  }

  toJSON() {
    const json = {
      type: this.type,
      name: this.name,
      timestamp: this.timestamp,
      sessionId: this.sessionId,
      projectPath: this.projectPath,
    };
    if (this.durationMs !== undefined) json.durationMs = this.durationMs;
    if (this.agentId !== undefined) json.agentId = this.agentId;
    return json;
  }
}

module.exports = UsageEvent;

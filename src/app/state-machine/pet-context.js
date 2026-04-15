'use strict';

const { VALID_EVENTS, STATES } = require('./events');
const { UsageTracker } = require('../../tracking');

class PetContext {
  constructor(projectName, petType, { store } = {}) {
    this.lastActiveEvent = null;
    this.lastEventName = null;
    this.lastEventTime = 0;
    this.projectName = projectName || 'unknown';
    this.displayName = this.projectName;
    this.petType = petType || 'dog';
    this.claudePid = null;
    this.tty = null;
    this.permissionMode = null;
    this.projectPath = null;
    this.createdAt = Date.now();
    this.tracker = new UsageTracker({ store });
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

  recordToolUsage(toolName, toolInput) {
    if (!toolName) return;
    if (toolName.startsWith('mcp__')) {
      this.tracker.record('mcp_tool', toolName);
    } else if (toolName === 'Skill') {
      const skillName = (toolInput && toolInput.skill) ? toolInput.skill : 'unknown';
      this.tracker.record('skill', skillName);
    }
  }

  getUsageSnapshot() {
    return this.tracker.getUsageSnapshot();
  }

  getUsageEvents() {
    return this.tracker.getEvents().map(e => e.toJSON());
  }

  getSnapshot() {
    return {
      lastEventName: this.lastEventName,
      lastActiveEvent: this.lastActiveEvent,
      lastEventTime: this.lastEventTime,
      projectName: this.displayName,
      projectPath: this.projectPath,
      petType: this.petType,
      claudePid: this.claudePid,
      tty: this.tty,
      createdAt: this.createdAt,
      usage: this.getUsageSnapshot(),
    };
  }
}

module.exports = PetContext;

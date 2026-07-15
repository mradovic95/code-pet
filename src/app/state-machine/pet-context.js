'use strict';

const { VALID_EVENTS, STATES } = require('./events');
const { UsageTracker } = require('../../tracking');

// Env-overridable (read once at app start); invalid or non-positive values fall back.
function positiveIntEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const TOOL_START_TTL_MS = positiveIntEnv('CODE_PET_TOOL_START_TTL_MS', 10 * 60 * 1000);
const MAX_PENDING_TOOL_STARTS = positiveIntEnv('CODE_PET_MAX_PENDING_TOOL_STARTS', 50);

class PetContext {
  constructor(projectName, petType, { store, projectPath } = {}) {
    this.lastActiveEvent = null;
    this.lastEventName = null;
    this.lastEventTime = 0;
    this.projectName = projectName || 'unknown';
    this.displayName = this.projectName;
    this.petType = petType || 'dog';
    this.claudePid = null;
    this.tty = null;
    this.permissionMode = null;
    this.lastAgentId = null;
    this.projectPath = projectPath || null;
    this.createdAt = Date.now();
    this.tracker = new UsageTracker({ store, projectPath: this.projectPath });
    this._pendingToolStarts = new Map(); // toolUseId/tool:<name> → startedAt
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

  recordToolUsage(toolName, toolInput, extra = {}) {
    if (!toolName) return;
    if (toolName.startsWith('mcp__')) {
      this.tracker.record('mcp_tool', toolName, extra);
    } else if (toolName === 'Skill') {
      const skillName = (toolInput && toolInput.skill) ? toolInput.skill : 'unknown';
      this.tracker.record('skill', skillName, extra);
    }
  }

  // Duration pairing: PreToolUse (action_started) stamps a start time that the
  // matching PostToolUse (action_completed) resolves into a durationMs.
  _toolStartKey(toolUseId, toolName) {
    return toolUseId || `tool:${toolName}`;
  }

  noteToolStart(toolUseId, toolName) {
    if (!toolUseId && !toolName) return;
    const now = Date.now();
    // Prune expired entries and enforce the cap (Map preserves insertion order).
    for (const [key, startedAt] of this._pendingToolStarts) {
      if (now - startedAt > TOOL_START_TTL_MS) this._pendingToolStarts.delete(key);
    }
    while (this._pendingToolStarts.size >= MAX_PENDING_TOOL_STARTS) {
      this._pendingToolStarts.delete(this._pendingToolStarts.keys().next().value);
    }
    this._pendingToolStarts.set(this._toolStartKey(toolUseId, toolName), now);
  }

  resolveToolDuration(toolUseId, toolName) {
    const keys = [];
    if (toolUseId) keys.push(toolUseId);
    if (toolName) keys.push(`tool:${toolName}`);
    for (const key of keys) {
      const startedAt = this._pendingToolStarts.get(key);
      if (startedAt === undefined) continue;
      this._pendingToolStarts.delete(key);
      const elapsed = Date.now() - startedAt;
      if (elapsed <= TOOL_START_TTL_MS) return elapsed;
      return undefined;
    }
    return undefined;
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

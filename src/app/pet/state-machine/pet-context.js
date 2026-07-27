'use strict';

const { VALID_EVENTS, STATES } = require('./events');
const { UsageTracker } = require('../../../tracking');

// Env-overridable (read once at app start); invalid or non-positive values fall back.
function positiveIntEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const TOOL_START_TTL_MS = positiveIntEnv('CODE_PET_TOOL_START_TTL_MS', 10 * 60 * 1000);
const MAX_PENDING_TOOL_STARTS = positiveIntEnv('CODE_PET_MAX_PENDING_TOOL_STARTS', 50);

// The subagent tool is named "Task" in Claude Code hook payloads; "Agent" is
// matched too in case newer versions rename it. Exact equality, so this can't
// swallow other tools.
const SUBAGENT_TOOL_NAMES = new Set(['Task', 'Agent']);

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
    } else if (SUBAGENT_TOOL_NAMES.has(toolName)) {
      const agentType = (toolInput && toolInput.subagent_type) ? toolInput.subagent_type : 'unknown';
      this.tracker.record('subagent', agentType, extra);
    }
    // Other built-in tools (Read, Bash, Edit, …) are not recorded — they are
    // high volume and add little analytical value.
  }

  // Duration pairing: PreToolUse (action_started) stamps a start time that the
  // matching PostToolUse (action_completed) resolves into a durationMs.
  _toolStartKey(toolUseId, toolName) {
    return toolUseId || `tool:${toolName}`;
  }

  noteToolStart(toolUseId, toolName) {
    if (!toolUseId && !toolName) return;
    const now = Date.now();
    // Each key holds a FIFO queue of start times so overlapping calls that
    // share a name-fallback key pair oldest-start-to-first-completion instead
    // of the newest start clobbering the rest.
    // Prune expired starts and enforce the cap over the total queued count
    // (Map preserves insertion order, so the oldest keys evict first).
    let total = 0;
    for (const [key, starts] of this._pendingToolStarts) {
      while (starts.length > 0 && now - starts[0] > TOOL_START_TTL_MS) starts.shift();
      if (starts.length === 0) this._pendingToolStarts.delete(key);
      else total += starts.length;
    }
    while (total >= MAX_PENDING_TOOL_STARTS) {
      const oldestKey = this._pendingToolStarts.keys().next().value;
      const starts = this._pendingToolStarts.get(oldestKey);
      starts.shift();
      if (starts.length === 0) this._pendingToolStarts.delete(oldestKey);
      total -= 1;
    }
    const key = this._toolStartKey(toolUseId, toolName);
    const queue = this._pendingToolStarts.get(key);
    if (queue) queue.push(now);
    else this._pendingToolStarts.set(key, [now]);
  }

  resolveToolDuration(toolUseId, toolName) {
    const keys = [];
    if (toolUseId) keys.push(toolUseId);
    if (toolName) keys.push(`tool:${toolName}`);
    for (const key of keys) {
      const queue = this._pendingToolStarts.get(key);
      if (!queue || queue.length === 0) continue;
      const startedAt = queue.shift();
      if (queue.length === 0) this._pendingToolStarts.delete(key);
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

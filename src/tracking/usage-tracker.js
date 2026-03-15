'use strict';

const { randomUUID } = require('crypto');
const UsageEvent = require('./usage-event');

const DEFAULT_MAX_EVENTS = 2000;
const EVICTION_FRACTION = 0.25;

class UsageTracker {
  constructor({ maxEvents = DEFAULT_MAX_EVENTS, sessionId } = {}) {
    this.maxEvents = maxEvents;
    this.sessionId = sessionId || randomUUID();
    this._events = [];
  }

  record(type, name) {
    const event = new UsageEvent(type, name, this.sessionId);
    this._events.push(event);
    if (this._events.length > this.maxEvents) {
      const drop = Math.floor(this.maxEvents * EVICTION_FRACTION);
      this._events = this._events.slice(drop);
    }
    return event;
  }

  getEvents(filter) {
    if (!filter) return this._events.slice();
    return this._events.filter((e) => {
      if (filter.type && e.type !== filter.type) return false;
      if (filter.name && e.name !== filter.name) return false;
      if (filter.since && e.timestamp < filter.since) return false;
      return true;
    });
  }

  getAggregatedCounts(type) {
    const counts = {};
    for (const e of this._events) {
      if (type && e.type !== type) continue;
      counts[e.name] = (counts[e.name] || 0) + 1;
    }
    return counts;
  }

  getUsageSnapshot() {
    return {
      mcp: this.getAggregatedCounts('mcp_tool'),
      skills: this.getAggregatedCounts('skill'),
    };
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      events: this._events.map((e) => e.toJSON()),
    };
  }

  drain() {
    const result = this.toJSON();
    this._events = [];
    return result;
  }

  get size() {
    return this._events.length;
  }
}

module.exports = UsageTracker;

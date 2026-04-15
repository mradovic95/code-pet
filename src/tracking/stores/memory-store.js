'use strict';

const { UsageStore } = require('../usage-store');

/**
 * MemoryStore — no-op store. Used as the default when persistence is
 * disabled, and in unit tests that don't want filesystem side effects.
 *
 * `readAll` always returns an empty array — by design. The in-memory event
 * buffer lives on UsageTracker, not here. This store is only the "drop on
 * the floor" sink behind the persistence interface.
 */
class MemoryStore extends UsageStore {
  async append(_event) {}
  async readAll(_filter = {}) { return []; }
  async flush() {}
  async close() {}
}

module.exports = MemoryStore;

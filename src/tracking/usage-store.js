'use strict';

/**
 * UsageStore — abstract contract for persisting UsageEvent rows.
 *
 * Backends (filesystem, sqlite, remote, ...) implement these four methods.
 * All methods MUST return Promises and MUST swallow their own errors so that
 * callers (tracker hot path) can fire-and-forget without try/catch.
 *
 * Subclasses should not override the base no-op behavior selectively — they
 * either implement durable storage or stay no-op (see MemoryStore).
 */
class UsageStore {
  /* eslint-disable no-unused-vars */
  async append(event) {}
  async readAll(filter = {}) { return []; }
  async flush() {}
  async close() {}
  /* eslint-enable no-unused-vars */
}

/**
 * Factory for store backends.
 *
 * Usage:
 *   createStore({ type: 'filesystem', path: '/.../usage.log' })
 *   createStore({ type: 'memory' })
 *
 * Adding a new backend = add a case here + a class file under stores/.
 */
function createStore(config = {}) {
  const type = config.type || 'memory';
  switch (type) {
    case 'filesystem': {
      const FilesystemStore = require('./stores/filesystem-store');
      return new FilesystemStore(config);
    }
    case 'memory': {
      const MemoryStore = require('./stores/memory-store');
      return new MemoryStore();
    }
    default:
      throw new Error(`Unknown UsageStore type: ${type}`);
  }
}

module.exports = { UsageStore, createStore };

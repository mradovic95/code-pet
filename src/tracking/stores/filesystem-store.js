'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const { UsageStore } = require('../usage-store');

const DEFAULT_PATH = path.join(os.homedir(), '.code-pet', 'usage.log');

/**
 * FilesystemStore — append-only NDJSON store at ~/.code-pet/usage.log
 * (overridable via the `path` option).
 *
 * Why no rotation/cap: the whole point of this file is preserving cross-session
 * history. At ~100 bytes per event and human-paced traffic, the file grows
 * ~10–20 MB/year — irrelevant on any modern disk. If size ever becomes a real
 * problem, switch to time-based archival (usage.YYYY.log) that keeps history.
 *
 * Concurrency: writes are serialized through a single-flight Promise chain so
 * `append()` is safe to call without awaiting (fire-and-forget from the hot
 * path) without risk of interleaved partial lines. Errors are logged via the
 * project logger and swallowed — the contract is "never throw to the caller".
 */
class FilesystemStore extends UsageStore {
  constructor({ path: filePath = DEFAULT_PATH } = {}) {
    super();
    this.path = filePath;
    this._chain = Promise.resolve();
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this.path);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch { /* directory already exists or cannot be created — append will surface the error */ }
  }

  async append(event) {
    const payload = typeof event.toJSON === 'function' ? event.toJSON() : event;
    const line = JSON.stringify(payload) + '\n';
    this._chain = this._chain
      .then(() => fsp.appendFile(this.path, line))
      .catch((err) => {
        // Lazy-require logger to avoid a hard coupling from the tracking
        // package to src/app/. Tracking should be importable in isolation.
        try {
          const logger = require('../../app/logger');
          logger.warn(`usage-store append failed: ${err.message}`);
        } catch { /* logger unavailable in test env — silently drop */ }
      });
    return this._chain;
  }

  async readAll(filter = {}) {
    let data;
    try {
      data = await fsp.readFile(this.path, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const events = [];
    for (const line of data.split('\n')) {
      if (!line) continue;
      try {
        events.push(JSON.parse(line));
      } catch { /* skip malformed line — never let one bad row break the read */ }
    }
    return this._applyFilter(events, filter);
  }

  _applyFilter(events, { since, type, limit } = {}) {
    let result = events;
    if (type) result = result.filter((e) => e.type === type);
    if (since) result = result.filter((e) => e.timestamp >= since);
    if (limit && result.length > limit) result = result.slice(-limit);
    return result;
  }

  async flush() {
    await this._chain;
  }

  async close() {
    await this.flush();
  }
}

module.exports = FilesystemStore;

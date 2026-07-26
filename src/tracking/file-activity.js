'use strict';

/**
 * Pure aggregation over transcript-derived file-touch events
 * ({ tool, filePath, sessionId, cwd, timestamp }). No I/O, no Node APIs —
 * loadable both via require() (main process, tests) and via <script> in the
 * settings renderer (window.fileActivity).
 *
 * Source events come from src/tracking/transcript-reader.js (Claude Code session
 * transcripts, read on demand). See docs/file-directory-metrics-investigation.md.
 */
(function () {
  // tool name → which bucket it counts toward
  const CATEGORY = {
    Read: 'reads',
    Edit: 'edits',
    NotebookEdit: 'edits',
    Write: 'writes',
  };

  // Project-relative display path. Paths outside the project stay absolute.
  function relativePath(filePath, projectPath) {
    if (!projectPath) return filePath;
    const prefix = projectPath.endsWith('/') ? projectPath : projectPath + '/';
    if (filePath.startsWith(prefix)) return filePath.slice(prefix.length);
    if (filePath === projectPath) return filePath.split('/').pop() || filePath;
    return filePath;
  }

  // Directory of a (relative or absolute) path via the last separator.
  // A bare filename (project root) rolls up under '.'.
  function dirOf(p) {
    const idx = p.lastIndexOf('/');
    return idx <= 0 ? '.' : p.slice(0, idx);
  }

  function toMs(ts) {
    if (ts == null) return null;
    const ms = typeof ts === 'number' ? ts : Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
  }

  /**
   * aggregate(events, { projectPath }) →
   * {
   *   totals:  { reads, edits, writes, files, sessions, events },
   *   topFiles: [{ path, reads, edits, writes, total }],  // desc by total
   *   topDirs:  [{ dir, total }],                          // desc by total
   *   sessions: [{ sessionId, startedAt, endedAt, files, events }] // desc by endedAt
   * }
   */
  function aggregate(events, { projectPath } = {}) {
    const list = Array.isArray(events) ? events : [];

    const files = new Map();     // relPath → { path, reads, edits, writes, total }
    const dirs = new Map();      // dir → total
    const sessions = new Map();  // sessionId → { sessionId, startedAt, endedAt, files:Set, events }
    const totals = { reads: 0, edits: 0, writes: 0, files: 0, sessions: 0, events: 0 };

    for (const e of list) {
      const bucket = CATEGORY[e.tool];
      if (!bucket) continue;
      const rel = relativePath(e.filePath, projectPath);

      let f = files.get(rel);
      if (!f) {
        f = { path: rel, reads: 0, edits: 0, writes: 0, total: 0 };
        files.set(rel, f);
      }
      f[bucket] += 1;
      f.total += 1;

      const dir = dirOf(rel);
      dirs.set(dir, (dirs.get(dir) || 0) + 1);

      const sid = e.sessionId || 'unknown';
      let s = sessions.get(sid);
      if (!s) {
        s = { sessionId: sid, startedAt: null, endedAt: null, _files: new Set(), events: 0 };
        sessions.set(sid, s);
      }
      s.events += 1;
      s._files.add(rel);
      const ms = toMs(e.timestamp);
      if (ms != null) {
        if (s.startedAt == null || ms < s.startedAt) s.startedAt = ms;
        if (s.endedAt == null || ms > s.endedAt) s.endedAt = ms;
      }

      totals[bucket] += 1;
      totals.events += 1;
    }

    totals.files = files.size;
    totals.sessions = sessions.size;

    const byTotalThenName = (a, b) => b.total - a.total || String(a.path || a.dir).localeCompare(String(b.path || b.dir));

    const topFiles = [...files.values()].sort(byTotalThenName);
    const topDirs = [...dirs.entries()]
      .map(([dir, total]) => ({ dir, total }))
      .sort((a, b) => b.total - a.total || a.dir.localeCompare(b.dir));
    const sessionList = [...sessions.values()]
      .map((s) => ({ sessionId: s.sessionId, startedAt: s.startedAt, endedAt: s.endedAt, files: s._files.size, events: s.events }))
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));

    return { totals, topFiles, topDirs, sessions: sessionList };
  }

  const api = { aggregate, relativePath, dirOf };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof window !== 'undefined') {
    window.fileActivity = api;
  }
})();

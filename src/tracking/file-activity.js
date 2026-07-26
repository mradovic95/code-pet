'use strict';

/**
 * Pure aggregation over transcript-derived file-touch events
 * ({ tool, filePath, sessionId, cwd, timestamp, agentId, agentType, planMode }).
 * No I/O, no Node APIs —
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
   *   totals:  { reads, edits, writes, files, sessions, events, subagentEvents,
   *              planEvents, execEvents, untaggedEvents },
   *   topFiles: [{ path, reads, edits, writes, total, planTouches, execTouches, planReads }],
   *   topDirs:  [{ dir, total }],                          // desc by total
   *   sessions: [{ sessionId, startedAt, endedAt, files, events }], // desc by endedAt
   *   agentSplit: { total, tagged, pct, byType },  // same shape as usage-analytics
   *   topAgents: [{ agentType, total }],           // desc by total
   *   modeSplit: { total, tagged, pct, byMode },   // agentSplit's shape; tagged = plan mode
   *   topOrientFiles: [{ path, planReads, sessions }] // desc by planReads
   * }
   *
   * `topOrientFiles` answers what the project costs to understand: files read in
   * plan mode, ranked by how often, with the number of *distinct* sessions that
   * re-read them — which is what separates a file needed repeatedly to orient
   * from one read many times in a single sitting.
   */
  function aggregate(events, { projectPath } = {}) {
    const list = Array.isArray(events) ? events : [];

    const files = new Map();     // relPath → { path, reads, edits, writes, total, plan/exec counts }
    const dirs = new Map();      // dir → total
    const sessions = new Map();  // sessionId → { sessionId, startedAt, endedAt, files:Set, events }
    const byType = new Map();    // agentType → total (subagent touches only)
    const totals = {
      reads: 0, edits: 0, writes: 0, files: 0, sessions: 0, events: 0, subagentEvents: 0,
      planEvents: 0, execEvents: 0, untaggedEvents: 0,
    };

    for (const e of list) {
      const bucket = CATEGORY[e.tool];
      if (!bucket) continue;
      const rel = relativePath(e.filePath, projectPath);

      let f = files.get(rel);
      if (!f) {
        f = { path: rel, reads: 0, edits: 0, writes: 0, total: 0, planTouches: 0, execTouches: 0, planReads: 0, _planSessions: new Set() };
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

      // Subagent touches are tagged by the reader from the transcript's location
      // (<session>/subagents/), never from a record field.
      if (e.agentId) {
        totals.subagentEvents += 1;
        const type = e.agentType || 'unknown';
        byType.set(type, (byType.get(type) || 0) + 1);
      }

      // planMode is null when the transcript never revealed a mode; such touches
      // count toward neither side rather than being folded into execution.
      if (e.planMode === true) {
        totals.planEvents += 1;
        f.planTouches += 1;
        if (bucket === 'reads') {
          f.planReads += 1;
          f._planSessions.add(sid);
        }
      } else if (e.planMode === false) {
        totals.execEvents += 1;
        f.execTouches += 1;
      } else {
        totals.untaggedEvents += 1;
      }

      totals[bucket] += 1;
      totals.events += 1;
    }

    totals.files = files.size;
    totals.sessions = sessions.size;

    const byTotalThenName = (a, b) => b.total - a.total || String(a.path || a.dir).localeCompare(String(b.path || b.dir));

    const fileList = [...files.values()];
    const topFiles = fileList
      .map(({ _planSessions, ...f }) => f) // eslint-disable-line no-unused-vars
      .sort(byTotalThenName);
    const topOrientFiles = fileList
      .filter((f) => f.planReads > 0)
      .map((f) => ({ path: f.path, planReads: f.planReads, sessions: f._planSessions.size }))
      .sort((a, b) => b.planReads - a.planReads || a.path.localeCompare(b.path));
    const topDirs = [...dirs.entries()]
      .map(([dir, total]) => ({ dir, total }))
      .sort((a, b) => b.total - a.total || a.dir.localeCompare(b.dir));
    const sessionList = [...sessions.values()]
      .map((s) => ({ sessionId: s.sessionId, startedAt: s.startedAt, endedAt: s.endedAt, files: s._files.size, events: s.events }))
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));

    const topAgents = [...byType.entries()]
      .map(([agentType, total]) => ({ agentType, total }))
      .sort((a, b) => b.total - a.total || a.agentType.localeCompare(b.agentType));

    const agentSplit = {
      total: totals.events,
      tagged: totals.subagentEvents,
      pct: totals.events === 0 ? 0 : Math.round((totals.subagentEvents / totals.events) * 100),
      byType: Object.fromEntries(byType),
    };

    const modeSplit = {
      total: totals.events,
      tagged: totals.planEvents,
      pct: totals.events === 0 ? 0 : Math.round((totals.planEvents / totals.events) * 100),
      byMode: { plan: totals.planEvents, execution: totals.execEvents, unknown: totals.untaggedEvents },
    };

    return { totals, topFiles, topDirs, sessions: sessionList, agentSplit, topAgents, modeSplit, topOrientFiles };
  }

  const api = { aggregate, relativePath, dirOf };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof window !== 'undefined') {
    window.fileActivity = api;
  }
})();

'use strict';

const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

// Claude Code stores one JSONL transcript per session under
// ~/.claude/projects/<encoded-project>/<session-id>.jsonl, plus one per subagent
// at <session-id>/subagents/agent-<id>.jsonl with an agent-<id>.meta.json
// sidecar holding its agentType. Each assistant line carries
// `.message.content[]`; tool calls are items with type "tool_use", name, and
// input. Read/Edit/Write/NotebookEdit inputs carry the file path.
// We read these on demand (never persisted, never sent anywhere) to compute a
// per-session / per-project file-activity view — see
// docs/file-directory-metrics-investigation.md. (docs/usage-tracking.md covers the
// hook-sourced tracker only; nothing here is written to usage.log.)
//
// Subagent transcripts are a large share of file activity (measured at ~21% of
// this project's own touches, nearly all reads) and must be walked explicitly:
// `isSidechain` is false on every record in the top-level transcripts, so only
// the directory layout distinguishes a subagent's work from the main agent's.
// See docs/file-activity-metrics-extensions-investigation.md §4.1.
//
// Each touch also carries whether it happened in plan mode (§4.3). That comes
// from `permissionMode`, which is only ever observed in the *main* transcripts —
// and on records that carry no timestamp — so the tag depends on line order
// within one file and can never be reconstructed from a merged event stream.
// Subagent transcripts have no mode records at all, so a subagent inherits the
// parent's mode at the moment of the spawning tool call.

const DEFAULT_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// tool name → the input key holding its file path
const FILE_TOOLS = {
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
};

/**
 * Claude Code's project-directory encoding: every non-alphanumeric character in
 * the absolute project path is replaced by a dash. So "/Users/me/my_projects/x"
 * → "-Users-me-my-projects-x" (separators, underscores and dots all collapse to
 * "-"; existing dashes are preserved).
 */
function encodedProjectDir(projectPath) {
  return String(projectPath || '').replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Read every session transcript for `projectPath` — the main-agent transcripts
 * and every subagent transcript beneath them — and return a flat array of
 * file-touch events:
 * { tool, filePath, sessionId, cwd, timestamp, agentId, agentType, planMode }.
 *
 * `agentId`/`agentType` are null for main-agent touches and set for subagents,
 * so callers can split the two (see file-activity.js `agentSplit`). `planMode`
 * is true for touches made in plan mode, false for execution, null when the
 * transcript never revealed a mode (see file-activity.js `modeSplit`).
 *
 * `projectsDir` defaults to ~/.claude/projects and is injectable so tests can
 * point at an isolated fixture directory. Missing/unreadable dir → []. Malformed
 * lines are skipped, never thrown — one bad row can't break the read.
 */
async function readFileEvents(projectPath, { projectsDir = DEFAULT_PROJECTS_DIR } = {}) {
  const dir = path.join(projectsDir, encodedProjectDir(projectPath));
  const sessions = await collectSessions(dir);

  const perSession = await Promise.all(sessions.map(readSession));
  return perSession.flat();
}

/**
 * Parse one session: its main transcript first, then every subagent it spawned.
 *
 * The order is load-bearing. Subagent transcripts carry no `permission-mode`
 * records, so a subagent's plan-mode tag can only come from the parent's mode at
 * the moment of the spawning tool call — which the main transcript's parse
 * collects as `spawnModes`, keyed by tool_use id and matched against the
 * sidecar's `toolUseId`. Sessions are still parsed concurrently; only
 * main-before-subagents *within* a session is sequential.
 */
async function readSession(session) {
  let events = [];
  let spawnModes = new Map();
  if (session.filePath) {
    ({ events, spawnModes } = await parseTranscript(session.filePath, session.sessionId));
  }

  const perAgent = await Promise.all(
    session.subagents.map((sub) =>
      parseTranscript(sub.filePath, session.sessionId, {
        agentId: sub.agentId,
        agentType: sub.agentType,
        // An unresolvable toolUseId (missing/malformed sidecar) leaves the
        // subagent's touches untagged rather than guessing a mode.
        inheritedPlanMode: spawnModes.has(sub.toolUseId) ? spawnModes.get(sub.toolUseId) : null,
      })
    )
  );

  return events.concat(...perAgent.map((p) => p.events));
}

/**
 * Group every transcript under a project's directory by session, as
 * { sessionId, filePath, subagents: [{ filePath, agentId, agentType, toolUseId }] }.
 *
 * Two layouts, one pass: `<session-id>.jsonl` at the top level (the main agent)
 * and `<session-id>/subagents/agent-<id>.jsonl` one level down (agentId from the
 * filename stem, agentType/toolUseId from the .meta.json sidecar). `filePath` is
 * null for the rare session with subagent transcripts but no main one.
 * `sessionId` here is only a fallback — a record's own sessionId wins, and
 * sidechain records carry their *parent* session's id, which is what folds a
 * subagent's touches into the session that spawned it.
 */
async function collectSessions(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return []; // dir missing (no sessions yet) or unreadable
  }

  const sessions = new Map();
  const forSession = (sessionId) => {
    let s = sessions.get(sessionId);
    if (!s) {
      s = { sessionId, filePath: null, subagents: [] };
      sessions.set(sessionId, s);
    }
    return s;
  };

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      forSession(entry.name.replace(/\.jsonl$/, '')).filePath = path.join(dir, entry.name);
    } else if (entry.isDirectory()) {
      const subagents = await collectSubagentTranscripts(dir, entry.name);
      if (subagents.length) forSession(entry.name).subagents = subagents;
    }
  }
  return [...sessions.values()];
}

async function collectSubagentTranscripts(dir, sessionId) {
  const subagentsDir = path.join(dir, sessionId, 'subagents');

  let names;
  try {
    names = await fsp.readdir(subagentsDir);
  } catch {
    return []; // an unrelated subdirectory, or a session that spawned no subagents
  }

  const found = [];
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue; // skip the .meta.json sidecars
    const stem = name.replace(/\.jsonl$/, '');
    const meta = await readAgentMeta(path.join(subagentsDir, `${stem}.meta.json`));
    found.push({
      filePath: path.join(subagentsDir, name),
      sessionId,
      agentId: stem.replace(/^agent-/, ''),
      agentType: meta.agentType,
      toolUseId: meta.toolUseId,
    });
  }
  return found;
}

// Sidecar shape: { agentType, description, toolUseId, spawnDepth }. A missing or
// malformed sidecar leaves the touches attributed to the subagent but untyped
// and untagged — `toolUseId` is what links it back to the spawning tool call in
// the parent transcript, and so to the mode it ran in.
async function readAgentMeta(metaPath) {
  const str = (v) => (typeof v === 'string' && v ? v : null);
  try {
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    return { agentType: str(meta.agentType), toolUseId: str(meta.toolUseId) };
  } catch {
    return { agentType: null, toolUseId: null };
  }
}

/**
 * Parse one transcript into { events, spawnModes }.
 *
 * `spawnModes` maps every tool_use id in the file to the plan-mode flag in
 * effect when it ran, so a caller can tag the subagents those calls spawned.
 * Pass `inheritedPlanMode` (subagent transcripts) to force the flag for the
 * whole file instead of deriving it from mode records.
 */
async function parseTranscript(filePath, fallbackSessionId, { agentId = null, agentType = null, inheritedPlanMode } = {}) {
  let data;
  try {
    data = await fsp.readFile(filePath, 'utf8');
  } catch {
    return { events: [], spawnModes: new Map() };
  }

  const events = [];
  const spawnModes = new Map();
  const inherits = inheritedPlanMode !== undefined;
  let mode = null;        // most recent permissionMode seen in this file
  let exitedPlan = false; // an ExitPlanMode call since that mode was set

  for (const line of data.split('\n')) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // skip malformed line
    }
    // Both carriers of the mode: the standalone {type:'permission-mode'} record
    // and the top-level permissionMode field on user prompt records. Neither has
    // a timestamp, so only this sequential read can place them.
    if (obj && typeof obj.permissionMode === 'string') {
      mode = obj.permissionMode;
      exitedPlan = false;
    }
    const content = obj && obj.message && obj.message.content;
    if (!Array.isArray(content)) continue;

    for (const item of content) {
      if (!item || item.type !== 'tool_use') continue;
      const planMode = inherits
        ? inheritedPlanMode
        : mode === null ? null : mode === 'plan' && !exitedPlan;
      // Recorded before ExitPlanMode clears the flag, so a subagent spawned in
      // the same turn inherits the mode it actually ran in.
      if (item.id) spawnModes.set(item.id, planMode);
      // A mode record does not reliably follow plan approval, so the call itself
      // is the boundary — without this, post-approval work reads as planning.
      if (item.name === 'ExitPlanMode') {
        exitedPlan = true;
        continue;
      }
      const key = FILE_TOOLS[item.name];
      if (!key) continue;
      const filePath = item.input && item.input[key];
      if (typeof filePath !== 'string' || filePath === '') continue;
      events.push({
        tool: item.name,
        filePath,
        sessionId: obj.sessionId || fallbackSessionId,
        cwd: obj.cwd || null,
        timestamp: obj.timestamp || null,
        agentId: agentId ? obj.agentId || agentId : null,
        agentType,
        planMode,
      });
    }
  }
  return { events, spawnModes };
}

module.exports = { readFileEvents, encodedProjectDir };

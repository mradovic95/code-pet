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
 * { tool, filePath, sessionId, cwd, timestamp, agentId, agentType }.
 *
 * `agentId`/`agentType` are null for main-agent touches and set for subagents,
 * so callers can split the two (see file-activity.js `agentSplit`).
 *
 * `projectsDir` defaults to ~/.claude/projects and is injectable so tests can
 * point at an isolated fixture directory. Missing/unreadable dir → []. Malformed
 * lines are skipped, never thrown — one bad row can't break the read.
 */
async function readFileEvents(projectPath, { projectsDir = DEFAULT_PROJECTS_DIR } = {}) {
  const dir = path.join(projectsDir, encodedProjectDir(projectPath));
  const transcripts = await collectTranscripts(dir);

  const perFile = await Promise.all(
    transcripts.map((t) => parseTranscript(t.filePath, t.sessionId, t.agentId, t.agentType))
  );
  return perFile.flat();
}

/**
 * Locate every transcript under a project's directory as
 * { filePath, sessionId, agentId, agentType }.
 *
 * Two layouts, one pass: `<session-id>.jsonl` at the top level (main agent,
 * agentId null) and `<session-id>/subagents/agent-<id>.jsonl` one level down
 * (agentId from the filename stem, agentType from the .meta.json sidecar).
 * `sessionId` here is only a fallback — a record's own sessionId wins, and
 * sidechain records carry their *parent* session's id, which is what folds a
 * subagent's touches into the session that spawned it.
 */
async function collectTranscripts(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return []; // dir missing (no sessions yet) or unreadable
  }

  const transcripts = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      transcripts.push({
        filePath: path.join(dir, entry.name),
        sessionId: entry.name.replace(/\.jsonl$/, ''),
        agentId: null,
        agentType: null,
      });
    } else if (entry.isDirectory()) {
      transcripts.push(...(await collectSubagentTranscripts(dir, entry.name)));
    }
  }
  return transcripts;
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
    found.push({
      filePath: path.join(subagentsDir, name),
      sessionId,
      agentId: stem.replace(/^agent-/, ''),
      agentType: await readAgentType(path.join(subagentsDir, `${stem}.meta.json`)),
    });
  }
  return found;
}

// Sidecar shape: { agentType, description, toolUseId, spawnDepth }. A missing or
// malformed sidecar leaves the touches attributed to the subagent but untyped.
async function readAgentType(metaPath) {
  try {
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    return typeof meta.agentType === 'string' && meta.agentType ? meta.agentType : null;
  } catch {
    return null;
  }
}

async function parseTranscript(filePath, fallbackSessionId, agentId = null, agentType = null) {
  let data;
  try {
    data = await fsp.readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const events = [];
  for (const line of data.split('\n')) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // skip malformed line
    }
    const content = obj && obj.message && obj.message.content;
    if (!Array.isArray(content)) continue;

    for (const item of content) {
      if (!item || item.type !== 'tool_use') continue;
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
      });
    }
  }
  return events;
}

module.exports = { readFileEvents, encodedProjectDir };

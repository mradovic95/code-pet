'use strict';

const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

// Claude Code stores one JSONL transcript per session under
// ~/.claude/projects/<encoded-project>/<session-id>.jsonl. Each assistant line
// carries `.message.content[]`; tool calls are items with type "tool_use",
// name, and input. Read/Edit/Write/NotebookEdit inputs carry the file path.
// We read these on demand (never persisted, never sent anywhere) to compute a
// per-session / per-project file-activity view — see docs/usage-tracking.md and
// docs/file-directory-metrics-investigation.md.

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
 * Read every session transcript for `projectPath` and return a flat array of
 * file-touch events: { tool, filePath, sessionId, cwd, timestamp }.
 *
 * `projectsDir` defaults to ~/.claude/projects and is injectable so tests can
 * point at an isolated fixture directory. Missing/unreadable dir → []. Malformed
 * lines are skipped, never thrown — one bad row can't break the read.
 */
async function readFileEvents(projectPath, { projectsDir = DEFAULT_PROJECTS_DIR } = {}) {
  const dir = path.join(projectsDir, encodedProjectDir(projectPath));

  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return []; // dir missing (no sessions yet) or unreadable
  }

  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => e.name);

  const perFile = await Promise.all(
    files.map((name) => parseTranscript(path.join(dir, name), name.replace(/\.jsonl$/, '')))
  );
  return perFile.flat();
}

async function parseTranscript(filePath, fallbackSessionId) {
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
      });
    }
  }
  return events;
}

module.exports = { readFileEvents, encodedProjectDir };

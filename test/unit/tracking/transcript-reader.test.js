'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const sut = require('../../../src/tracking/transcript-reader');

const PROJECT = '/home/user/proj';
let projectsDir;
let projectDir;

function line(obj) {
  return JSON.stringify(obj) + '\n';
}

function toolUseLine(sessionId, timestamp, ...tools) {
  return line({
    type: 'assistant',
    sessionId,
    cwd: PROJECT,
    timestamp,
    message: { role: 'assistant', content: tools.map((t) => ({ type: 'tool_use', ...t })) },
  });
}

// The standalone record Claude Code writes when the permission mode changes. It
// carries no timestamp, so only its position in the file places it.
function modeLine(sessionId, permissionMode) {
  return line({ type: 'permission-mode', permissionMode, sessionId });
}

// Writes <projectDir>/<sessionId>/subagents/agent-<id>.jsonl (+ .meta.json),
// the layout Claude Code uses for a subagent spawned by that session.
function writeSubagent(sessionId, agentId, { meta, content } = {}) {
  const dir = path.join(projectDir, sessionId, 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `agent-${agentId}.jsonl`),
    content !== undefined ? content : toolUseLine(sessionId, '2026-07-24T10:05:00.000Z',
      { name: 'Read', input: { file_path: `${PROJECT}/scanned.js` } }));
  if (meta !== undefined) {
    fs.writeFileSync(path.join(dir, `agent-${agentId}.meta.json`), meta);
  }
}

describe('transcript-reader', () => {
  beforeEach(() => {
    projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-pet-transcripts-'));
    projectDir = path.join(projectsDir, sut.encodedProjectDir(PROJECT));
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectsDir, { recursive: true, force: true });
  });

  it('encodes a project path by replacing every non-alphanumeric char with a dash', () => {
    // GIVEN / WHEN / THEN — matches Claude Code's ~/.claude/projects/<dir> scheme
    assert.equal(sut.encodedProjectDir('/home/user/proj'), '-home-user-proj');
    assert.equal(sut.encodedProjectDir('/Users/me/my_projects/code-pet'), '-Users-me-my-projects-code-pet');
  });

  it('extracts Read/Edit/Write/NotebookEdit file paths and ignores other tools', async () => {
    // GIVEN
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'),
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z',
        { name: 'Read', input: { file_path: `${PROJECT}/a.js` } },
        { name: 'Edit', input: { file_path: `${PROJECT}/a.js` } },
        { name: 'Write', input: { file_path: `${PROJECT}/b.js` } },
        { name: 'NotebookEdit', input: { notebook_path: `${PROJECT}/nb.ipynb` } },
        { name: 'Bash', input: { command: 'ls' } },
        { name: 'Skill', input: { skill: 'verify' } },
      ));

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(events.length, 4);
    assert.deepEqual(events.map((e) => e.tool).sort(), ['Edit', 'NotebookEdit', 'Read', 'Write']);
    const nb = events.find((e) => e.tool === 'NotebookEdit');
    assert.equal(nb.filePath, `${PROJECT}/nb.ipynb`);
    assert.equal(nb.sessionId, 'sess-1');
    assert.equal(nb.cwd, PROJECT);
  });

  it('reads events across multiple session files', async () => {
    // GIVEN
    fs.writeFileSync(path.join(projectDir, 's1.jsonl'),
      toolUseLine('s1', '2026-07-24T10:00:00.000Z', { name: 'Read', input: { file_path: `${PROJECT}/a.js` } }));
    fs.writeFileSync(path.join(projectDir, 's2.jsonl'),
      toolUseLine('s2', '2026-07-24T11:00:00.000Z', { name: 'Edit', input: { file_path: `${PROJECT}/b.js` } }));

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(events.length, 2);
    assert.deepEqual([...new Set(events.map((e) => e.sessionId))].sort(), ['s1', 's2']);
  });

  it('falls back to the filename stem when a line lacks sessionId', async () => {
    // GIVEN — a line with no sessionId field
    fs.writeFileSync(path.join(projectDir, 'abc-123.jsonl'),
      line({ type: 'assistant', cwd: PROJECT, timestamp: '2026-07-24T10:00:00.000Z',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: `${PROJECT}/a.js` } }] } }));

    // WHEN
    const [e] = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(e.sessionId, 'abc-123');
  });

  it('skips malformed lines without throwing', async () => {
    // GIVEN
    fs.writeFileSync(path.join(projectDir, 's.jsonl'),
      toolUseLine('s', '2026-07-24T10:00:00.000Z', { name: 'Read', input: { file_path: `${PROJECT}/a.js` } }) +
      '{not json\n' +
      toolUseLine('s', '2026-07-24T10:01:00.000Z', { name: 'Write', input: { file_path: `${PROJECT}/b.js` } }));

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(events.length, 2);
  });

  it('ignores tool_use with no/empty file path', async () => {
    // GIVEN
    fs.writeFileSync(path.join(projectDir, 's.jsonl'),
      toolUseLine('s', '2026-07-24T10:00:00.000Z',
        { name: 'Read', input: {} },
        { name: 'Edit', input: { file_path: '' } },
        { name: 'Write', input: { file_path: `${PROJECT}/ok.js` } },
      ));

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(events.length, 1);
    assert.equal(events[0].filePath, `${PROJECT}/ok.js`);
  });

  it('returns [] when the project has no transcript directory', async () => {
    // GIVEN / WHEN
    const events = await sut.readFileEvents('/no/such/project', { projectsDir });

    // THEN
    assert.deepEqual(events, []);
  });

  it('ignores subdirectories that hold no subagents directory', async () => {
    // GIVEN a session dir with nothing but unrelated content beside it
    fs.mkdirSync(path.join(projectDir, 'sess-1'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'sess-1', 'notes.jsonl'),
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z', { name: 'Read', input: { file_path: `${PROJECT}/stray.js` } }));
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'),
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z', { name: 'Read', input: { file_path: `${PROJECT}/a.js` } }));

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN only the top-level transcript is read — a .jsonl one level down counts
    // only when it sits under subagents/
    assert.equal(events.length, 1);
    assert.equal(events[0].filePath, `${PROJECT}/a.js`);
  });

  it('reads subagent transcripts and tags them with agentId and agentType', async () => {
    // GIVEN a session that spawned an Explore subagent
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'),
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z', { name: 'Edit', input: { file_path: `${PROJECT}/a.js` } }));
    writeSubagent('sess-1', 'abc123', {
      meta: JSON.stringify({ agentType: 'Explore', description: 'find the thing', spawnDepth: 1 }),
    });

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN both the main-agent and the subagent touch are present
    assert.equal(events.length, 2);
    const main = events.find((e) => e.tool === 'Edit');
    const sub = events.find((e) => e.tool === 'Read');
    assert.deepEqual({ agentId: main.agentId, agentType: main.agentType }, { agentId: null, agentType: null });
    assert.deepEqual({ agentId: sub.agentId, agentType: sub.agentType }, { agentId: 'abc123', agentType: 'Explore' });
    assert.equal(sub.filePath, `${PROJECT}/scanned.js`);
  });

  it('folds subagent touches into the session that spawned them', async () => {
    // GIVEN a subagent whose records carry the parent session id
    writeSubagent('parent-sess', 'a1', { meta: JSON.stringify({ agentType: 'Plan' }) });

    // WHEN
    const [e] = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN the Session filter groups delegated work under its parent session
    assert.equal(e.sessionId, 'parent-sess');
  });

  it('falls back to the directory name when a subagent record lacks sessionId', async () => {
    // GIVEN a sidechain line with no sessionId of its own
    const dir = path.join(projectDir, 'dir-sess', 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'agent-x9.jsonl'),
      line({ type: 'assistant', cwd: PROJECT, isSidechain: true,
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: `${PROJECT}/a.js` } }] } }));

    // WHEN
    const [e] = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(e.sessionId, 'dir-sess');
    assert.equal(e.agentId, 'x9');
  });

  it('prefers a record-level agentId over the filename stem', async () => {
    // GIVEN a transcript whose records name the agent explicitly
    const dir = path.join(projectDir, 'sess-1', 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'agent-stem.jsonl'),
      line({ type: 'assistant', sessionId: 'sess-1', cwd: PROJECT, isSidechain: true, agentId: 'from-record',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: `${PROJECT}/a.js` } }] } }));

    // WHEN
    const [e] = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(e.agentId, 'from-record');
  });

  it('keeps subagent touches when the meta sidecar is missing or malformed', async () => {
    // GIVEN one subagent with no sidecar and one with unparseable JSON
    writeSubagent('sess-1', 'nometa');
    writeSubagent('sess-1', 'badmeta', { meta: '{not json' });

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN the touches still count, attributed but untyped
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.agentType), [null, null]);
    assert.deepEqual(events.map((e) => e.agentId).sort(), ['badmeta', 'nometa']);
  });

  it('tags touches that follow a plan permission-mode record as plan mode', async () => {
    // GIVEN a session that plans, then switches to executing
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'),
      modeLine('sess-1', 'plan') +
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z', { name: 'Read', input: { file_path: `${PROJECT}/planned.js` } }) +
      modeLine('sess-1', 'bypassPermissions') +
      toolUseLine('sess-1', '2026-07-24T10:01:00.000Z', { name: 'Edit', input: { file_path: `${PROJECT}/shipped.js` } }));

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(events.find((e) => e.tool === 'Read').planMode, true);
    assert.equal(events.find((e) => e.tool === 'Edit').planMode, false);
  });

  it('leaves planMode null when no mode record precedes the touch', async () => {
    // GIVEN a transcript that never reveals its permission mode
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'),
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z', { name: 'Read', input: { file_path: `${PROJECT}/a.js` } }));

    // WHEN
    const [e] = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN it is reported as unknown rather than assumed to be execution
    assert.equal(e.planMode, null);
  });

  it('ends plan mode at an ExitPlanMode call, without waiting for a mode record', async () => {
    // GIVEN a plan that is approved and then implemented, with no further mode
    // record — the common case in real transcripts
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'),
      modeLine('sess-1', 'plan') +
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z', { name: 'Read', input: { file_path: `${PROJECT}/researched.js` } }) +
      toolUseLine('sess-1', '2026-07-24T10:01:00.000Z', { name: 'ExitPlanMode', input: {} }) +
      toolUseLine('sess-1', '2026-07-24T10:02:00.000Z', { name: 'Edit', input: { file_path: `${PROJECT}/shipped.js` } }));

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN post-approval work is execution, not planning
    assert.equal(events.find((e) => e.tool === 'Read').planMode, true);
    assert.equal(events.find((e) => e.tool === 'Edit').planMode, false);
  });

  it('reads the mode from a top-level permissionMode field on a prompt record', async () => {
    // GIVEN a user prompt carrying the mode inline instead of a standalone record
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'),
      line({ type: 'user', sessionId: 'sess-1', permissionMode: 'plan', message: { role: 'user', content: 'plan this' } }) +
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z', { name: 'Read', input: { file_path: `${PROJECT}/a.js` } }));

    // WHEN
    const [e] = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(e.planMode, true);
  });

  it('inherits the spawning call\'s mode into a subagent transcript', async () => {
    // GIVEN two subagents spawned from the same session — one while planning,
    // one after the plan was approved. Subagent transcripts carry no mode
    // records of their own, so the parent's mode at the spawn is the only source.
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'),
      modeLine('sess-1', 'plan') +
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z', { name: 'Task', id: 'toolu_plan', input: { subagent_type: 'Explore' } }) +
      toolUseLine('sess-1', '2026-07-24T10:01:00.000Z', { name: 'ExitPlanMode', input: {} }) +
      toolUseLine('sess-1', '2026-07-24T10:02:00.000Z', { name: 'Task', id: 'toolu_exec', input: { subagent_type: 'general-purpose' } }));
    writeSubagent('sess-1', 'planner', { meta: JSON.stringify({ agentType: 'Explore', toolUseId: 'toolu_plan' }) });
    writeSubagent('sess-1', 'worker', { meta: JSON.stringify({ agentType: 'general-purpose', toolUseId: 'toolu_exec' }) });

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN each subagent's touches carry the mode it actually ran in
    const byAgent = Object.fromEntries(events.filter((e) => e.agentId).map((e) => [e.agentId, e.planMode]));
    assert.deepEqual(byAgent, { planner: true, worker: false });
  });

  it('leaves a subagent untagged when its toolUseId matches no spawning call', async () => {
    // GIVEN a sidecar with no toolUseId at all, and one naming a call that is
    // absent from the parent transcript
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'), modeLine('sess-1', 'plan'));
    writeSubagent('sess-1', 'noid', { meta: JSON.stringify({ agentType: 'Explore' }) });
    writeSubagent('sess-1', 'staleid', { meta: JSON.stringify({ agentType: 'Explore', toolUseId: 'toolu_gone' }) });

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN the mode is reported unknown rather than guessed from the parent's
    // most recent mode
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.planMode), [null, null]);
  });

  it('tags subagent touches when the session has no main transcript', async () => {
    // GIVEN subagent transcripts whose parent .jsonl is absent (pruned session)
    writeSubagent('orphan-sess', 'a1', { meta: JSON.stringify({ agentType: 'Explore', toolUseId: 'toolu_x' }) });

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN the touch is still collected, just with an unknown mode
    assert.equal(events.length, 1);
    assert.deepEqual({ sessionId: events[0].sessionId, planMode: events[0].planMode },
      { sessionId: 'orphan-sess', planMode: null });
  });
});

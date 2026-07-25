'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const sut = require('../../src/app/transcript-reader');

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

  it('skips sibling subdirectories, reading only .jsonl files', async () => {
    // GIVEN
    fs.mkdirSync(path.join(projectDir, 'sess-1'), { recursive: true }); // aux subdir
    fs.writeFileSync(path.join(projectDir, 'sess-1.jsonl'),
      toolUseLine('sess-1', '2026-07-24T10:00:00.000Z', { name: 'Read', input: { file_path: `${PROJECT}/a.js` } }));

    // WHEN
    const events = await sut.readFileEvents(PROJECT, { projectsDir });

    // THEN
    assert.equal(events.length, 1);
  });
});

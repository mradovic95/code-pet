'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const sut = require('../../../src/tracking/file-activity');

const PROJECT = '/home/user/proj';

function ev(tool, filePath, extra = {}) {
  return { tool, filePath, sessionId: 's1', cwd: PROJECT, timestamp: '2026-07-24T10:00:00.000Z', ...extra };
}

describe('file-activity.aggregate', () => {
  it('counts reads/edits/writes per file and totals them', () => {
    // GIVEN
    const events = [
      ev('Read', `${PROJECT}/a.js`),
      ev('Read', `${PROJECT}/a.js`),
      ev('Edit', `${PROJECT}/a.js`),
      ev('Write', `${PROJECT}/b.js`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    const a = result.topFiles.find((f) => f.path === 'a.js');
    assert.deepEqual({ reads: a.reads, edits: a.edits, writes: a.writes, total: a.total }, { reads: 2, edits: 1, writes: 0, total: 3 });
    assert.deepEqual(result.totals, { reads: 2, edits: 1, writes: 1, files: 2, sessions: 1, events: 4 });
  });

  it('ranks top files by total descending', () => {
    // GIVEN
    const events = [
      ev('Read', `${PROJECT}/low.js`),
      ev('Read', `${PROJECT}/high.js`),
      ev('Edit', `${PROJECT}/high.js`),
      ev('Write', `${PROJECT}/high.js`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.equal(result.topFiles[0].path, 'high.js');
    assert.equal(result.topFiles[0].total, 3);
    assert.equal(result.topFiles[1].path, 'low.js');
  });

  it('normalizes paths project-relative and keeps outside paths absolute', () => {
    // GIVEN
    const events = [
      ev('Read', `${PROJECT}/src/x.js`),
      ev('Read', '/etc/hosts'),
    ];

    // WHEN
    const paths = sut.aggregate(events, { projectPath: PROJECT }).topFiles.map((f) => f.path);

    // THEN
    assert.ok(paths.includes('src/x.js'));
    assert.ok(paths.includes('/etc/hosts'));
  });

  it('treats NotebookEdit as an edit', () => {
    // GIVEN
    const events = [ev('NotebookEdit', `${PROJECT}/nb.ipynb`)];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.equal(result.totals.edits, 1);
    assert.equal(result.topFiles[0].edits, 1);
  });

  it('rolls up directories from relative paths (root files under ".")', () => {
    // GIVEN
    const events = [
      ev('Read', `${PROJECT}/src/a.js`),
      ev('Edit', `${PROJECT}/src/b.js`),
      ev('Read', `${PROJECT}/top.js`),
    ];

    // WHEN
    const dirs = sut.aggregate(events, { projectPath: PROJECT }).topDirs;

    // THEN
    const byDir = Object.fromEntries(dirs.map((d) => [d.dir, d.total]));
    assert.equal(byDir['src'], 2);
    assert.equal(byDir['.'], 1);
    assert.equal(dirs[0].dir, 'src'); // highest total first
  });

  it('groups sessions with span and file count, most recent first', () => {
    // GIVEN
    const events = [
      ev('Read', `${PROJECT}/a.js`, { sessionId: 'old', timestamp: '2026-07-20T09:00:00.000Z' }),
      ev('Edit', `${PROJECT}/b.js`, { sessionId: 'new', timestamp: '2026-07-24T09:00:00.000Z' }),
      ev('Edit', `${PROJECT}/c.js`, { sessionId: 'new', timestamp: '2026-07-24T10:00:00.000Z' }),
    ];

    // WHEN
    const sessions = sut.aggregate(events, { projectPath: PROJECT }).sessions;

    // THEN
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].sessionId, 'new'); // newest endedAt first
    assert.equal(sessions[0].files, 2);
    assert.equal(sessions[0].events, 2);
    assert.ok(sessions[0].endedAt > sessions[0].startedAt);
  });

  it('ignores tools with no file path bucket', () => {
    // GIVEN
    const events = [
      { tool: 'Bash', filePath: 'ls', sessionId: 's', timestamp: null },
      ev('Read', `${PROJECT}/a.js`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.equal(result.totals.events, 1);
    assert.equal(result.topFiles.length, 1);
  });

  it('returns empty structure for no events', () => {
    // GIVEN / WHEN
    const result = sut.aggregate([], { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.topFiles, []);
    assert.deepEqual(result.topDirs, []);
    assert.deepEqual(result.sessions, []);
    assert.equal(result.totals.events, 0);
  });
});

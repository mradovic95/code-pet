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
    assert.deepEqual(result.totals, {
      reads: 2, edits: 1, writes: 1, files: 2, sessions: 1, events: 4, subagentEvents: 0,
      planEvents: 0, execEvents: 0, untaggedEvents: 4,
    });
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

  it('splits main-agent from subagent touches and groups them by agent type', () => {
    // GIVEN 1 main-agent touch and 3 subagent touches
    const events = [
      ev('Edit', `${PROJECT}/a.js`),
      ev('Read', `${PROJECT}/b.js`, { agentId: 'a1', agentType: 'Explore' }),
      ev('Read', `${PROJECT}/c.js`, { agentId: 'a2', agentType: 'Explore' }),
      ev('Read', `${PROJECT}/d.js`, { agentId: 'a3', agentType: 'Plan' }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.equal(result.totals.subagentEvents, 3);
    assert.deepEqual(result.agentSplit, { total: 4, tagged: 3, pct: 75, byType: { Explore: 2, Plan: 1 } });
    assert.deepEqual(result.topAgents, [{ agentType: 'Explore', total: 2 }, { agentType: 'Plan', total: 1 }]);
  });

  it('reports an untyped subagent touch as "unknown"', () => {
    // GIVEN a subagent whose meta sidecar was missing, so agentType is null
    const events = [ev('Read', `${PROJECT}/a.js`, { agentId: 'a1', agentType: null })];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN it is still counted as delegated work, just untyped
    assert.equal(result.agentSplit.tagged, 1);
    assert.deepEqual(result.topAgents, [{ agentType: 'unknown', total: 1 }]);
  });

  it('reports a zero split when no subagent touched anything', () => {
    // GIVEN main-agent events only
    const events = [ev('Read', `${PROJECT}/a.js`), ev('Edit', `${PROJECT}/a.js`)];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.agentSplit, { total: 2, tagged: 0, pct: 0, byType: {} });
    assert.deepEqual(result.topAgents, []);
    assert.equal(result.totals.subagentEvents, 0);
  });

  it('splits plan-mode from execution touches per file and in the totals', () => {
    // GIVEN 2 plan-mode touches and 1 execution touch
    const events = [
      ev('Read', `${PROJECT}/a.js`, { planMode: true }),
      ev('Read', `${PROJECT}/a.js`, { planMode: true }),
      ev('Edit', `${PROJECT}/a.js`, { planMode: false }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    const a = result.topFiles[0];
    assert.deepEqual({ plan: a.planTouches, exec: a.execTouches }, { plan: 2, exec: 1 });
    assert.deepEqual(result.modeSplit, {
      total: 3, tagged: 2, pct: 67, byMode: { plan: 2, execution: 1, unknown: 0 },
    });
  });

  it('counts a touch with an unknown mode toward neither side', () => {
    // GIVEN one tagged touch and one from a transcript that never revealed a mode
    const events = [
      ev('Read', `${PROJECT}/a.js`, { planMode: true }),
      ev('Read', `${PROJECT}/a.js`, { planMode: null }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN the untagged touch still counts as a read, just not as plan or exec
    assert.equal(result.totals.reads, 2);
    assert.deepEqual(result.modeSplit.byMode, { plan: 1, execution: 0, unknown: 1 });
    const a = result.topFiles[0];
    assert.equal(a.planTouches + a.execTouches, 1);
  });

  it('ranks orientation files by plan-mode reads and counts the sessions that needed them', () => {
    // GIVEN a file read while planning in two sessions, one read only once, and
    // an edit that must not count as orientation
    const events = [
      ev('Read', `${PROJECT}/docs.md`, { planMode: true, sessionId: 's1' }),
      ev('Read', `${PROJECT}/docs.md`, { planMode: true, sessionId: 's1' }),
      ev('Read', `${PROJECT}/docs.md`, { planMode: true, sessionId: 's2' }),
      ev('Read', `${PROJECT}/other.md`, { planMode: true, sessionId: 's1' }),
      ev('Edit', `${PROJECT}/shipped.js`, { planMode: true, sessionId: 's1' }),
      ev('Read', `${PROJECT}/exec-only.js`, { planMode: false, sessionId: 's1' }),
    ];

    // WHEN
    const orient = sut.aggregate(events, { projectPath: PROJECT }).topOrientFiles;

    // THEN only plan-mode reads appear, ranked, with distinct-session counts
    assert.deepEqual(orient, [
      { path: 'docs.md', planReads: 3, sessions: 2 },
      { path: 'other.md', planReads: 1, sessions: 1 },
    ]);
  });

  it('reports a zero mode split and no orientation files when nothing is tagged', () => {
    // GIVEN untagged events only
    const events = [ev('Read', `${PROJECT}/a.js`), ev('Edit', `${PROJECT}/a.js`)];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.modeSplit, {
      total: 2, tagged: 0, pct: 0, byMode: { plan: 0, execution: 0, unknown: 2 },
    });
    assert.deepEqual(result.topOrientFiles, []);
  });

  it('keeps every internal accumulator out of the returned rows', () => {
    // GIVEN touches that build all the private per-file state (plan sessions, read
    // sessions, live-context map, re-read counters)
    const events = [
      ev('Read', `${PROJECT}/a.js`, { planMode: true }),
      ev('Read', `${PROJECT}/a.js`, { planMode: true }),
      ev('Edit', `${PROJECT}/a.js`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN no Set or Map leaks to the renderer from any list
    const rows = [
      ...result.topFiles, ...result.topOrientFiles,
      ...result.topReadOnlyFiles, ...result.topRereadFiles, ...result.sessions,
    ];
    const leaked = rows.flatMap((r) => Object.keys(r).filter((k) => k.startsWith('_')));
    assert.deepEqual(leaked, []);
  });

  it('lists files read more than once and never edited, with their session count', () => {
    // GIVEN a file read in two sessions and never modified
    const events = [
      ev('Read', `${PROJECT}/docs.md`),
      ev('Read', `${PROJECT}/docs.md`, { sessionId: 's2' }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.topReadOnlyFiles, [{ path: 'docs.md', reads: 2, sessions: 2 }]);
  });

  it('excludes files that were ever edited, written or notebook-edited', () => {
    // GIVEN three twice-read files, each modified by a different tool
    const events = [
      ev('Read', `${PROJECT}/a.js`), ev('Read', `${PROJECT}/a.js`), ev('Edit', `${PROJECT}/a.js`),
      ev('Read', `${PROJECT}/b.js`), ev('Read', `${PROJECT}/b.js`), ev('Write', `${PROJECT}/b.js`),
      ev('Read', `${PROJECT}/c.ipynb`), ev('Read', `${PROJECT}/c.ipynb`), ev('NotebookEdit', `${PROJECT}/c.ipynb`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN none of them is a read-only file
    assert.deepEqual(result.topReadOnlyFiles, []);
  });

  it('excludes a file read only once — a once-read file is a fact, not a cost', () => {
    // GIVEN one file read once, one read twice
    const events = [
      ev('Read', `${PROJECT}/once.md`),
      ev('Read', `${PROJECT}/twice.md`),
      ev('Read', `${PROJECT}/twice.md`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN only the repeatedly-read one is listed
    assert.deepEqual(result.topReadOnlyFiles.map((f) => f.path), ['twice.md']);
  });

  it('ranks read-only files by reads, not by sessions', () => {
    // GIVEN a file read 3x in one session and one read 2x across two sessions
    const events = [
      ev('Read', `${PROJECT}/hot.md`), ev('Read', `${PROJECT}/hot.md`), ev('Read', `${PROJECT}/hot.md`),
      ev('Read', `${PROJECT}/spread.md`), ev('Read', `${PROJECT}/spread.md`, { sessionId: 's2' }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN the higher read count leads, with sessions along for context
    assert.deepEqual(result.topReadOnlyFiles, [
      { path: 'hot.md', reads: 3, sessions: 1 },
      { path: 'spread.md', reads: 2, sessions: 2 },
    ]);
  });

  it('excludes paths outside the project from the context-tax lists', () => {
    // GIVEN a plan file outside the project read twice, and an in-project file
    const events = [
      ev('Read', '/home/user/.claude/plans/p.md'),
      ev('Read', '/home/user/.claude/plans/p.md'),
      ev('Read', `${PROJECT}/in.md`),
      ev('Read', `${PROJECT}/in.md`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN the outside path is a diagnosis the project can't act on — but it still
    // counts in the census
    assert.deepEqual(result.topReadOnlyFiles.map((f) => f.path), ['in.md']);
    assert.deepEqual(result.topRereadFiles.map((f) => f.path), ['in.md']);
    assert.ok(result.topFiles.some((f) => f.path === '/home/user/.claude/plans/p.md'));
  });

  it('keeps absolute paths when no project path is given', () => {
    // GIVEN no projectPath, so nothing is outside a project we were not told about
    const events = [ev('Read', '/somewhere/a.md'), ev('Read', '/somewhere/a.md')];

    // WHEN
    const result = sut.aggregate(events);

    // THEN
    assert.deepEqual(result.topReadOnlyFiles.map((f) => f.path), ['/somewhere/a.md']);
  });

  it('folds a subagent read into its parent session for the read-only count', () => {
    // GIVEN a main-agent read and a subagent read of the same file in one session
    const events = [
      ev('Read', `${PROJECT}/docs.md`),
      ev('Read', `${PROJECT}/docs.md`, { agentId: 'a1', agentType: 'Explore' }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN both reads count, but they happened in one session
    assert.deepEqual(result.topReadOnlyFiles, [{ path: 'docs.md', reads: 2, sessions: 1 }]);
  });

  it('counts a second read of the same file in one context as a re-read', () => {
    // GIVEN the same file read twice by the same agent in one session
    const events = [ev('Read', `${PROJECT}/a.js`), ev('Read', `${PROJECT}/a.js`)];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.topRereadFiles, [{ path: 'a.js', rereads: 1, contexts: 1 }]);
  });

  it('does not count a read that follows an edit of that file — that is verification', () => {
    // GIVEN read, edit, read of one file
    const events = [
      ev('Read', `${PROJECT}/a.js`),
      ev('Edit', `${PROJECT}/a.js`),
      ev('Read', `${PROJECT}/a.js`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN the second read re-checked what the edit changed; it is not a reload
    assert.deepEqual(result.topRereadFiles, []);
  });

  it('counts again once a later edit re-invalidates the context', () => {
    // GIVEN read,read,edit,read,read — two reloads either side of one verification
    const events = [
      ev('Read', `${PROJECT}/a.js`), ev('Read', `${PROJECT}/a.js`),
      ev('Edit', `${PROJECT}/a.js`),
      ev('Read', `${PROJECT}/a.js`), ev('Read', `${PROJECT}/a.js`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.topRereadFiles, [{ path: 'a.js', rereads: 2, contexts: 1 }]);
  });

  it('does not let an edit of a different file clear a re-read', () => {
    // GIVEN a.js read, an unrelated file edited, a.js read again
    const events = [
      ev('Read', `${PROJECT}/a.js`),
      ev('Edit', `${PROJECT}/b.js`),
      ev('Read', `${PROJECT}/a.js`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN a.js was still reloaded — only an edit of a.js itself would excuse it
    assert.deepEqual(result.topRereadFiles, [{ path: 'a.js', rereads: 1, contexts: 1 }]);
  });

  it('treats a subagent context as separate from the main agent one', () => {
    // GIVEN the main agent and a subagent each reading the file once, same session
    const events = [
      ev('Read', `${PROJECT}/a.js`),
      ev('Read', `${PROJECT}/a.js`, { agentId: 'a1', agentType: 'Explore' }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN a subagent reads into its own context — that is delegation, not a reload
    assert.deepEqual(result.topRereadFiles, []);
  });

  it('counts a subagent re-reading inside its own context', () => {
    // GIVEN one subagent reading the same file twice
    const events = [
      ev('Read', `${PROJECT}/a.js`, { agentId: 'a1', agentType: 'Explore' }),
      ev('Read', `${PROJECT}/a.js`, { agentId: 'a1', agentType: 'Explore' }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.topRereadFiles, [{ path: 'a.js', rereads: 1, contexts: 1 }]);
  });

  it('does not count the same file read once in each of two sessions', () => {
    // GIVEN one read per session — each session is a fresh context
    const events = [
      ev('Read', `${PROJECT}/a.js`),
      ev('Read', `${PROJECT}/a.js`, { sessionId: 's2' }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.topRereadFiles, []);
  });

  it('counts the distinct contexts a file was re-read in', () => {
    // GIVEN the file re-read in two different sessions
    const events = [
      ev('Read', `${PROJECT}/a.js`), ev('Read', `${PROJECT}/a.js`),
      ev('Read', `${PROJECT}/a.js`, { sessionId: 's2' }), ev('Read', `${PROJECT}/a.js`, { sessionId: 's2' }),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.topRereadFiles, [{ path: 'a.js', rereads: 2, contexts: 2 }]);
  });

  it('ranks re-read files by re-read count', () => {
    // GIVEN one file reloaded twice and one reloaded once
    const events = [
      ev('Read', `${PROJECT}/thrash.js`), ev('Read', `${PROJECT}/thrash.js`), ev('Read', `${PROJECT}/thrash.js`),
      ev('Read', `${PROJECT}/mild.js`), ev('Read', `${PROJECT}/mild.js`),
    ];

    // WHEN
    const result = sut.aggregate(events, { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.topRereadFiles.map((f) => f.path), ['thrash.js', 'mild.js']);
  });

  it('returns empty structure for no events', () => {
    // GIVEN / WHEN
    const result = sut.aggregate([], { projectPath: PROJECT });

    // THEN
    assert.deepEqual(result.topFiles, []);
    assert.deepEqual(result.topDirs, []);
    assert.deepEqual(result.sessions, []);
    assert.deepEqual(result.topReadOnlyFiles, []);
    assert.deepEqual(result.topRereadFiles, []);
    assert.equal(result.totals.events, 0);
  });
});

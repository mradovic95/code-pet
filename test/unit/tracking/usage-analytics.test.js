'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const sut = require('../../../src/tracking/usage-analytics');

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// Wed 2026-07-15 12:00:00 local time — fixed "now" for all time-dependent tests.
const NOW = new Date(2026, 6, 15, 12, 0, 0).getTime();

function event(overrides = {}) {
  return {
    type: 'skill',
    name: 'commit',
    timestamp: NOW,
    sessionId: 's1',
    projectPath: '/repo/a',
    ...overrides,
  };
}

describe('usageAnalytics.summarizeByName', () => {
  it('aggregates count, firstUsed, lastUsed, projects and sessionCount per name', () => {
    // GIVEN
    const events = [
      event({ timestamp: NOW - 2 * DAY_MS, sessionId: 's1', projectPath: '/repo/a' }),
      event({ timestamp: NOW - DAY_MS, sessionId: 's2', projectPath: '/repo/b' }),
      event({ timestamp: NOW, sessionId: 's2', projectPath: '/repo/b' }),
    ];

    // WHEN
    const result = sut.summarizeByName(events);

    // THEN
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'commit');
    assert.equal(result[0].count, 3);
    assert.equal(result[0].firstUsed, NOW - 2 * DAY_MS);
    assert.equal(result[0].lastUsed, NOW);
    assert.deepEqual(result[0].projects, ['/repo/a', '/repo/b']);
    assert.equal(result[0].sessionCount, 2);
  });

  it('sorts by count descending and filters by type', () => {
    // GIVEN
    const events = [
      event({ name: 'rare' }),
      event({ name: 'popular' }),
      event({ name: 'popular' }),
      event({ type: 'mcp_tool', name: 'mcp__db__query' }),
    ];

    // WHEN
    const skills = sut.summarizeByName(events, { type: 'skill' });

    // THEN
    assert.deepEqual(skills.map((s) => s.name), ['popular', 'rare']);
  });

  it('returns empty array for empty input', () => {
    // GIVEN
    const events = [];

    // WHEN
    const result = sut.summarizeByName(events);

    // THEN
    assert.deepEqual(result, []);
  });
});

describe('usageAnalytics.topN', () => {
  it('returns at most n entries', () => {
    // GIVEN
    const events = ['a', 'b', 'c', 'd'].map((name) => event({ name }));

    // WHEN
    const result = sut.topN(events, { n: 2 });

    // THEN
    assert.equal(result.length, 2);
  });
});

describe('usageAnalytics.weeklyTrend', () => {
  it('returns zero-filled buckets oldest to newest', () => {
    // GIVEN
    const events = [event({ timestamp: NOW })];

    // WHEN
    const result = sut.weeklyTrend(events, { weeks: 4, now: NOW });

    // THEN
    assert.equal(result.length, 4);
    assert.deepEqual(result.map((b) => b.count), [0, 0, 0, 1]);
    assert.ok(result[0].weekStart < result[3].weekStart);
  });

  it('buckets Sunday and Monday into different weeks', () => {
    // GIVEN — Sun 2026-07-12 23:59 vs Mon 2026-07-13 00:00 (local)
    const sunday = new Date(2026, 6, 12, 23, 59, 0).getTime();
    const monday = new Date(2026, 6, 13, 0, 0, 0).getTime();
    const events = [event({ timestamp: sunday }), event({ timestamp: monday })];

    // WHEN
    const result = sut.weeklyTrend(events, { weeks: 2, now: NOW });

    // THEN
    assert.deepEqual(result.map((b) => b.count), [1, 1]);
  });

  it('ignores events outside the window and filters by name', () => {
    // GIVEN
    const events = [
      event({ timestamp: NOW - 20 * WEEK_MS }),
      event({ name: 'other', timestamp: NOW }),
      event({ name: 'commit', timestamp: NOW }),
    ];

    // WHEN
    const result = sut.weeklyTrend(events, { weeks: 12, now: NOW, name: 'commit' });

    // THEN
    assert.equal(result.reduce((sum, b) => sum + b.count, 0), 1);
  });
});

describe('usageAnalytics.dayTrend', () => {
  it('returns 24 hourly buckets spanning the current day from 00:00 to 23:00', () => {
    // GIVEN — NOW is Wed 2026-07-15 12:00
    const events = [event({ timestamp: NOW })];

    // WHEN
    const result = sut.dayTrend(events, { now: NOW });

    // THEN
    assert.equal(result.length, 24);
    assert.equal(result[0].bucketStart, new Date(2026, 6, 15, 0).getTime());
    assert.equal(result[23].bucketStart, new Date(2026, 6, 15, 23).getTime());
    assert.equal(result[12].count, 1);
    assert.equal(result.reduce((sum, b) => sum + b.count, 0), 1);
  });

  it('excludes events from other days and filters by name', () => {
    // GIVEN — yesterday 12:00 plus two events today
    const events = [
      event({ timestamp: new Date(2026, 6, 14, 12, 0, 0).getTime() }),
      event({ name: 'other', timestamp: NOW }),
      event({ name: 'commit', timestamp: NOW }),
    ];

    // WHEN
    const result = sut.dayTrend(events, { now: NOW, name: 'commit' });

    // THEN
    assert.equal(result.reduce((sum, b) => sum + b.count, 0), 1);
  });
});

describe('usageAnalytics.weekTrend', () => {
  it('returns 7 daily buckets spanning the current week Monday to Sunday', () => {
    // GIVEN — NOW is Wed 2026-07-15; week is Mon 13 → Sun 19
    const events = [
      event({ timestamp: NOW }),
      event({ timestamp: new Date(2026, 6, 19, 22, 0, 0).getTime() }),
    ];

    // WHEN
    const result = sut.weekTrend(events, { now: NOW });

    // THEN
    assert.equal(result.length, 7);
    assert.equal(result[0].bucketStart, new Date(2026, 6, 13).getTime());
    assert.equal(result[6].bucketStart, new Date(2026, 6, 19).getTime());
    assert.equal(result[2].count, 1);
    assert.equal(result[6].count, 1);
  });

  it('excludes events from the previous week and filters by name', () => {
    // GIVEN — Sun 2026-07-12 was last week
    const events = [
      event({ timestamp: new Date(2026, 6, 12, 12, 0, 0).getTime() }),
      event({ name: 'other', timestamp: NOW }),
      event({ name: 'commit', timestamp: NOW }),
    ];

    // WHEN
    const result = sut.weekTrend(events, { now: NOW, name: 'commit' });

    // THEN
    assert.equal(result.reduce((sum, b) => sum + b.count, 0), 1);
  });
});

describe('usageAnalytics.monthTrend', () => {
  it('returns one daily bucket per day of the current month, 1st to last', () => {
    // GIVEN — July 2026 has 31 days
    const events = [
      event({ timestamp: new Date(2026, 6, 1, 9, 0, 0).getTime() }),
      event({ timestamp: new Date(2026, 6, 31, 23, 0, 0).getTime() }),
      event({ timestamp: new Date(2026, 5, 30, 12, 0, 0).getTime() }),
    ];

    // WHEN
    const result = sut.monthTrend(events, { now: NOW });

    // THEN
    assert.equal(result.length, 31);
    assert.equal(result[0].bucketStart, new Date(2026, 6, 1).getTime());
    assert.equal(result[30].bucketStart, new Date(2026, 6, 31).getTime());
    assert.equal(result[0].count, 1);
    assert.equal(result[30].count, 1);
    assert.equal(result.reduce((sum, b) => sum + b.count, 0), 2);
  });

  it('sizes the bucket list to the month length', () => {
    // GIVEN — February 2026 has 28 days
    const feb = new Date(2026, 1, 10, 12, 0, 0).getTime();
    const events = [];

    // WHEN
    const result = sut.monthTrend(events, { now: feb });

    // THEN
    assert.equal(result.length, 28);
  });
});

describe('usageAnalytics.dormant', () => {
  it('flags names last used strictly more than thresholdDays ago', () => {
    // GIVEN
    const events = [
      event({ name: 'old', timestamp: NOW - 31 * DAY_MS }),
      event({ name: 'edge', timestamp: NOW - 30 * DAY_MS }),
      event({ name: 'fresh', timestamp: NOW - DAY_MS }),
    ];

    // WHEN
    const result = sut.dormant(events, { thresholdDays: 30, now: NOW });

    // THEN
    assert.deepEqual(result.map((d) => d.name), ['old']);
    assert.equal(result[0].daysSince, 31);
  });

  it('uses the most recent usage per name', () => {
    // GIVEN — used long ago but also recently → not dormant
    const events = [
      event({ timestamp: NOW - 100 * DAY_MS }),
      event({ timestamp: NOW - DAY_MS }),
    ];

    // WHEN
    const result = sut.dormant(events, { thresholdDays: 30, now: NOW });

    // THEN
    assert.deepEqual(result, []);
  });
});

describe('usageAnalytics.coOccurrence', () => {
  it('counts a pair once per session it co-occurs in', () => {
    // GIVEN — a+b co-occur in s1 (twice within the session) and s2
    const events = [
      event({ name: 'a', sessionId: 's1', timestamp: 1 }),
      event({ name: 'b', sessionId: 's1', timestamp: 2 }),
      event({ name: 'a', sessionId: 's1', timestamp: 3 }),
      event({ name: 'a', sessionId: 's2', timestamp: 4 }),
      event({ name: 'b', sessionId: 's2', timestamp: 5 }),
    ];

    // WHEN
    const result = sut.coOccurrence(events, { minSessions: 2 });

    // THEN
    assert.deepEqual(result, [{ a: 'a', b: 'b', sessions: 2 }]);
  });

  it('drops pairs below minSessions and ignores single-name sessions', () => {
    // GIVEN
    const events = [
      event({ name: 'a', sessionId: 's1', timestamp: 1 }),
      event({ name: 'b', sessionId: 's1', timestamp: 2 }),
      event({ name: 'solo', sessionId: 's2', timestamp: 3 }),
    ];

    // WHEN
    const result = sut.coOccurrence(events, { minSessions: 2 });

    // THEN
    assert.deepEqual(result, []);
  });

  it('handles names containing spaces', () => {
    // GIVEN
    const events = [
      event({ name: 'my skill', sessionId: 's1', timestamp: 1 }),
      event({ name: 'other', sessionId: 's1', timestamp: 2 }),
      event({ name: 'my skill', sessionId: 's2', timestamp: 3 }),
      event({ name: 'other', sessionId: 's2', timestamp: 4 }),
    ];

    // WHEN
    const result = sut.coOccurrence(events, { minSessions: 2 });

    // THEN
    assert.deepEqual(result, [{ a: 'my skill', b: 'other', sessions: 2 }]);
  });
});

describe('usageAnalytics.sequences', () => {
  it('counts consecutive same-session transitions in timestamp order', () => {
    // GIVEN — inserted out of order to prove sorting
    const events = [
      event({ name: 'b', sessionId: 's1', timestamp: 2 }),
      event({ name: 'a', sessionId: 's1', timestamp: 1 }),
      event({ name: 'a', sessionId: 's2', timestamp: 3 }),
      event({ name: 'b', sessionId: 's2', timestamp: 4 }),
    ];

    // WHEN
    const result = sut.sequences(events, { minCount: 2 });

    // THEN
    assert.deepEqual(result, [{ from: 'a', to: 'b', count: 2 }]);
  });

  it('does not count transitions across sessions and skips self-transitions', () => {
    // GIVEN — a(s1) then b(s2) is not a transition; a→a is skipped
    const events = [
      event({ name: 'a', sessionId: 's1', timestamp: 1 }),
      event({ name: 'b', sessionId: 's2', timestamp: 2 }),
      event({ name: 'a', sessionId: 's3', timestamp: 3 }),
      event({ name: 'a', sessionId: 's3', timestamp: 4 }),
    ];

    // WHEN
    const result = sut.sequences(events, { minCount: 1 });

    // THEN
    assert.deepEqual(result, []);
  });
});

describe('usageAnalytics.durationStats', () => {
  it('averages only events that carry a finite durationMs', () => {
    // GIVEN — legacy events without durationMs must be ignored
    const events = [
      event({ name: 'timed', durationMs: 100 }),
      event({ name: 'timed', durationMs: 300 }),
      event({ name: 'timed' }),
      event({ name: 'legacy' }),
    ];

    // WHEN
    const result = sut.durationStats(events);

    // THEN
    assert.deepEqual(result, [{ name: 'timed', count: 2, avgMs: 200, medianMs: 200, maxMs: 300, minMs: 100 }]);
  });

  it('computes the median as the middle sample, robust to outliers', () => {
    // GIVEN — odd count where one outlier drags the average above the median
    const events = [
      event({ name: 'spiky', durationMs: 100 }),
      event({ name: 'spiky', durationMs: 300 }),
      event({ name: 'spiky', durationMs: 800 }),
    ];

    // WHEN
    const result = sut.durationStats(events);

    // THEN
    assert.equal(result[0].avgMs, 400);
    assert.equal(result[0].medianMs, 300);
  });

  it('returns empty array when no event has a duration', () => {
    // GIVEN
    const events = [event(), event({ name: 'other' })];

    // WHEN
    const result = sut.durationStats(events);

    // THEN
    assert.deepEqual(result, []);
  });
});

describe('usageAnalytics.perProject', () => {
  it('groups by projectPath with top names per project', () => {
    // GIVEN
    const events = [
      event({ projectPath: '/repo/a', name: 'x' }),
      event({ projectPath: '/repo/a', name: 'x' }),
      event({ projectPath: '/repo/a', name: 'y' }),
      event({ projectPath: null, name: 'z' }),
    ];

    // WHEN
    const result = sut.perProject(events);

    // THEN
    assert.equal(result.length, 2);
    assert.equal(result[0].projectPath, '/repo/a');
    assert.equal(result[0].count, 3);
    assert.deepEqual(result[0].topNames, ['x', 'y']);
    assert.equal(result[1].projectPath, '(unknown)');
  });
});

describe('usageAnalytics.buildReport', () => {
  it('assembles totals and all sections from one event array', () => {
    // GIVEN
    const events = [
      event({ name: 'commit', sessionId: 's1', timestamp: NOW - 2 * DAY_MS }),
      event({ name: 'review', sessionId: 's1', timestamp: NOW - 2 * DAY_MS + 1 }),
      event({ type: 'mcp_tool', name: 'mcp__db__query', sessionId: 's2', timestamp: NOW, projectPath: '/repo/b' }),
      event({ name: 'stale', sessionId: 's3', timestamp: NOW - 60 * DAY_MS }),
    ];

    // WHEN
    const report = sut.buildReport(events, { now: NOW });

    // THEN
    assert.equal(report.generatedAt, NOW);
    assert.equal(report.totals.events, 4);
    assert.equal(report.totals.skills, 3);
    assert.equal(report.totals.mcpTools, 1);
    assert.equal(report.totals.sessions, 3);
    assert.equal(report.totals.projects, 2);
    assert.equal(report.totals.firstEvent, NOW - 60 * DAY_MS);
    assert.equal(report.totals.lastEvent, NOW);
    assert.deepEqual(report.dormant.map((d) => d.name), ['stale']);
    assert.ok(Array.isArray(report.coUsed));
    assert.ok(Array.isArray(report.weekly));
    assert.equal(report.activity.day.length, 24);
    assert.equal(report.activity.week.length, 7);
    assert.equal(report.activity.month.length, 31);
  });

  it('handles an empty event array', () => {
    // GIVEN
    const events = [];

    // WHEN
    const report = sut.buildReport(events, { now: NOW });

    // THEN
    assert.equal(report.totals.events, 0);
    assert.equal(report.totals.firstEvent, null);
    assert.deepEqual(report.topSkills, []);
  });
});

describe('usageAnalytics.renderMarkdownReport', () => {
  it('renders all sections with data', () => {
    // GIVEN
    const events = [
      event({ name: 'commit', sessionId: 's1', timestamp: NOW - 1000, durationMs: 2500 }),
      event({ name: 'review', sessionId: 's1', timestamp: NOW }),
      event({ name: 'commit', sessionId: 's2', timestamp: NOW - 500 }),
      event({ name: 'review', sessionId: 's2', timestamp: NOW }),
    ];
    const report = sut.buildReport(events, { now: NOW });

    // WHEN
    const md = sut.renderMarkdownReport(report);

    // THEN
    assert.ok(md.includes('# Code Pet — Skill Usage Report'));
    assert.ok(md.includes('## Top Skills'));
    assert.ok(md.includes('| commit | 2 |'));
    assert.ok(md.includes('commit + review — 2 sessions'));
    assert.ok(md.includes('commit → review — 2×'));
    assert.ok(md.includes('2.5s'));
  });

  it('renders placeholder text for empty sections', () => {
    // GIVEN
    const report = sut.buildReport([], { now: NOW });

    // WHEN
    const md = sut.renderMarkdownReport(report);

    // THEN
    assert.ok(md.includes('_No skill usage recorded._'));
    assert.ok(md.includes('_No duration data yet'));
  });
});

describe('usageAnalytics.renderHtmlReport', () => {
  it('renders a self-contained document with all sections and charts', () => {
    // GIVEN
    const events = [
      event({ name: 'commit', sessionId: 's1', timestamp: NOW - 1000, durationMs: 2500 }),
      event({ name: 'review', sessionId: 's1', timestamp: NOW }),
      event({ name: 'commit', sessionId: 's2', timestamp: NOW - 500 }),
      event({ name: 'review', sessionId: 's2', timestamp: NOW }),
      event({ type: 'mcp_tool', name: 'mcp__db__query', sessionId: 's1', timestamp: NOW }),
    ];
    const report = sut.buildReport(events, { now: NOW });

    // WHEN
    const html = sut.renderHtmlReport(report);

    // THEN
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    for (const heading of [
      '<h2>Activity</h2>', 'Top Skills', 'Top MCP Tools', 'Dormant',
      'Often Used Together', 'Common Sequences', 'Per-Project Breakdown', 'Slowest Skills / Tools',
    ]) {
      assert.ok(html.includes(heading), `missing section: ${heading}`);
    }
    assert.ok(html.includes('<svg'), 'activity chart SVG missing');
    assert.ok(html.includes('bar-fill'), 'horizontal bar rows missing');
    assert.ok(html.includes('commit + review'), 'co-used pair missing');
    assert.ok(html.includes('2.5s'), 'duration missing');
  });

  it('renders the daily/weekly/monthly activity toggle with three charts and no scripts', () => {
    // GIVEN
    const report = sut.buildReport([event()], { now: NOW });

    // WHEN
    const html = sut.renderHtmlReport(report);

    // THEN
    assert.equal((html.match(/name="activity-view"/g) || []).length, 3, 'expected 3 view radios');
    assert.ok(html.includes('id="view-weekly" class="view-radio" checked'), 'weekly view not the default');
    for (const label of ['>Today<', '>This Week<', '>This Month<']) {
      assert.ok(html.includes(label), `missing toggle label: ${label}`);
    }
    assert.equal((html.match(/<svg/g) || []).length, 3, 'expected exactly 3 activity SVGs');
    assert.ok(!html.includes('<script'), 'the report must stay script-free (sandboxed iframe)');
  });

  it('renders an average/max/min toggle in the durations section', () => {
    // GIVEN — two timed names with different avg vs max ordering:
    // slow-avg: avg 500, max 500; spiky: avg 300, max 900
    const events = [
      event({ name: 'slow-avg', sessionId: 's1', timestamp: NOW, durationMs: 500 }),
      event({ name: 'spiky', sessionId: 's1', timestamp: NOW, durationMs: 100 }),
      event({ name: 'spiky', sessionId: 's1', timestamp: NOW, durationMs: 200 }),
      event({ name: 'spiky', sessionId: 's1', timestamp: NOW, durationMs: 900 }),
    ];
    const report = sut.buildReport(events, { now: NOW });

    // WHEN
    const html = sut.renderHtmlReport(report);

    // THEN
    assert.equal((html.match(/name="duration-view"/g) || []).length, 4, 'expected 4 duration radios');
    assert.ok(html.includes('id="dur-avg" class="view-radio" checked'), 'average view not the default');
    for (const label of ['>Average<', '>Median<', '>Max<', '>Min<']) {
      assert.ok(html.includes(label), `missing toggle label: ${label}`);
    }
    const avgView = html.slice(html.indexOf('view view-avg'), html.indexOf('view view-med'));
    const medView = html.slice(html.indexOf('view view-med'), html.indexOf('view view-max'));
    const maxView = html.slice(html.indexOf('view view-max'), html.indexOf('view view-min'));
    assert.ok(avgView.indexOf('slow-avg') < avgView.indexOf('spiky'), 'avg view sorts by average');
    assert.ok(maxView.indexOf('spiky') < maxView.indexOf('slow-avg'), 'max view sorts by max');
    // spiky: median 200 vs slow-avg: median 500 — median view puts slow-avg first
    assert.ok(medView.indexOf('slow-avg') < medView.indexOf('spiky'), 'median view sorts by median');
    assert.ok(medView.includes('200ms'), 'median value rendered');
    assert.ok(html.includes('900ms'), 'max value rendered');
    assert.ok(html.includes('100ms'), 'min value rendered');
  });

  it('renders axis tick labels under the bars instead of an axis row', () => {
    // GIVEN — NOW is Wed 2026-07-15
    const report = sut.buildReport([event()], { now: NOW });

    // WHEN
    const html = sut.renderHtmlReport(report);

    // THEN
    assert.ok(!html.includes('axis-row'), 'old two-endpoint axis row must be gone');
    const week = html.match(/<div class="view view-w">(.*?)<\/div>/s)[1];
    assert.equal((week.match(/class="tick"/g) || []).length, 7, 'week view labels every day');
    assert.ok(week.includes('>Mon 13<'), 'week starts at Monday');
    assert.ok(week.includes('>Sun 19<'), 'week ends at Sunday');
    const day = html.match(/<div class="view view-d">(.*?)<\/div>/s)[1];
    assert.equal((day.match(/class="tick"/g) || []).length, 6, 'day view labels every 4th hour');
    assert.ok(day.includes('>00:00<'), 'day starts at midnight');
    assert.ok(day.includes('>20:00<'), 'day ticks reach 20:00');
    const month = html.match(/<div class="view view-m">(.*?)<\/div>/s)[1];
    assert.equal((month.match(/class="tick"/g) || []).length, 7, 'month view labels every 5th day');
    assert.ok(month.includes('>Jul 1<'), 'month starts at the 1st');
    assert.ok(month.includes('>Jul 31<'), 'month ends at the 31st');
  });

  it('has no external references (self-containment)', () => {
    // GIVEN
    const report = sut.buildReport([event()], { now: NOW });

    // WHEN
    const html = sut.renderHtmlReport(report);

    // THEN
    assert.ok(!/https?:\/\//.test(html), 'external URL found');
    assert.ok(!/src=/.test(html), 'external resource reference found');
    assert.ok(!/<link/.test(html), 'external stylesheet found');
  });

  it('is dark-only, matching the app chrome', () => {
    // GIVEN
    const report = sut.buildReport([event()], { now: NOW });

    // WHEN
    const html = sut.renderHtmlReport(report);

    // THEN
    assert.ok(!html.includes('prefers-color-scheme'), 'report must not theme-switch — the app is dark-only');
    assert.ok(html.includes('#1e1e2e'), 'app page background missing');
    assert.ok(html.includes('#89b4fa'), 'app accent color missing');
  });

  it('escapes HTML in names', () => {
    // GIVEN
    const hostile = '<img src=x onerror=alert(1)>';
    const events = [
      event({ name: hostile, sessionId: 's1', timestamp: NOW, durationMs: 100 }),
      event({ name: 'other', sessionId: 's1', timestamp: NOW - 1 }),
      event({ name: hostile, sessionId: 's2', timestamp: NOW - 60 * DAY_MS, projectPath: '<b>/p</b>' }),
    ];
    const report = sut.buildReport(events, { now: NOW });

    // WHEN
    const html = sut.renderHtmlReport(report);

    // THEN
    assert.ok(!html.includes(hostile), 'raw hostile name leaked into markup');
    assert.ok(html.includes('&lt;img'), 'escaped name not found');
  });

  it('renders placeholders for an empty report without dividing by zero', () => {
    // GIVEN
    const report = sut.buildReport([], { now: NOW });

    // WHEN
    const html = sut.renderHtmlReport(report);

    // THEN
    assert.ok(html.includes('No skill usage recorded.'));
    assert.ok(html.includes('No duration data yet'));
    assert.ok(!html.includes('NaN'));
    assert.ok(!html.includes('Infinity'));
  });
});

describe('usageAnalytics.formatMs', () => {
  it('formats milliseconds, seconds and minutes', () => {
    // GIVEN
    const cases = [
      [850, '850ms'],
      [2500, '2.5s'],
      [130000, '2m 10s'],
      [179800, '3m 0s'],
    ];

    // WHEN / THEN
    for (const [ms, expected] of cases) {
      assert.equal(sut.formatMs(ms), expected);
    }
  });
});

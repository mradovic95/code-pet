#!/usr/bin/env node
'use strict';

/**
 * Dev utility: append fake usage events to usage.log so the settings Usage
 * tab and the exportable report have realistic data to render. Covers the
 * three tracked event types: skill, mcp_tool, and subagent (spawns with
 * durations). Subagent runs tag their inner events with agentId+agentType,
 * with a small share left untyped to emulate older CLI versions.
 *
 * Usage:
 *   node scripts/generate-fake-usage.js                        # ~1000 events, last 90 days
 *   node scripts/generate-fake-usage.js --count 500            # custom batch size
 *   node scripts/generate-fake-usage.js --days 60              # custom time window
 *   node scripts/generate-fake-usage.js --path /tmp/usage.log  # custom target file
 *
 * Appends (never truncates) NDJSON lines matching UsageEvent.toJSON():
 *   { type, name, timestamp, sessionId, projectPath, durationMs?, agentId?, agentType? }
 * Safe to run multiple times — each run adds another batch.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// --- CLI ---------------------------------------------------------------

function parseArgs(argv) {
  const args = { count: 1000, days: 90, path: path.join(os.homedir(), '.code-pet', 'usage.log') };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--count') { args.count = parseInt(value, 10); i++; }
    else if (flag === '--days') { args.days = parseInt(value, 10); i++; }
    else if (flag === '--path') { args.path = value; i++; }
    else {
      console.error(`Unknown argument: ${flag}`);
      console.error('Usage: node scripts/generate-fake-usage.js [--count N] [--days N] [--path FILE]');
      process.exit(1);
    }
  }
  if (!Number.isFinite(args.count) || args.count < 1) args.count = 1000;
  if (!Number.isFinite(args.days) || args.days < 1) args.days = 90;
  return args;
}

// --- Catalog (weighted) --------------------------------------------------

const SKILLS = [
  { name: 'update-schema', weight: 30, minMs: 5000, maxMs: 240000 },
  { name: 'er-diagram', weight: 20, minMs: 10000, maxMs: 180000 },
  { name: 'run-local', weight: 18, minMs: 3000, maxMs: 120000 },
  { name: 'data-dictionary', weight: 12, minMs: 8000, maxMs: 150000 },
  { name: 'ubiquitous-language', weight: 8, minMs: 5000, maxMs: 90000 },
];

const MCP_TOOLS = [
  { name: 'mcp__plugin_acme_database__execute_query', weight: 28, minMs: 100, maxMs: 8000 },
  { name: 'mcp__plugin_acme_bitbucket__bb_get', weight: 14, minMs: 200, maxMs: 4000 },
  { name: 'mcp__plugin_acme_playwright__browser_snapshot', weight: 10, minMs: 500, maxMs: 10000 },
  { name: 'mcp__plugin_acme_playwright__browser_click', weight: 8, minMs: 100, maxMs: 3000 },
  { name: 'mcp__plugin_acme_database__list_connections', weight: 5, minMs: 100, maxMs: 1500 },
];

const AGENTS = [
  { name: 'Explore', weight: 30, minMs: 10000, maxMs: 180000 },
  { name: 'general-purpose', weight: 20, minMs: 20000, maxMs: 240000 },
  { name: 'Plan', weight: 15, minMs: 30000, maxMs: 300000 },
  { name: 'acme:code-reviewer', weight: 10, minMs: 60000, maxMs: 300000 },
  { name: 'claude-code-guide', weight: 8, minMs: 10000, maxMs: 60000 },
];

// Only ever emitted with timestamps older than the dormant threshold (30+ days)
// so the Dormant section always has entries.
const DORMANT = [
  { name: 'prd-language-check', type: 'skill', minMs: 5000, maxMs: 60000 },
  { name: 'mcp__plugin_acme_figma__authenticate', type: 'mcp_tool', minMs: 500, maxMs: 5000 },
];

const HOME = os.homedir();
const PROJECTS = [
  { path: path.join(HOME, 'my_projects', 'code-pet'), weight: 30 },
  { path: path.join(HOME, 'my_projects', 'acme-core'), weight: 25 },
  { path: path.join(HOME, 'my_projects', 'acme-admin'), weight: 20 },
  { path: path.join(HOME, 'my_projects', 'marketplace-api'), weight: 15 },
  { path: path.join(HOME, 'my_projects', 'infra-scripts'), weight: 10 },
];

// Recurring workflows biased into sessions so Sequences / Often Used Together
// have clear winners. Each entry is an ordered run of names.
const SEQUENCE_PATTERNS = [
  ['er-diagram', 'update-schema'],
  ['run-local', 'mcp__plugin_acme_database__execute_query'],
  ['data-dictionary', 'ubiquitous-language'],
];

const NAME_TO_ENTRY = new Map(
  [...SKILLS.map((s) => [s.name, { ...s, type: 'skill' }]),
   ...MCP_TOOLS.map((t) => [t.name, { ...t, type: 'mcp_tool' }])]
);

// --- Random helpers ------------------------------------------------------

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeighted(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  return entries[entries.length - 1];
}

function fakeId(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

// A timestamp on a random day within [daysAgoMax, daysAgoMin] days back,
// during working hours (9:00–19:00 local), biased toward recent days.
function workdayTimestamp(now, daysAgoMin, daysAgoMax) {
  // Squaring skews toward 0 (recent) — denser activity in recent weeks.
  const span = daysAgoMax - daysAgoMin;
  const daysAgo = daysAgoMin + Math.floor(Math.pow(Math.random(), 2) * span);
  const day = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
  day.setHours(randInt(9, 18), randInt(0, 59), randInt(0, 59), 0);
  return day.getTime();
}

// --- Event generation ----------------------------------------------------

function makeEvent(entry, timestamp, sessionId, projectPath, agentId) {
  const event = {
    type: entry.type,
    name: entry.name,
    timestamp,
    sessionId,
    projectPath,
  };
  if (entry.minMs != null && Math.random() < 0.7) event.durationMs = randInt(entry.minMs, entry.maxMs);
  if (agentId) event.agentId = agentId;
  return event;
}

// One subagent run: inner events (what the agent did) tagged with the run's
// agentId/agentType, then the spawn's own `subagent` event at run end —
// matching real recording semantics, where everything lands at PostToolUse
// and the spawn completes after the calls made inside it.
function generateSubagentRun(startTs, sessionId, project) {
  const agent = pickWeighted(AGENTS);
  const agentId = fakeId('agent');
  const durationMs = randInt(agent.minMs, agent.maxMs);
  // A small share of runs emulates an older CLI that sends agent_id but not
  // agent_type — those inner events group under 'unknown' in the analytics.
  const agentType = Math.random() < 0.1 ? null : agent.name;
  const events = [];

  const innerCount = randInt(2, 6);
  let ts = startTs + Math.floor(durationMs / (innerCount + 1));
  for (let i = 0; i < innerCount; i++) {
    const pool = Math.random() < 0.4 ? SKILLS : MCP_TOOLS;
    const entry = NAME_TO_ENTRY.get(pickWeighted(pool).name);
    const event = makeEvent(entry, ts, sessionId, project, agentId);
    if (agentType) event.agentType = agentType;
    events.push(event);
    ts += Math.floor(durationMs / (innerCount + 1));
  }

  events.push({
    type: 'subagent',
    name: agent.name,
    timestamp: startTs + durationMs,
    sessionId,
    projectPath: project,
    durationMs,
  });
  return events;
}

function generateSession(now, days) {
  const sessionId = fakeId('fake');
  const project = pickWeighted(PROJECTS).path;
  const size = randInt(5, 15);
  const events = [];

  let ts = workdayTimestamp(now, 0, days - 1);

  // Ordered list of names for this session: maybe a recurring pattern first,
  // then weighted random picks.
  const names = [];
  if (Math.random() < 0.5) {
    const pattern = SEQUENCE_PATTERNS[randInt(0, SEQUENCE_PATTERNS.length - 1)];
    names.push(...pattern);
  }
  while (names.length < size) {
    const pool = Math.random() < 0.55 ? SKILLS : MCP_TOOLS;
    names.push(pickWeighted(pool).name);
  }

  for (const name of names) {
    const entry = NAME_TO_ENTRY.get(name);
    events.push(makeEvent(entry, ts, sessionId, project, null));
    ts += randInt(5, 300) * 1000; // 5s–5min between tracked invocations
  }

  // Some sessions delegate part of the work to subagents.
  if (Math.random() < 0.4) {
    const runs = randInt(1, 2);
    for (let i = 0; i < runs; i++) {
      const run = generateSubagentRun(ts, sessionId, project);
      events.push(...run);
      ts = run[run.length - 1].timestamp + randInt(60, 600) * 1000;
    }
  }
  return events;
}

// A few old sessions using only dormant names, all older than 35 days.
function generateDormantEvents(now, days) {
  const events = [];
  const oldestDay = Math.max(days - 1, 40);
  for (const entry of DORMANT) {
    const sessionId = fakeId('fake');
    const project = pickWeighted(PROJECTS).path;
    let ts = workdayTimestamp(now, 35, oldestDay);
    for (let i = 0; i < randInt(3, 8); i++) {
      events.push(makeEvent(entry, ts, sessionId, project, null));
      ts += randInt(30, 600) * 1000;
    }
  }
  return events;
}

// --- Main ----------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = Date.now();

  const events = generateDormantEvents(now, args.days);
  const sessions = new Set(events.map((e) => e.sessionId));
  while (events.length < args.count) {
    const session = generateSession(now, args.days);
    events.push(...session);
    sessions.add(session[0].sessionId);
  }
  events.sort((a, b) => a.timestamp - b.timestamp);

  fs.mkdirSync(path.dirname(args.path), { recursive: true });
  const lines = events.map((e) => JSON.stringify(e) + '\n').join('');
  fs.appendFileSync(args.path, lines);

  const projects = new Set(events.map((e) => e.projectPath));
  const first = new Date(events[0].timestamp).toISOString().slice(0, 10);
  const last = new Date(events[events.length - 1].timestamp).toISOString().slice(0, 10);
  const sizeKb = (fs.statSync(args.path).size / 1024).toFixed(1);
  console.log(
    `Appended ${events.length} events (${sessions.size} sessions, ${projects.size} projects, ` +
    `${first} → ${last}) to ${args.path} (${sizeKb} KB total)`
  );
}

main();

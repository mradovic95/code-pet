# Usage Tracking

Code Pet records every `Skill` invocation, every `mcp__*` tool call, and
every subagent spawn (`Task`/`Agent` tool) into a local, append-only log so
the Settings → Usage tab can show counts that survive Electron restarts.
Other built-in tools (Read, Bash, Edit, …) are deliberately not recorded —
they are high volume and add little analytical value. This document is the
operator / contributor reference for the persistence layer.

Code lives in [`src/tracking/`](../src/tracking/) — a self-contained
package with no Electron dependency.

## Where the data lives

`~/.code-pet/usage.log` — newline-delimited JSON (NDJSON), one event per
line, appended forever. The file never leaves the machine.

Disable persistence (events stay in-memory only) by setting the env var:

```bash
USAGE_STORE_TYPE=memory npx electron src/app/main.js
```

The flag is read once at app startup in `src/app/main.js` (alongside the
other env vars catalogued in [`feature-flags.md`](feature-flags.md)).

## Event shape

Each line is a JSON object. Defined in
[`src/tracking/usage-event.js`](../src/tracking/usage-event.js):

| Field | Type | Meaning |
|-------|------|---------|
| `type` | `"skill" \| "mcp_tool" \| "subagent"` | Event category (`subagent` = Task/Agent tool spawn). Old logs may also contain `"builtin"` lines from a prior opt-in tracking feature; these are ignored by the insight sections. |
| `name` | string | Skill name (e.g. `"commit"`), full MCP tool name (e.g. `"mcp__database__query"`), or subagent type (e.g. `"Explore"`, `"code-reviewer"`; `"unknown"` when the payload has no `subagent_type`) |
| `timestamp` | number | `Date.now()` at record time, UTC milliseconds |
| `sessionId` | string (UUID) | Identifies one `PetContext` lifetime — usually one Claude Code session |
| `projectPath` | string \| null | Absolute path of the project the event originated from. `null` when the project context was not yet bound (e.g. older lines written before this field existed). |
| `durationMs` | number *(optional)* | Wall-clock time from the tool's PreToolUse to its PostToolUse. Absent on lines written before duration tracking, and whenever no matching start was found. **Includes human wait time** on permission prompts (PreToolUse fires before the prompt). |
| `agentId` | string *(optional)* | Present only when the tool ran inside a subagent — distinguishes main-agent from subagent usage. |
| `agentType` | string *(optional)* | Type of the subagent the tool ran inside (e.g. `"Explore"`, plugin-scoped like `"my-plugin:reviewer"`), from the hook payload's `agent_type` field. Absent on main-agent events, on lines written before this field existed, and on Claude Code versions that don't send it (those events group under `unknown` in the analytics breakdown). See [`agent-type-attribution-investigation.md`](agent-type-attribution-investigation.md). |

Example line:

```json
{"type":"skill","name":"commit","timestamp":1744723200000,"sessionId":"7c2f1d40-1f8e-4d62-9b3a-1c8c1f3e9b2c","projectPath":"/Users/me/repos/foo","durationMs":8421}
```

## Duration pairing

`hooks/scripts/on-pre-tool-use.js` (PreToolUse, matcher
`Skill|Task|Agent|mcp__.*`) sends an `action_started` event. Built-in tools
are excluded from the matcher (and are not tracked at all). The server
handles it **before** the state
machine (early return in `event-server.js`) — it never changes pet state.
`PetContext.noteToolStart()` stamps a start time in an in-memory map, and
the matching PostToolUse `action_completed` resolves it via
`PetContext.resolveToolDuration()` into the `durationMs` persisted on the
usage event.

Pairing key: `tool_use_id` when the hook payload carries one, otherwise
`tool:<toolName>`. Each key holds a FIFO queue of start times, so overlapping
calls that share a name-fallback key pair oldest-start-to-first-completion
rather than the newest start clobbering the rest. As of 2026-07 the official
hooks docs do **not** document a `tool_use_id` field, so the name-keyed
fallback is the effective path — concurrent same-name tool calls in one
session can still mis-attribute a duration to the wrong call, but no start is
silently dropped. Leak controls: entries expire after 10
minutes and the map is capped at 50 pending starts per pet — both overridable
via the `CODE_PET_TOOL_START_TTL_MS` and `CODE_PET_MAX_PENDING_TOOL_STARTS`
env vars (read once at app start in `src/app/state-machine/pet-context.js`;
see `feature-flags.md`). Nothing is written to `usage.log`
for the pre event itself — log volume is unchanged.

## Why no rotation, no size cap

The whole point of this file is preserving cross-session history. At ~100
bytes per event and human-paced traffic, the file grows roughly 10–20
MB/year — irrelevant on any modern disk.

If size ever becomes a real problem, the right fix is **time-based
archival** (`usage.2026.log`) that **keeps** history, not a rolling cap that
deletes it. See the rationale block in
[`src/tracking/stores/filesystem-store.js`](../src/tracking/stores/filesystem-store.js).

## Reading the log

The file is plain NDJSON, so any line-oriented tool works.

Top 10 skills by count:

```bash
jq -s 'map(select(.type=="skill"))
       | group_by(.name)
       | map({name: .[0].name, count: length})
       | sort_by(-.count)
       | .[0:10]' \
   ~/.code-pet/usage.log
```

Top MCP tools today:

```bash
jq -s --argjson cutoff "$(date -v-1d +%s000 2>/dev/null || date -d '1 day ago' +%s000)" \
   'map(select(.type=="mcp_tool" and .timestamp >= $cutoff))
    | group_by(.name)
    | map({name: .[0].name, count: length})
    | sort_by(-.count)' \
   ~/.code-pet/usage.log
```

Programmatic access in Node:

```js
const { createStore } = require('./src/tracking');
const store = createStore({ type: 'filesystem' });
const recent = await store.readAll({ type: 'skill', since: Date.now() - 7 * 24 * 3600 * 1000 });
```

`readAll` accepts `{ type, since, limit }`.

## Analytics

[`src/tracking/usage-analytics.js`](../src/tracking/usage-analytics.js) is a
pure aggregation module over event arrays — no I/O, no Node APIs. It is
`require()`d in the main process / tests and loaded via `<script>` in the
settings renderer (as `window.usageAnalytics`), which is why it uses a
dual-export guard. The Settings → Usage tab uses it for the Skill Insights,
Weekly Activity, Often Used Together, and Dormant views, plus the
"View Report" preview window. The Skill Insights table is a framed table with a
fixed column header (`Skill`, `Trend`, `Avg`, `Used`, `Runs`) over its five
columns: skill name, an 8-week sparkline (`weeklyTrend`), average duration
(`durationStats`), last-used relative time, and invocation count.

Functions (all take an event array; time-dependent ones accept an
injectable `now`):

- `summarizeByName(events, {type})` — count, first/last used, distinct projects, session count per name
- `weeklyTrend(events, {weeks, now, name})` — zero-filled weekly buckets (weeks start Monday, local time)
- `topN(events, {type, n})`, `dormant(events, {thresholdDays, now})`
- `dayTrend(events, {now, name})`, `weekTrend(events, {now, name})`, `monthTrend(events, {now, name})` — calendar-bucketed activity for the current day / week / month (hourly, daily, daily respectively)
- `coOccurrence(events, {minSessions})` — unordered name pairs counted **once per session** they co-occur in
- `sequences(events, {minCount})` — consecutive same-session transitions A→B
- `durationStats(events)` — avg/median/max/min `durationMs` per name (events without the field are ignored)
- `agentSplit(events)` — `{ total, tagged, pct, byType }` share of events carrying an `agentId` (ran inside a subagent); `byType` counts tagged events per `agentType` (`unknown` when untyped)
- `perProject(events)`, `buildReport(events)` — `buildReport` bundles the above into one object (including `topAgents`, the top-10 `subagent` names with run/session counts and durations, plus `agentSplit`); `renderMarkdownReport(report)`,
  `renderHtmlReport(report)` — the HTML variant is a fully self-contained
  document (inline CSS + SVG charts, no external requests, dark-mode aware).
  The View Report button opens the rendered HTML in a dedicated preview
  window (`src/app/report-window.js`); its toolbar has explicit
  "Save as HTML" / "Save as Markdown" buttons. Both rendered variants are
  held in the main process while the window is open, so the saved file is
  always the pristine renderer output — the preview toolbar can't leak in.

Definitions worth knowing:

- **Dormant** = the name appears in the log but its last use is older than
  30 days. Code Pet has no inventory of *installed* skills, so a skill that
  was never invoked at all is invisible — dormant ≠ never-used.
- **Co-occurrence / sequences** are proxies for "skill flow", not a call
  graph: only workflow events (skills, MCP tools, subagent spawns) are
  visible, so "consecutive" means consecutive *tracked* invocations — any
  built-in tools (Read, Bash, Edit, …) in between are invisible because they
  are not tracked.

## Concurrency model

`FilesystemStore.append()` is fire-and-forget from the caller's
perspective: writes are serialized through a single-flight Promise chain
inside the store, so concurrent `append()` calls cannot interleave into
torn lines, and the hot path (state machine event handling) never blocks
on disk I/O.

Errors are logged via `src/app/logger.js` (when available) and swallowed —
the contract is "never throw to the caller". A failing disk does not crash
the pet.

`UsageTracker` calls `store.append(event)` from `record()`. `flush()` is
called once on `before-quit` in `main.js` to drain pending writes before
the app exits.

## Swapping the backend

The `UsageStore` contract has four async methods:

```js
class UsageStore {
  async append(event) {}
  async readAll(filter = {}) { return []; }
  async flush() {}
  async close() {}
}
```

Defined in [`src/tracking/usage-store.js`](../src/tracking/usage-store.js).
To add a new backend (e.g. SQLite, S3, a remote analytics endpoint):

1. Create `src/tracking/stores/<name>-store.js` that extends `UsageStore`
   and implements the four methods. Mirror
   [`filesystem-store.js`](../src/tracking/stores/filesystem-store.js) for
   structure.
2. Add a case to the `switch` in `createStore()` at
   [`src/tracking/usage-store.js`](../src/tracking/usage-store.js).
3. Document the new `USAGE_STORE_TYPE` value in
   [`feature-flags.md`](feature-flags.md).

No other code changes — `UsageTracker`, `PetContext`, `PetRegistry`,
`event-server.js`, and `main.js` are all backend-agnostic.

## Tests

- [`test/unit/tracking/filesystem-store.test.js`](../test/unit/tracking/filesystem-store.test.js) — append, read filters, malformed-line tolerance, 500-event concurrent-append fuzz
- [`test/unit/tracking/memory-store.test.js`](../test/unit/tracking/memory-store.test.js) — no-op semantics
- [`test/unit/tracking/usage-store.test.js`](../test/unit/tracking/usage-store.test.js) — factory + base class
- [`test/unit/tracking/usage-tracker.test.js`](../test/unit/tracking/usage-tracker.test.js) — store-injection wiring, extra-field threading
- [`test/unit/tracking/usage-analytics.test.js`](../test/unit/tracking/usage-analytics.test.js) — all aggregation functions (fixed timestamps, injected `now`)
- [`test/unit/pet-registry.test.js`](../test/unit/pet-registry.test.js) — store threading through `PetContext`
- [`test/unit/state-machine/pet-context.test.js`](../test/unit/state-machine/pet-context.test.js) — duration pairing map (TTL, cap, single-resolve)
- [`test/integration/hook-pre-tool-use.test.js`](../test/integration/hook-pre-tool-use.test.js) — PreToolUse stdin → HTTP `action_started` contract

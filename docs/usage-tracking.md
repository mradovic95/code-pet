# Usage Tracking

Code Pet records every `Skill` invocation and every `mcp__*` tool call into a
local, append-only log so the Settings → Usage tab can show counts that
survive Electron restarts. This document is the operator / contributor
reference for the persistence layer.

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

Each line is a JSON object with exactly four fields. Defined in
[`src/tracking/usage-event.js`](../src/tracking/usage-event.js):

| Field | Type | Meaning |
|-------|------|---------|
| `type` | `"skill" \| "mcp_tool"` | Event category |
| `name` | string | Skill name (e.g. `"commit"`) or full MCP tool name (e.g. `"mcp__database__query"`) |
| `timestamp` | number | `Date.now()` at record time, UTC milliseconds |
| `sessionId` | string (UUID) | Identifies one `PetContext` lifetime — usually one Claude Code session |

Example line:

```json
{"type":"skill","name":"commit","timestamp":1744723200000,"sessionId":"7c2f1d40-1f8e-4d62-9b3a-1c8c1f3e9b2c"}
```

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
- [`test/unit/tracking/usage-tracker.test.js`](../test/unit/tracking/usage-tracker.test.js) — store-injection wiring
- [`test/unit/pet-registry.test.js`](../test/unit/pet-registry.test.js) — store threading through `PetContext`

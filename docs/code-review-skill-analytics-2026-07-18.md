# Code review: `feat/skill-analytics` — 2026-07-18

> **Status update (same day):** all ten bugs (B1–B10) were fixed on this branch, with regression tests for each behavioral fix. Suite: 281 tests, 0 failures. The "What else could be done" items remain open, except the `formatMs` hours tier (done with B1), the print stylesheet (B6), and the Markdown escaping (B2).

## Scope

Branch `feat/skill-analytics` vs `main`: 4 commits, 37 files, +3284/−77.

- `ef95266` feat(analytics): skill usage insights, exportable report, and duration tracking
- `1fcd57c` feat(analytics): open usage report in dedicated preview window
- `056044a` feat(analytics): interactive usage report with calendar activity views
- `abc68f7` docs(analytics): document the interactive usage report in README and CHANGELOG

New surface reviewed: `src/tracking/usage-analytics.js` (aggregation + HTML/Markdown report), `src/app/report-window.js` + `report-preload.js` + `src/renderer/report-preview.*` (preview window), `hooks/scripts/on-pre-tool-use.js` + duration pairing in `pet-context.js`, `save-usage-file` in `window-manager.js`, settings Usage tab, `scripts/generate-fake-usage.js`, and the new/extended tests.

**Test suite at review time: 276 tests, 77 suites, 0 failures** (`npm test`, this machine).

## Verdict

The branch is in good shape and is safe to merge after the two high-severity fixes below. Highlights: the HTML report path escapes every user-derived string, the preview iframe is fully sandboxed (`sandbox=""`, no `allow-scripts`), the exported HTML is genuinely self-contained, tests are hermetic (fixed clock, tmpdir-only IO), old log lines without `durationMs`/`agentId` parse fine, and the new PreToolUse hook auto-registers for existing users via `hooks.json` on plugin update. The bugs found are edge cases and asymmetries, not design flaws.

## Bugs

Ordered by severity. All file:line references verified against the branch by direct read, not just reviewer report, for B1–B5.

### B1 (high) — `formatMs` still has the "60s" rounding bug one unit down
`src/tracking/usage-analytics.js:307-317`. The branch fixed "2m 60s" → "3m 0s" in the minute branch, but the sub-minute branch is untouched:

```js
if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
```

`toFixed(1)` rounds, so any `durationMs` in `[59950, 60000)` renders as `"60.0s"` instead of `"1m 0s"`. Affects every duration display (avg/median/min/max, tooltips, exports). Same defect class the branch claimed to fix.

**Fix:** normalize with carry in one place (round to whole seconds first, then derive units). While there, consider an hours tier: a 65-minute run currently reads `"65m 0s"`.

### B2 (high) — Markdown export does not escape names
`src/tracking/usage-analytics.js:356-459` (`renderMarkdownReport`). Every skill/MCP name, project label, and pair/sequence name is interpolated raw:

```js
lines.push(`| ${s.name} | ${s.count} | ${s.sessionCount} | ${formatDate(s.lastUsed)} |`);
```

Names originate from `input.tool_name` in `on-pre-tool-use.js:28`, i.e. from third-party MCP servers. A tool named with `|` corrupts every table it appears in; a name containing HTML (`<img onerror=…>`) passes through to whatever Markdown renderer the user pastes the export into — many render inline HTML. The HTML report path escapes everything via `escapeHtml` (`usage-analytics.js:461`); the Markdown path is the one unguarded asymmetry.

**Fix:** escape `|`, backticks, angle brackets, and newlines in a small `escapeMd()` applied at the same interpolation points the HTML path escapes.

### B3 (medium) — `weeklyTrend` uses fixed-millisecond week stepping; DST off-by-one
`src/tracking/usage-analytics.js:73-88`. Buckets are seeded with `currentWeek - i * WEEK_MS` (fixed 168 h), then keyed through `weekStartOf`. The comment on lines 90-92 explains that `bucketTrend` deliberately uses Date-constructor stepping to stay DST-safe — `weeklyTrend` predates that helper and was never converted. When the 12-week trend or an 8-week sparkline window spans a DST transition, one computed week start lands an hour off a real Monday midnight, `weekStartOf` collapses two iterations onto the same key, and the `index.set` overwrite double-counts one week and zeroes its neighbor. The stored `weekStart` label is also un-normalized, so the tooltip date can be off by one. Twice-a-year wrong bar shapes in the settings Usage tab and the report.

**Fix:** reimplement `weeklyTrend` on top of `bucketTrend` with `bucketAt: (i) => new Date(y, m, d + 7*i)` from a normalized Monday.

### B4 (medium) — `closeReportWindow` is exported but never called; report window orphans
`src/app/report-window.js:80-88`. Grep confirms the only occurrences are the definition and the export. Closing the Settings window (or quitting via the app's teardown path) never closes the report window, which lingers as a parentless window holding `reportContents` in main until the user closes it by hand. (Retention is bounded — the `closed` handler at lines 71-74 does clear state — so this is UX/lifecycle, not a leak.)

**Fix:** call `closeReportWindow()` from the settings-window close path and app quit.

### B5 (medium) — `docs/installation.md` not updated for the seventh hook
`docs/installation.md:10, 39, 41-48, 156, 174-180, 372`. The doc still says "six lifecycle hooks" throughout, omits `PreToolUse`/`on-pre-tool-use.js` from the registration and runtime tables, and the `/event` body shape omits the new `toolUseId`/`agentId` fields. `CLAUDE.md` and `docs/hook-table.md` were updated correctly; `installation.md` was missed.

### B6 (low/medium) — exported HTML report is dark-only with no print stylesheet
`src/tracking/usage-analytics.js:652-709`. The self-contained export is the artifact users will share and archive, but printing or Save-as-PDF from a browser produces dark pages or (with browser background stripping) light-grey `--muted` text on white.

**Fix:** add an `@media print` block that flips to light background / dark ink.

### B7 (low) — concurrent same-name tool calls without `tool_use_id` mis-pair durations
`src/app/state-machine/pet-context.js:69-99`. Pairing key is `toolUseId || 'tool:'+name`. If two invocations of the same tool overlap and the payload carries no `tool_use_id` (the code's own comments note PreToolUse may omit it), the second start overwrites the first's timestamp: the first completion records a too-short duration, the second records none. Normal Claude Code payloads include the id, so exposure is low — but the edge is real and untested (see test gaps).

### B8 (low) — hourly buckets collide on DST-transition days
`src/tracking/usage-analytics.js:110-118`. `bucketAt: (i) => new Date(y, m, d, i)` for i=0..23: on spring-forward day the nonexistent 2 AM normalizes to 3 AM, so two buckets share a key and the index overwrite blanks one. The lines 90-92 comment's DST-safety claim holds for day boundaries, not hourly ones. Cosmetic, two days a year, "Today" view only.

### B9 (low) — save failures surface as a bare "Failed"
Main correctly returns the cause (`{ saved: false, error: err.message }`, `report-window.js:39-52`; same shape in `window-manager.js` `save-usage-file`), but the renderers discard it: `report-preview.js:15` and `settings.js:743` only set the button text to "Failed". Permission-denied vs disk-full vs read-only path are indistinguishable to the user.

### B10 (low, cosmetic) — report window background can flash light on light-mode OS
`src/app/report-window.js:61`: `backgroundColor` follows `nativeTheme`, but the toolbar and report content are always dark. On macOS light mode the window paints `#f9f9f7` before the dark content loads.

### Corrected during verification (not bugs)

- **CHANGELOG "8-week sparkline" is accurate.** A reviewer flagged it against the module default `weeks = 12` (`usage-analytics.js:73`), but `settings.js:973` passes `weeks: 8` for per-skill sparklines; the 12-week default feeds the separate overall Activity trend (`settings.js:932`). No doc/code mismatch.
- **`save-report` does not swallow errors in main** — it returns them; the gap is renderer-side display only (folded into B9).

## Checked and found correct

Recording these so they aren't re-flagged in future reviews.

- **HTML injection:** `escapeHtml` (`usage-analytics.js:461`) is applied at every interpolation of user-derived strings in the HTML report — bar lists, table cells, dormant entries, SVG `<title>`/aria labels, subtitle, footer. Tests assert an injected `<img onerror=…>` name does not survive (`usage-analytics.test.js:622-638`).
- **Preview window security:** `contextIsolation: true`, `nodeIntegration: false`, minimal preload; the report renders inside an iframe with `sandbox=""` (no `allow-scripts`) via `srcdoc` (`report-preview.html:51`). Even a hypothetical escaping gap cannot execute script in the preview.
- **Self-contained export:** system font stack, inline styles/SVG, no `<script>`, no external URLs — asserted by tests (`usage-analytics.test.js:538, 596-607`). Pure-CSS toggles use unique IDs, correct sibling selectors, and a default `:checked`; radio toggling works under `sandbox=""` (no `allow-forms` needed).
- **Window lifecycle:** repeated View Report clicks reuse the existing window (`report-window.js:23-29`); IPC handlers are module-scoped, registered once — no listener accumulation.
- **Math:** `durationStats` creates entries only when a finite duration exists — no empty-array median, no divide-by-zero; even-length median averages the middle pair. `buildReport([])` and all render paths guard empty data.
- **Log robustness:** `FilesystemStore.readAll` skips malformed lines per-line and single-flights writes; old-format lines without `durationMs`/`agentId` are handled everywhere via finite-number gates.
- **Pairing hygiene:** `_pendingToolStarts` is in-memory, TTL-pruned (10 min default) and capped (50, FIFO) — unmatched starts cannot grow unbounded; untracked-tool completions never fabricate durations.
- **Hook rollout:** the `PreToolUse` block in `hooks/hooks.json:60-71` means existing users get the hook automatically on plugin update; no installer or settings template changes needed.
- **Tests are hermetic:** fixed `NOW`, explicit `now:` params, no real `~/.code-pet` reads, tmpdir-only file IO, timezone-consistent assertions.
- **`generate-fake-usage.js`** exercises every report section: durations (70% of events), `agentId` attribution, 5 projects, dedicated dormant set (≥35 days old, robust to small `--days`), sequence patterns.
- **README claims verified accurate**, including "charts and toggles keep working offline".

## Test gaps

1. **`save-usage-file` IPC handler has zero tests** (`src/app/window-manager.js:129-144`) — including its `path.basename()` default-filename sanitization and error branches. Its sibling `save-report` is fully tested (`report-window.test.js`); mirror that suite.
2. **Concurrent same-name pairing without `tool_use_id`** (B7) — tests cover single pairing, name-fallback single, and cap eviction, but never two overlapping same-name starts.
3. **TTL-expiry branch** of `resolveToolDuration` and the prune loop (`pet-context.js:77-79, 95-96`) — the cap override is tested; the time-based TTL is not (needs a clock override).
4. **DST-transition-day bucketing** (B3, B8) — all trend tests use non-transition dates.
5. **Renderer scripts** (`settings.js`, `report-preview.js`) are untested — consistent with the repo's existing convention and mitigated by the sandboxed iframe; noted for completeness.

## What else could be done

Improvements beyond the bug fixes, roughly in value order.

1. **Unify `weeklyTrend` onto `bucketTrend`** (fixes B3 at the root and removes the second bucketing implementation, so the two can't drift again).
2. **Carry-normalizing `formatMs` with an hours tier** (fixes B1; "1h 5m" beats "65m 0s" in a view whose whole point is spotting slow tools).
3. **Time-window or stream the log read.** `readAll` slurps the entire `usage.log` (unbounded by design) into memory and the renderer holds every event. A default window (e.g. last 90 days, with an "all time" opt-in) keeps the report fast on multi-year logs.
4. **Show duration coverage.** Durations exist only for calls whose start paired with a completion; the Slowest view silently averages that subset. A "timed N of M runs" label (data already present: `count` vs total uses) prevents misreading.
5. **Cap unbounded report sections.** Dormant, Per-Project, and Slowest render every entry (Top lists cap at 10, pairs/sequences at 15). Cap with "and N more" so a power user with thousands of names gets a usable file.
6. **Timezone consistency in exports.** The UI and HTML/Markdown reports use local time; NDJSON/CSV exports emit UTC `toISOString()`. Cross-referencing around midnight mismatches — pick one or label the timezone.
7. **CHANGELOG note on the update window:** an existing user who updates the plugin gets the PreToolUse hook immediately, but duration capture starts only after the Electron process restarts (the documented "Electron is NOT auto-replaced" trap). Harmless and self-healing, worth one sentence so it isn't reported as a bug.
8. **Surface save-error reasons** (B9): pass the already-returned `error` string to a tooltip/toast instead of the bare "Failed".

## Suggested merge gate

Fix B1 and B2 (small, localized, high value) and update `installation.md` (B5) before merge; B3/B4/B6 are good fast-follows; the rest can ride the backlog with the test-gap items.

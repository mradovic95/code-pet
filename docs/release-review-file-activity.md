# Release review — `feat/file-activity-view`

Analysis only. No code was changed as part of this review.

- **Branch:** `feat/file-activity-view` (18 commits ahead of `main`, 0 behind — clean fast-forward)
- **Merge base:** `b700dc7 release: v0.2.0`
- **Reviewed at:** `410143d Bump electron from 42.2.0 to 43.2.0`, plus 4 then-uncommitted files
- **Diff size:** 88 files, +4251 / −512

---

## 1. What changed

### 1.1 New feature — Files tab (the bulk of the branch)

A settings tab answering "which files and directories did this project's sessions touch most", sourced by parsing
Claude Code session transcripts on demand rather than by adding hooks.

| Piece | File | Note |
|-------|------|------|
| Transcript parser | `src/tracking/transcript-reader.js` (new, 260 lines) | Walks `~/.claude/projects/<encoded>/*.jsonl` **and** `<session>/subagents/agent-*.jsonl`; extracts `Read`/`Edit`/`Write`/`NotebookEdit` paths |
| Pure aggregator | `src/tracking/file-activity.js` (new, 281 lines) | Top files/dirs, per-session, `agentSplit`, `modeSplit`, `topOrientFiles`, `topReadOnlyFiles`, `topRereadFiles`, `sortFiles` |
| IPC bridge | `src/app/windows/window-manager.js` `get-file-activity` | Takes no argument; main resolves the project from `currentSettingsProjectPath` |
| UI | `src/renderer/tabs/file-activity.html`, `settings.js` (+460) | Session / Agent / Mode filters, sortable Top Files headers |

Delivered incrementally across five commits: base tab → subagent walk → plan/exec split → context-tax lists → column
sorting.

**Nothing is persisted.** No new writes to `usage.log`, no new hooks, no network calls. Reads happen only when the tab
is opened or Refresh is clicked.

### 1.2 New feature — subagent + agent-type usage tracking

- `hooks.json` PreToolUse matcher widened `Skill|mcp__.*` → `Skill|Task|Agent|mcp__.*`
- `Task`/`Agent` spawns recorded as `subagent` usage events, named by `subagent_type`, with paired durations
- `UsageEvent` gains an optional `agentType` field (from the hook payload's `agent_type`)
- Usage tab: Agent Insights and MCP Insights tables added; the three plain name+count lists removed as strict subsets
- Report gains Top Agents + main-vs-subagent split

### 1.3 Refactor — `src/app/` subsystem folders

21 flat files → `pet/`, `server/`, `windows/`, `marketplace/`, `core/`, with `main.js` alone at the root. Pure
relocation (git records them as renames with ≤4-line require-path edits). `test/unit/` mirrors the layout.

Two load-bearing paths were handled correctly: `main.js` stayed at `src/app/main.js`, and both hook scripts that
`require()` the process manager by absolute join were updated to `src/app/core/process-manager`.

### 1.4 Dependency and CI

- `electron` 42.2.0 → 43.2.0
- `actions/checkout` and `actions/setup-node` v6 → v7
- `bump-version.js` now bumps `package-lock.json` too; CI `version-sync` job checks it

### 1.5 Documentation

CLAUDE.md (+407), CHANGELOG, README, `docs/feature-flags.md` (all moved paths corrected), plus three new investigation
docs. Documentation is unusually thorough and matches the code as written.

---

## 2. Release-safety verdict

**Safe to release as `0.3.0` (minor).** No blocking defects found.

`minor` is the right bump: new features, no breaking change to any hook contract, event name, IPC channel, or on-disk
format. `usage.log` gains an optional `agentType` field; old lines without it parse unchanged.

### Evidence

| Check | Result |
|-------|--------|
| `npm test` | **362 pass / 0 fail**, 84 suites, 2.6 s (Node 22.17.0) |
| `npm audit` (all + prod) | **0 vulnerabilities** |
| Version sync (`package.json` / lock / lock.packages / plugin.json / marketplace.json) | all `0.2.0` — CI `version-sync` job passes |
| CHANGELOG `[Unreleased]` non-empty | Yes — `promote-changelog.js` will not abort |
| `actions/checkout@v7`, `actions/setup-node@v7` exist upstream | Verified via GitHub API (`v7.0.1`, `v7.0.0`) |
| Electron 43 breaking changes applicable to this code | None. Only `dialog.showSaveDialog` Downloads default and `NativeImage.toBitmap()` could apply; `report-window.js:45` already passes an explicit `defaultPath`, and nothing calls `toBitmap()` |
| New code using post-Node-18 APIs | None (`Object.groupBy`, `structuredClone`, `toSorted`, `findLast`, … all absent) |
| Renderer isolation | `contextIsolation: true`, `nodeIntegration: false` unchanged; `file-activity.js` correctly dual-exported and wired in `settings.html` |
| Privacy posture | Preserved — transcript reads are on-demand, in-memory, never written or transmitted |

### Before releasing

- **Watch for a dependabot collision.** `origin/dependabot/github_actions/actions/setup-node-7` exists and makes the
  same v7 change this branch makes by hand. Expect a conflicting or auto-closing PR.
- Merge to `main`, then run the release workflow with `minor`.

---

## 3. Findings

### 3.1 Files tab degrades on Windows — highest-value finding

`file-activity.js` splits paths on `/` only (`relativePath` line 30, `dirOf` line 47, `insideProject` line 40).
Verified against the real aggregator with Windows-shaped input:

```
projectPath = C:\proj
  topFiles          → ["C:\other\b.js", "C:\proj\src\a.js"]   (no project-relative shortening)
  topDirs           → [{ dir: ".", total: 4 }]                 (every directory collapses to one row)
  topReadOnlyFiles  → both files, including the out-of-project one

projectPath = /proj  (same events, POSIX)
  topFiles          → ["/other/b.js", "src/a.js"]
  topDirs           → [{ dir: "/other", … }, { dir: "src", … }]
  topReadOnlyFiles  → ["src/a.js"]  ← out-of-project correctly excluded
```

Three consequences, in descending severity:

1. **Top Directories is dead on Windows** — one `.` row holding every touch.
2. **The context-tax lists violate their own documented contract.** `insideProject()` identifies an out-of-project
   path by a leading `/`; a Windows absolute path starts `C:`, so the guard always returns `true` and *Read, Never
   Edited* / *Re-read in One Context* will indict files the project does not own. CLAUDE.md states these lists
   exclude such paths.
3. Top Files shows unshortened absolute paths.

Not a crash, not a regression to any existing feature, and the platform-independent parts (subagent walk, plan/exec
split, agent split, sorting, session grouping) work fine. `encodedProjectDir` is unaffected — it replaces every
non-alphanumeric char, so `C:\Users\x\proj` → `C--Users-x-proj` as Claude Code writes it.

No test covers a Windows-shaped path in either `file-activity.test.js` or `transcript-reader.test.js`, which is why
CI's `windows-latest` leg is green: the fixtures are POSIX strings, so the tests exercise POSIX behaviour on every OS.

**Options:** ship as-is and file an issue (the tab is additive and no existing behaviour regresses), or normalize
separators once at the aggregator boundary. The latter is a small change confined to three helpers plus
`insideProject`'s absolute-path test.

### 3.2 The transcript read blocks the Electron main process

`readFileEvents` fans out over every session with `Promise.all` and no concurrency cap; each `parseTranscript` does a
full `fsp.readFile(…, 'utf8')`, then `split('\n')`, then `JSON.parse` per line. Measured on real transcript corpora:

| Project | Transcripts | Wall time | Peak RSS |
|---------|-------------|-----------|----------|
| `code-pet` | 78 MB, 156 files | 282 ms | ~354 MB |
| `platform-knowledge-base` | 123 MB | 1600 ms | ~277 MB |

The overlay animation is unaffected (separate renderer process), but the HTTP event server lives in main, and
`send-event.js` uses a **1000 ms timeout** (`hooks/scripts/send-event.js:69`). A hook firing during a large read can
time out. Consequences are contained by design — hook errors are swallowed and a missed `action_completed` is
cosmetic — but on a very large corpus the pet can visibly miss a state change while the tab loads.

This only happens on explicit user action (opening the tab / Refresh), which is why it is a finding and not a blocker.
If it matters, the fix is a small concurrency limit over `sessions` in `readFileEvents` — it bounds peak memory too.

### 3.3 Pre-existing: `engines` mismatch

`electron@43.2.0` declares `engines: { node: ">= 22.12.0" }` while `package.json` declares `node: ">=18.0.0"` and CI
runs a Node 18/20/22 matrix. **Not introduced by this branch** — `electron@42.2.0` declared the same constraint. With
no `.npmrc` setting `engine-strict`, npm warns (`EBADENGINE`) rather than failing, and Electron ships its own Node
runtime at execution time. Worth resolving eventually; irrelevant to this release.

### 3.4 Minor

- `package.json` pins `"electron": "43.2.0"` exactly while CLAUDE.md documents `^43.0.0`. Cosmetic, pre-existing style
  mismatch.
- `sortFiles()`'s default direction is `desc` for every key including `path`; the documented "File column starts A→Z"
  behaviour comes from `settings.js:797`, not the aggregator. Correct as wired, but a second caller would get
  descending paths by default.

---

## 4. Notes on quality

Worth recording, because it shortened this review considerably:

- Every non-obvious decision in the new code carries a comment explaining *why*, not what — the order-dependence of
  `planMode`, the `(sessionId, agentId)` re-read window, sorting before the top-N slice, resolving the project in main
  rather than accepting it from the renderer.
- Measured justifications rather than assertions: 21% of touches from subagents, 48 mis-tagged touches without the
  `ExitPlanMode` boundary, 78 of 96 never-edited files read exactly once, 403 vs 110 re-reads per session vs per
  context.
- 952 lines of new tests for ~540 lines of new tracking code.
- The `src/app/` refactor kept both load-bearing paths (`main.js`, `core/process-manager.js`) intact — the two places
  where a silent break would only show up outside the test suite.

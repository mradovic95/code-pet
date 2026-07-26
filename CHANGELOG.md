# Changelog

All notable changes to Code Pet will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Files** tab in Settings: an on-demand view of which files and directories
  a project's Claude Code sessions read and edited most. Sourced by parsing the
  session transcripts (`~/.claude/projects/<project>/*.jsonl`) *and* the subagent
  transcripts beneath them (`<session-id>/subagents/agent-*.jsonl`) on request —
  no hooks, no new persistence, nothing recorded to `usage.log`. Three
  independent filters: a Session filter (like the Usage tab's) defaulting to
  `All sessions` — the whole project — and narrowing to one session when picked;
  an Agent filter scoping to the main agent or to subagents; and a Mode filter
  scoping to plan mode or to execution. Shows Top Files — read/edit/write plus
  the plan/execution breakdown, each as its own labelled fixed-width column
  under a table header matching the Usage tab's insight tables (all four Files
  lists carry one) — Top Directories, a main-vs-subagent split, a
  plan-vs-execution split, **By Agent Type** — which kinds of subagent read the
  most — and **Read to Orient**, files ranked by plan-mode reads with the number
  of distinct sessions that needed each, i.e. what this project costs to
  understand before any work happens. Subagent work was ~21% of file touches
  when measured, nearly all reads, so it is counted rather than dropped; folding
  it into the plan/execution axis is what shows 35% of file activity happening
  in plan mode rather than 19%. Complements the hook-based Usage tab; see
  `docs/file-directory-metrics-investigation.md` and
  `docs/file-activity-metrics-extensions-investigation.md`
- Subagent spawn tracking: `Task`/`Agent` tool calls are now recorded as
  `subagent` usage events with the agent type as name (e.g. `Explore`,
  `code-reviewer`) and paired durations (PreToolUse matcher widened to
  `Skill|Task|Agent|mcp__.*`). The report gains a **Top Agents** section
  (runs, sessions, average duration) and a main-vs-subagent split — the
  share of tracked calls that ran inside subagents
- **Agents** section in Settings → Usage: per-agent-type run counts alongside
  the existing MCP Tools and Skills lists, narrowed by the same
  period/project/session filters. The Event Log now carries a distinct badge
  per tracked event type (MCP, Skill, Agent) so the new subagent events are
  labelled correctly
- Agent-type attribution: usage events for tool calls made inside a subagent
  now record `agentType` (e.g. `Explore`, `my-plugin:reviewer`) from the hook
  payload's documented `agent_type` field; the report's Top Agents table gains
  a **Calls inside** column and the main-vs-subagent split a per-type
  breakdown. On Claude Code versions that don't send the field, events simply
  stay untyped as before (see `docs/agent-type-attribution-investigation.md`)
- **Agent Insights** table in Settings → Usage: a rich per-agent-type view
  (8-week trend, average spawn duration, a **calls-inside** count of the
  skill/MCP calls that ran inside each agent, and run count) plus a delegation
  headline (`N% of tracked calls ran inside subagents`). Surfaces the report's
  Top Agents / `agentSplit` metrics in the live tab, at parity with Skill
  Insights, narrowed by the same period/project/session filters
- **MCP Insights** table in Settings → Usage: MCP tools get the same rich view
  as Skill Insights (8-week trend, average duration, last-used, call count),
  with long tool names truncated (full name on hover)

### Changed
- Reorganized `src/app/` from 21 flat files into five subsystem folders —
  `pet/` (registry, catalog, state machine), `server/` (the HTTP event server),
  `windows/` (BrowserWindows, preloads, and the helpers only they use),
  `marketplace/` (purchase/license/download, including its HTTP client) and
  `core/` (utilities every subsystem shares: logger, process manager, settings
  store) — with `main.js` alone at the root. Pure relocation: no behavior
  change, no renames, no file splitting. `test/unit/` mirrors the new layout.
  Dependencies point inward, `server/`/`windows/` → `pet/` → `core/`, so the pet
  domain stays free of transport and `core/` depends on nothing above it
- The **Skill Insights** table in Settings → Usage is now a framed table with a
  fixed column header (`Skill`, `Trend`, `Avg`, `Used`, `Runs`) so the five
  columns — name, 8-week sparkline, average duration, last-used and invocation
  count — are labelled instead of distinguished only by colour. The header stays
  fixed while the rows scroll beneath it
- Consolidated the Usage tab: the three plain name+count lists (MCP Tools,
  Skills, Agents) are replaced by the three rich Insights tables (Skill, MCP,
  Agent), which are supersets of them — removing duplicate listings
- Event Log type badges (`AGENT` / `MCP` / `SKILL`) in Settings → Usage now share
  a uniform width, so the tool-name column lines up across rows instead of
  shifting with each badge's label length

## [0.2.0] - 2026-07-19

### Added
- Skill analytics in the Settings → Usage tab: per-skill summary with usage
  count, average duration, last-used and an 8-week sparkline; overall weekly
  activity chart; "often used together" skill pairs (same-session
  co-occurrence); and dormant-skill detection (used before, but not in the
  last 30 days) — all computed from the existing `usage.log`, no new data
  collection (see `docs/usage-tracking.md`)
- Skill-usage optimization report (top skills, dormant candidates, co-used
  pairs, common sequences, per-project breakdown, slowest skills) opened in a
  dedicated preview window via **View Report** in Settings → Usage, with
  explicit **Save as HTML** / **Save as Markdown** buttons — the saved HTML
  page is fully self-contained (no scripts, no external resources) and keeps
  its interactive toggles
- Interactive Activity chart in the HTML report with a Today / This Week /
  This Month toggle over calendar periods (current day 00–24 by hour, current
  week Mon–Sun, current month 1st–last day), per-bar tooltips, and axis tick
  labels aligned under the bars. The toggle is pure CSS (hidden radios), so it
  works inside the sandboxed preview iframe and in saved HTML files
- Average / Median / Max / Min toggle on the Slowest Skills / Tools section —
  each view re-sorts by its own metric; duration stats now include median and
  minimum alongside average and max
- Report and preview window restyled to match the app's dark theme (same
  palette, typography, and section styling as the Settings window)
- Per-skill/MCP-tool duration tracking: a new PreToolUse hook (scoped to the
  Skill tool and `mcp__*` tools only) pairs with the tool's completion to
  persist `durationMs` on usage events; tool calls made inside subagents are
  attributed via `agentId`. Older log lines without these fields remain valid

### Removed
- **Export NDJSON** button from Settings → Usage — it duplicated data already
  on disk: the raw event log lives at `~/.code-pet/usage.log` in the same
  NDJSON format. Copy CSV and View Report remain for filtered/derived views

### Fixed
- Durations of almost-whole minutes no longer format as "2m 60s" — the
  seconds remainder now rolls over into the minute ("3m 0s")

## [0.1.2] - 2026-07-14

### Fixed
- No more phantom pets for subfolders of the active project — hook scripts now
  identify the project by `CLAUDE_PROJECT_DIR` (the stable session root)
  instead of the hook process cwd, which drifts whenever a Bash tool call runs
  `cd <subdir>` mid-session and previously registered a new pet per drifted
  path (see `docs/subfolder-pet-investigation.md`)
- Pet no longer sleeps through background subagents — when the main agent's
  turn ends while a background subagent keeps working, the subagent's
  tool events (tagged with `agent_id`) now wake the pet back to
  working/planning; it returns to idle after the wrap-up turn's Stop
  (see `docs/background-subagents-investigation.md`)
- Ending one session no longer kills the shared pet app for other concurrent
  sessions — the SessionEnd hook now confirms the server is genuinely
  unreachable with a health-check probe before tearing down an orphaned
  Electron process, so a briefly-slow server (a 1s `falling_asleep` timeout)
  is no longer mistaken for a dead one (see `docs/bug-audit-2026-07-13.md`)

## [0.1.1] - 2026-07-12

### Fixed
- Pet no longer disappears on `/clear` or `/resume` — the SessionEnd hook now
  reads the `reason` field and only sends `falling_asleep` on real session
  terminations (terminal exit, logout)

### Security
- Bump transitive dependency `undici` to 7.28.0 to resolve seven high-severity
  advisories (GHSA-vmh5-mc38-953g and others) that failed the CI audit job

## [0.1.0] - 2026-02-23

### Added
- Initial release
- Three pets: Dog, Cat, Bird
- Real-time Claude Code state tracking (idle, working, planning, waiting for action)
- Transparent, click-through, always-on-top overlay
- Waking up animation on session start
- Plan mode auto-detection
- Cross-platform support (macOS, Linux, Windows)
- Settings window with pet selection (double-click to open)
- Multi-project support (one pet per active Claude Code session)
- Lazy Electron installation on first run
- Persistent usage tracking of skill and MCP tool events
  (`~/.code-pet/usage.log`, NDJSON; disable with `USAGE_STORE_TYPE=memory`)
- Community and policy files: `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `CONTRIBUTING.md` with issue-first PR policy, PR template
- CI/CD with automated version sync and release workflow

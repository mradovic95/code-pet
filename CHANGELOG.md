# Changelog

All notable changes to Code Pet will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

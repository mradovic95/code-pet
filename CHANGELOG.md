# Changelog

All notable changes to Code Pet will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

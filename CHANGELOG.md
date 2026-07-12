# Changelog

All notable changes to Code Pet will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

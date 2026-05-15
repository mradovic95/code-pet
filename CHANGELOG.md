# Changelog

All notable changes to Code Pet will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Persistent usage tracking — skill and MCP tool events are now appended to
  `~/.code-pet/usage.log` (NDJSON, append-only) so cross-session analytics
  survive Electron restarts.
- New `UsageStore` abstraction in `src/tracking/` with `MemoryStore` and
  `FilesystemStore` backends. Swappable via the `USAGE_STORE_TYPE` env var
  (`filesystem` default, `memory` to disable persistence). See
  [`docs/usage-tracking.md`](docs/usage-tracking.md) for the data format and
  swap recipe.
- Public-release housekeeping files: `CODE_OF_CONDUCT.md` (Contributor
  Covenant 2.1), `SECURITY.md` (private email disclosure channel with
  explicit in/out-of-scope), `.github/PULL_REQUEST_TEMPLATE.md`, and
  `.gitattributes` (LF normalization + binary markers for image/audio assets).
- README first-impression polish: project status line above "Why Code Pet?",
  `CHANGELOG.md` pointer under the badges, Privacy blockquote in the
  usage-tracking section, troubleshooting link in the Install section,
  descriptive `alt` text on every image, an Acknowledgments section, and a
  community footer (`⭐ Star · 🐛 Report a bug · 💡 Request a feature`).

### Changed
- Starter pet roster is now bird, cat, dog. Panda and Dolphin are premium
  pets available only through the in-app marketplace.
- `PremiumStore.download()` now requires a real marketplace API and
  `productId`. The filesystem-based dev fallback was removed; mock mode
  (`MARKETPLACE_MOCK=true`) can still test license activation but no longer
  renders purchased pets.
- Marketplace pets now download into `~/.code-pet/pets/{id}/` — a user-data
  directory that survives `claude plugin upgrade` and reinstall. Shipped
  starter pets still live under the plugin's `assets/pets/`. `PetCatalog`
  scans both roots; renderer uses each manifest's pre-built `_dirUrl` (a
  `file://` URL computed in main via `pathToFileURL` for cross-platform
  correctness), so shipped vs downloaded is transparent to rendering. The
  parallel data-URI plumbing between main process and renderer is gone.
- `PremiumStore` takes a base directory via constructor:
  `new PremiumStore('~/.code-pet/pets')`.
- `PetCatalog` accepts multiple roots via repeated `scan()` calls and has a
  new `rescan()` helper that replays all previously scanned roots (used after
  a license activation downloads new pets).
- Added startup recovery: any owned pet missing from `~/.code-pet/pets/`
  (e.g. after the user wipes the user-data dir) is redownloaded from the
  marketplace using the persisted license key. The marketplace catalog is
  primed synchronously before recovery so productIds resolve.
- `_downloadRemote` now also fetches `manifest.icon` (default `icon.png`)
  alongside sprite files. Missing icon logs a warning and continues.
- Author / owner metadata in `package.json`, `.claude-plugin/plugin.json`,
  and `.claude-plugin/marketplace.json` upgraded from bare strings to
  `{ name, email, url }` objects. Keyword lists expanded with
  `claude-code-plugin`, `pet`, `desktop-pet`, `electron`, `productivity`.
- `CONTRIBUTING.md` and the README "Contributing" section rewritten to make
  the **issue-first PR policy** explicit: bug reports and feature requests
  welcome via issues; code PRs accepted on a case-by-case basis but require
  a prior issue.
- README pet showcase trimmed to the 3 free pets (Dog, Cat, Bird) for the
  first public release.

### Removed
- `assets/pets-dev/` — premium pet sprite templates are no longer shipped in
  the repo. They now live only on the marketplace server and are downloaded
  to `~/.code-pet/pets/{id}/` after purchase.
- `PremiumStore._downloadLocal()` and the `DEV_ASSETS_DIR` constant.
- `PremiumStore.loadSprites()` and `PremiumStore._mimeForFile()` — the
  renderer reads files directly off disk now.
- `PetCatalog.scanPremium()` — a single `scan()` handles both free and
  premium pets. Tier is read from `manifest.tier` as before.
- The `premium-sprites` IPC channel, `onPremiumSprites` in the preload
  bridge, `setPremiumSprites` and the `_premiumSprites` cache in
  `pet-manager.js`, and the `spriteDataUris` parameter in `injectPetStyles`.
  `get-premium-sprites` IPC handler removed from `window-manager.js`.
- Dragon and Panda entries from `scripts/generate-placeholders.js` (the
  script now generates free pets only).
- XOR obfuscation of premium sprites on disk. Since the marketplace serves
  plaintext bytes and the license key sits next to the files, the
  obfuscation was security theater — removed along with `deriveKey`,
  `xorBuffer`, and `_shouldEncrypt`.
- `src/app/store-config.js` — abandoned LemonSqueezy scaffold. Never wired;
  the live payment path uses `MarketplaceAPI` (custom REST API) instead.
- `scripts/uninstall.js` — never invoked from `package.json`, hooks, or CI.
  Manual cleanup steps remain in `docs/installation.md`.
- `docs/ui-ux-improvements.md` — stale UI/UX backlog. Remaining ideas can be
  migrated to GitHub issues if useful.
- Marketing GIFs in `assets/docs/pets/dolphin/` and `assets/docs/pets/panda/`.
  Premium pet showcase deferred until the marketplace ships.

## [0.1.0] - 2025-02-23

### Added
- Initial release
- Five pets: Dog, Cat, Panda, Dolphin, Bird
- Real-time Claude Code state tracking (idle, working, planning, waiting for action)
- Transparent, click-through, always-on-top overlay
- Waking up animation on session start
- Plan mode auto-detection
- Cross-platform support (macOS, Linux, Windows)
- Settings window with pet selection (double-click to open)
- Multi-project support (one pet per active Claude Code session)
- Lazy Electron installation on first run
- CI/CD with automated version sync and release workflow

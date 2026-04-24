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

### Changed
- Starter pet roster is now bird, cat, dog. Panda and Dolphin are premium
  pets available only through the in-app marketplace.
- `PremiumStore.download()` now requires a real marketplace API and
  `productId`. The filesystem-based dev fallback was removed; mock mode
  (`MARKETPLACE_MOCK=true`) can still test license activation but no longer
  renders purchased pets.
- Premium pets now download into `assets/pets/{id}/` alongside the free
  starter pets. The split into `~/.code-pet/premium-pets/` is gone, along
  with the parallel data-URI plumbing between main process and renderer.
- `PremiumStore` takes a base directory via constructor: `new PremiumStore(petsDir)`.
- Added startup recovery: any owned pet missing from `assets/pets/` (e.g.
  after plugin reinstall) is redownloaded from the marketplace using the
  persisted license key. The marketplace catalog is primed synchronously
  before recovery so productIds resolve.
- `_downloadRemote` now also fetches `manifest.icon` (default `icon.png`)
  alongside sprite files. Missing icon logs a warning and continues.

### Removed
- `assets/pets-dev/` — premium pet sprite templates are no longer shipped in
  the repo. They now live only on the marketplace server and are downloaded
  to `assets/pets/{id}/` after purchase.
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

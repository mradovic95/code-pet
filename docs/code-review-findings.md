# Code Review Findings

Comprehensive code review performed on 2026-04-04. Tracking all findings and fix status.

---

## Summary

| Priority | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| Must Fix | 5     | 5     | 0         |
| Should Fix | 4   | 3     | 1         |
| Fine for v1 | 11 | 0     | 11        |
| **Total** | **20** | **8** | **12**  |

---

## Must Fix (before distribution)

| # | Status | File(s) | Issue | Details |
|---|--------|---------|-------|---------|
| 1 | :white_check_mark: | `hooks/scripts/send-event.js:15` | Windows broken — Unix `ps` called on every hook | Added `if (process.platform === 'win32') return null;` guard in `captureTty()`. |
| 2 | :white_check_mark: | `hooks/scripts/on-session-start.js` | No first-run feedback | Added stderr message when Electron is installing: "Code Pet: Installing Electron (~85MB), pet will appear on next session..." |
| 3 | :white_check_mark: | `hooks/scripts/bootstrap.js` | No install error recovery | `isElectronInstalled()` now verifies the actual Electron binary exists, not just the package.json. |
| 4 | :white_check_mark: | `scripts/uninstall.js` | No cleanup on uninstall | Created `scripts/uninstall.js` that kills Electron, removes `~/.code-pet/` and `node_modules/`. |
| 5 | :white_check_mark: | `scripts/bump-version.js` | Version out of sync risk | Created `scripts/bump-version.js` that updates version in all 3 manifest files. |

---

## Should Fix (important but won't break users)

| # | Status | File(s) | Issue | Details |
|---|--------|---------|-------|---------|
| 6 | :white_check_mark: | `src/app/process-manager.js` | SIGTERM on Windows kills abruptly | Added `killProcess()` helper that uses `taskkill` on Windows, `SIGTERM` elsewhere. Both `stopApp()` fallback paths now use it. |
| 7 | :white_check_mark: | `src/app/window-manager.js:286-290` | Linux workspace visibility | Added `setVisibleOnAllWorkspaces(true)` for Linux (without macOS-specific `visibleOnFullScreen` option). |
| 8 | :white_check_mark: | `hooks/scripts/bootstrap.js:47` | Bootstrap TOCTOU race condition | `startInstall()` now uses `{ flag: 'wx' }` for atomic lock file creation. If another process already created it, returns early instead of overwriting. |
| 9 | :x: | `src/app/premium-store.js:12-22` | XOR "encryption" for premium pets | XOR cipher is trivially breakable. If charging money for premium pets, this provides zero real protection. Fix: use `crypto.createCipheriv()` with a proper algorithm (AES-256-GCM). |

---

## Fine for v1 (can ship with these)

| # | Status | File(s) | Issue | Details |
|---|--------|---------|-------|---------|
| 10 | :x: | `src/renderer/pet-styles.js:31,35`, `src/renderer/pet.js:148` | Path traversal in renderer | `petType`/`sprite.file` interpolated directly into file paths and CSS URLs. Low risk since manifests come from own plugin, not user input. |
| 11 | :x: | `src/app/settings-preload.js:8-17` | Sync IPC blocks renderer | `ipcRenderer.sendSync()` used for multiple operations. Freezes UI if main process is slow. Settings window opened rarely, so minor. |
| 12 | :x: | `src/renderer/pet.js:150` | Silent audio failures | `audio.play().catch(() => {})` swallows all errors without even a console.log. |
| 13 | :x: | `package.json` | Missing devDependencies/CI | No linter, formatter, test runner, or GitHub Actions configured. Doesn't affect users. |
| 14 | :x: | `src/app/terminal-focus.js` | Terminal focus is macOS-only | Uses `osascript` (AppleScript). Linux/Windows not supported. Acceptable documented limitation. |
| 15 | :x: | Multiple files | Magic numbers without constants | Timing values (250ms, 200ms, 300ms debounce, etc.) scattered across files without named constants. |
| 16 | :x: | `src/app/event-server.js:43-56` | JSON parse error returns 500 | Malformed JSON hits generic 500 handler instead of proper 400 response. |
| 17 | :x: | `src/app/window-manager.js:16,236-242` | Unbounded event queue | `eventQueue` grows without limit if renderer is slow to connect. No max size. |
| 18 | :x: | `src/app/license-manager.js:84-133` | Race condition in license validation | Concurrent `activate()`/`validate()` calls can mutate `this._license` simultaneously without locking. |
| 19 | :x: | `src/app/license-manager.js:30-34` | Weak machine ID | Derived from hostname/platform/arch/username. Many machines will collide. |
| 20 | :x: | `src/renderer/settings.js:262,224` | Unsafe innerHTML with template literals | Uses `innerHTML` with template strings. XSS risk if data ever flows from external sources. |

---

## How to Use This File

When you fix an issue, update its status from `:x:` to `:white_check_mark:` and update the summary table counts at the top.

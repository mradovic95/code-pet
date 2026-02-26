# Fix: IntelliJ terminal focus with multiple windows

## Context

When clicking a pet to focus the IntelliJ terminal, it brings up the wrong IntelliJ window (or a random one) instead of the window for that specific project. This happens because the process tree detection fails for Java-based IDEs, and the fallback just activates the app (which brings whatever window was last focused).

## Root Cause

In `src/app/terminal-focus.js`, the `getParentProcess` function uses `ps -o comm=` which can truncate command names on macOS. For Java-based apps (IntelliJ, WebStorm, PyCharm), `comm` may show just `java` instead of the full path like `/Applications/IntelliJ IDEA.app/.../java`. So `extractAppName` never finds the `.app` pattern, the app detection fails, and focus either doesn't work or falls to `activateApp()` which brings a random window.

## Changes (single file: `src/app/terminal-focus.js`)

### 1. Fix `getParentProcess`: `comm=` → `args=`

Change `ps -o ppid=,comm=` to `ps -o ppid=,args=` (line 13). The `args` field returns the full command line including binary path and arguments, which reliably contains the `.app` path even for Java processes. The existing regex parsing and `extractAppName` work unchanged.

### 2. Add `focusAnyWindowByTitle` fallback

New function that searches ALL visible (non-background) macOS processes for any window whose title contains the project directory name. Uses the same `AXRaise` + `set frontmost` pattern. 5s timeout since it iterates more windows.

### 3. Update `focusTerminal` flow

Current flow fails silently when app detection fails. New flow:

1. Walk process tree → find app name (now works via `args=`)
2. TTY matching for Terminal/iTerm (unchanged)
3. App-specific title matching via `focusAppWindow` (unchanged)
4. **NEW**: Broad title search via `focusAnyWindowByTitle` — catches cases where app detection or app-specific matching failed
5. `activateApp` as absolute last resort (only if app name was found)

Key change: remove the early `return false` when no `.app` is found — instead fall through to the broad search.

## Verification

1. Open two IntelliJ windows with different projects, run Claude Code in both
2. Click each pet → should focus the correct IntelliJ window
3. Test Terminal.app / iTerm2 still work (TTY path unchanged)

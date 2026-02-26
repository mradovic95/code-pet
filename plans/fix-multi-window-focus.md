# Fix: Pet Click Focuses Wrong Window When Multiple Windows Open

## Context

When multiple app windows are open, clicking a pet to focus its corresponding terminal/editor window focuses the wrong (random) window instead. The root cause is a structural gap in the focus fallback chain in `terminal-focus.js`:

1. **Terminal apps (Terminal.app, iTerm2)**: When TTY matching fails (stale PID, no TTY), the code skips window title matching entirely and falls through to `activateApp()` which just activates the app generically — macOS picks whatever window it wants.
2. **Non-terminal apps**: `focusByWindowTitle()` calls `activate` *before* finding the right window, which can bring a random window forward.
3. **Stale PIDs**: `claudePid` is captured at hook time but TTY is looked up at click time — by then the PID may be stale.

## Changes

### 1. `hooks/scripts/send-event.js` — Capture TTY at hook time

In `getProjectContext()`, capture the TTY of `process.ppid` synchronously via `execFileSync('ps', ['-o', 'tty=', '-p', ppid])`. This ensures the TTY is captured while the process is guaranteed alive, rather than doing a live lookup minutes later when the user clicks.

Add `tty` field to the returned context object (null if lookup fails — graceful fallback).

### 2. `src/app/event-server.js` — Store TTY per project

- Add `tty: null` to initial project state in `getOrCreateProject()` (line 42)
- Store `body.tty` alongside `body.claudePid` in the `/event` handler (after line 164)
- Include `tty` in `getProjectsSnapshot()` (line 85)
- Export new `getTtyForProject(projectPath)` function

### 3. `src/app/window-manager.js` — Thread stored TTY to focusTerminal

- Add `getTtyFn` variable and `setTtyFn()` setter (like existing `setClaudePidFn`)
- In `focus-terminal` IPC handler (line 35-47): look up stored TTY via `getTtyFn(project)` and pass it to `focusTerminal(pid, projectDirName, project, storedTty)`
- Export `setTtyFn`

### 4. `src/app/main.js` — Wire up new function

- Import `setTtyFn` from window-manager and `getTtyForProject` from event-server
- Call `setTtyFn(getTtyForProject)` alongside existing `setClaudePidFn` call (line 35)

### 5. `src/app/terminal-focus.js` — Fix the focus fallback chain (core fix)

**a) Accept `storedTty` parameter:**
```
focusTerminal(claudePid, projectDirName, projectPath, storedTty)
```

**b) Use stored TTY with live fallback:**
```
const ttyPath = storedTty || await getTty(claudePid);
```

**c) Restructure fallback chain** (lines 174-194) — the key structural fix:

Before (broken):
```
Terminal app → TTY match → (skip title match!) → activateApp (RANDOM)
Non-terminal → title match → activateApp
```

After (fixed):
```
Terminal app → TTY match → title match → activateApp
Non-terminal → title match → activateApp
```

Remove the `appName !== 'Terminal'` gate on window title matching so it runs for ALL apps as a fallback.

**d) Fix `focusByWindowTitle`:**
- Accept `projectPath` parameter
- Move `activate` call to AFTER finding the matching window (not before)
- Two-pass search: try full project path first (specific), then basename (broad)
- This prevents matching "code-pet-utils" when looking for "code-pet"

## Verification

1. Run the pet: `npx electron src/app/main.js`
2. Open 2+ terminal windows/tabs with different projects, start Claude Code in each
3. Wait for pets to appear (one per project)
4. Click each pet and verify it focuses the correct terminal window/tab
5. Test with iTerm2 (TTY matching path) and VS Code (window title matching path)
6. Test edge case: kill a Claude Code session, click the pet — should still focus correctly via stored TTY or title match fallback

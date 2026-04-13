# Cross-Platform Compatibility Investigation

Analysis of code-pet's compatibility across macOS, Windows, and Linux — what works, what breaks, and what to fix.

---

## 1. Target Platforms

Claude Code runs on:

| Platform | Versions |
|----------|----------|
| **macOS** | 13.0+ (Apple Silicon and Intel) |
| **Windows** | 10 1809+, Server 2019+ (requires Git for Windows) |
| **Linux** | Ubuntu 20.04+, Debian 10+, Alpine 3.19+ |
| **WSL** | WSL 1 and WSL 2 both supported |

Claude Code executes all hook commands via **Bash** on every platform (Git Bash on Windows). This means
`hooks.json` commands using `node ${CLAUDE_PLUGIN_ROOT}/...` work everywhere without changes.

---

## 2. Current Status by Platform

### macOS — Fully Working

Everything works out of the box. This is the primary development platform.

- Electron transparent overlay: works
- `setVisibleOnAllWorkspaces`: works (guarded by `process.platform === 'darwin'`)
- `osascript` terminal focus: works (macOS-only feature)
- `ps` commands: work
- SIGTERM process management: works
- `npm install` spawn: works

### Linux — Mostly Working (minor issues)

- Electron transparent overlay: works with `--enable-transparent-visuals` + `--disable-gpu` flags
  (already handled in `main.js` lines 17-19)
- `setVisibleOnAllWorkspaces`: **not called** — pet may not appear on all workspaces
- Terminal focus (`terminal-focus.js`): **disabled** — early exit at line 155 for non-darwin
- `ps` commands: work
- SIGTERM: works
- **Wayland**: untested — transparency and always-on-top behavior may differ from X11

### Windows — Broken in Several Places

Multiple components use Unix-only commands and will fail on Windows.

---

## 3. Cross-Platform Issues

### 3.1. CRITICAL: `ps` Command in send-event.js (Used by Every Hook)

**File:** `hooks/scripts/send-event.js:15`
```javascript
const raw = execFileSync('ps', ['-o', 'tty=', '-p', String(pid)], { timeout: 1000 })
```

**Problem:** `ps` is a Unix command. Does not exist on Windows (even in Git Bash, the `ps` that exists
has different flags). This `captureTty()` function runs on **every hook event** as part of `sendEvent()`.

**Impact:** Every hook call will throw an error on Windows. The error is caught (returns `null`), so hooks
won't crash, but TTY detection silently fails — terminal focus won't work.

**Fix:** Guard with platform check:
```javascript
function captureTty(pid) {
  if (process.platform === 'win32') return null;
  // existing ps logic...
}
```

### 3.2. CRITICAL: `ps` Command in terminal-focus.js

**File:** `src/app/terminal-focus.js:13,31`
```javascript
execFile('ps', ['-o', 'ppid=,args=', '-p', String(pid)], ...)
```

**Problem:** Same Unix-only `ps` issue. However, this file already has a guard at line 155:
```javascript
if (process.platform !== 'darwin') { resolve(null); return; }
```

**Impact:** Low — the feature is already macOS-only. But the `ps` calls in `getParentProcess()` and
`walkProcessTree()` could still be reached if the guard is bypassed or refactored.

**Fix:** Move the platform guard to the top of exported functions, or add guards around each `ps` call.

### 3.3. MEDIUM: SIGTERM on Windows

**File:** `src/app/process-manager.js:151,162`
```javascript
process.kill(pid, 'SIGTERM');
```

**Problem:** Node.js on Windows does not deliver SIGTERM to child processes the same way. On Windows,
`process.kill(pid, 'SIGTERM')` unconditionally terminates the process (equivalent to SIGKILL) — there's
no graceful shutdown.

**Impact:** The Electron app won't get a chance to clean up (save state, close windows gracefully) on
Windows. It just dies.

**Fix:** On Windows, use a different approach:
```javascript
if (process.platform === 'win32') {
  spawn('taskkill', ['/pid', String(pid), '/t'], { shell: true });
} else {
  process.kill(pid, 'SIGTERM');
}
```
Or accept that Windows termination is abrupt (Electron's `before-quit` event won't fire).

### 3.4. MEDIUM: process.kill(pid, 0) Reliability on Windows

**File:** `src/app/process-manager.js:42`
```javascript
process.kill(pid, 0);  // check if process alive
```

**Problem:** Signal 0 is a POSIX concept. On Windows, Node.js implements this by calling
`OpenProcess()` + `GetExitCodeProcess()`. This works in most cases but can give false positives
if the PID has been reused by another process.

**Impact:** Low in practice — PID reuse is rare in short timeframes.

**Fix:** No immediate fix needed. Document as known limitation.

### 3.5. LOW: `osascript` in terminal-focus.js (macOS-only)

**File:** `src/app/terminal-focus.js:80,99,136`
```javascript
execFile('osascript', ['-e', `tell application "${appName}" to activate`], ...)
```

**Problem:** `osascript` is macOS-only (AppleScript). Already guarded by the darwin platform check.

**Impact:** None — terminal focus is intentionally macOS-only. On Linux/Windows, clicking the pet name
simply does nothing.

**Fix:** No fix needed, but could implement platform-specific alternatives:
- **Linux:** `wmctrl` or `xdotool` for X11
- **Windows:** PowerShell `AppActivate` or Win32 API via native module

### 3.6. LOW: Linux Workspace Visibility

**File:** `src/app/window-manager.js:286-288`
```javascript
if (process.platform === 'darwin') {
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}
```

**Problem:** Only called on macOS. On Linux with multiple workspaces/virtual desktops, the pet overlay
may only appear on the workspace where it was created.

**Fix:** Call `setVisibleOnAllWorkspaces(true)` on Linux too (without the `visibleOnFullScreen` option
which is macOS-specific):
```javascript
if (process.platform === 'darwin') {
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
} else if (process.platform === 'linux') {
  overlayWindow.setVisibleOnAllWorkspaces(true);
}
```

### 3.7. LOW: test.sh is Bash-only

**File:** `test.sh`

**Problem:** Bash script, won't run natively on Windows CMD/PowerShell.

**Impact:** Dev-only tool, not user-facing. Works on Windows via Git Bash.

**Fix:** No fix needed — it's a dev utility. Could optionally add `test.ps1` or `test.bat`.

### 3.8. LOW: Wayland (Linux) Transparency

**File:** `src/app/main.js:17-19`
```javascript
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.commandLine.appendSwitch('disable-gpu');
}
```

**Problem:** These flags target X11. On Wayland:
- `enable-transparent-visuals` may not apply
- `disable-gpu` may not be needed (and disabling GPU on Wayland may break rendering)
- Always-on-top behavior is controlled by the compositor, not the app

**Impact:** Unknown — needs testing on Wayland.

**Fix:** Detect X11 vs Wayland:
```javascript
if (process.platform === 'linux') {
  const isWayland = !!process.env.WAYLAND_DISPLAY;
  if (!isWayland) {
    app.commandLine.appendSwitch('enable-transparent-visuals');
    app.commandLine.appendSwitch('disable-gpu');
  }
}
```

---

## 4. What Already Works Cross-Platform

These areas are correctly implemented:

| Component | Why It Works |
|-----------|-------------|
| **hooks.json commands** | `node ${CLAUDE_PLUGIN_ROOT}/...` — Claude Code runs via Bash everywhere |
| **Path handling** | All files use `path.join()` and `os.homedir()` — never hardcoded separators |
| **Electron binary resolution** | `process-manager.js:86-94` handles darwin/win32/linux correctly |
| **npm install spawn** | `bootstrap.js:53` sets `shell: process.platform === 'win32'` |
| **HTTP server binding** | Uses `127.0.0.1` (not `localhost`) — avoids IPv6 ambiguity |
| **State directory** | `~/.code-pet/` via `os.homedir()` — works on all platforms |
| **Logger** | `fs.mkdirSync({ recursive: true })` — cross-platform |
| **Settings/license storage** | `path.join(os.homedir(), '.code-pet', ...)` — cross-platform |

---

## 5. Fix Priority

### Must Fix (Windows is broken without these)

1. **Guard `captureTty()` in `send-event.js`** — add `process.platform === 'win32'` early return
2. **SIGTERM handling in `process-manager.js`** — use `taskkill` on Windows or accept abrupt termination

### Should Fix (Better Linux support)

3. **Workspace visibility on Linux** — call `setVisibleOnAllWorkspaces(true)` for Linux
4. **Wayland detection in `main.js`** — skip X11-specific flags on Wayland

### Nice to Have

5. **Terminal focus on Linux/Windows** — implement platform-specific alternatives
6. **`test.sh` Windows equivalent** — add `test.bat` or `test.ps1`

---

## 6. Testing Plan

### macOS (current state: working)
```bash
# Run normally, verify all features work
npx electron src/app/main.js
./test.sh awaken && ./test.sh working_started && ./test.sh work_finished
```

### Linux (X11)
```bash
# Test transparent overlay, always-on-top, multi-workspace
npx electron src/app/main.js
# Verify overlay is visible, transparent, click-through
# Switch workspaces — check if pet follows
```

### Linux (Wayland)
```bash
# Test with Wayland-specific concerns
WAYLAND_DISPLAY=wayland-0 npx electron src/app/main.js
# Verify transparency works without X11 flags
```

### Windows
```bash
# Via Git Bash (how Claude Code runs hooks)
node hooks/scripts/on-session-start.js < '{"session_id":"test"}'
# Verify no ps/osascript errors in ~/.code-pet/hooks-debug.log

# Test Electron launch
npx electron src/app/main.js
# Verify overlay appears, is transparent, click-through
# Test process cleanup (does Electron stop cleanly?)
```

### WSL
```bash
# WSL requires X server (VcXsrv, WSLg) for GUI
# Test that hooks work even without display (should not crash)
DISPLAY=:0 npx electron src/app/main.js
```

---

## 7. Summary

| Platform | Hook Scripts | Electron Overlay | Terminal Focus | Process Mgmt |
|----------|-------------|-----------------|----------------|-------------|
| **macOS** | Working | Working | Working | Working |
| **Windows** | Working (ps fails silently) | Should work | Not supported | SIGTERM is abrupt |
| **Linux X11** | Working | Working (with flags) | Not supported | Working |
| **Linux Wayland** | Working | Untested | Not supported | Working |
| **WSL** | Working | Needs X server | Not supported | Working |

**Bottom line:** The plugin works on macOS. It will mostly work on Linux X11 with minor workspace
visibility gaps. Windows needs 2 targeted fixes (guard `ps` calls, handle SIGTERM) to avoid silent
errors. Terminal focus is macOS-only by design — acceptable for v1.

# Installation Lifecycle

Step-by-step reference for what happens when the Code Pet plugin is installed, first launched, updated, and removed in
Claude Code. Source paths and line numbers are anchored to the current `main` branch.

## Overview

Code Pet uses a **two-phase install model**:

1. **Plugin install** — Claude Code reads the plugin manifest and registers the seven lifecycle hooks. Instant. No
   Electron, no `~/.code-pet/`, no running process.
2. **First SessionStart** — the `SessionStart` hook lazily installs Electron (~85 MB) into the plugin's `node_modules/`,
   launches the overlay app, and starts an HTTP event server on `127.0.0.1:31425`. From then on, every Claude Code hook
   is a one-line HTTP POST to that server.

Hook scripts have **zero Electron dependency** — they run on the user's system Node.js (>= 18).

---

## Phase 1: Plugin Installation

Triggered by:

```
/plugin marketplace add mradovic95/code-pet
/plugin install code-pet
```

### What Claude Code reads

| File                              | Purpose                                                  |
|-----------------------------------|----------------------------------------------------------|
| `.claude-plugin/plugin.json`      | Plugin name, version, author, license, keywords          |
| `.claude-plugin/marketplace.json` | Marketplace metadata (used by `/plugin marketplace add`) |
| `hooks/hooks.json`                | Hook event → command mapping                             |

### What gets registered

Seven lifecycle hooks from `hooks/hooks.json`. All commands resolve `${CLAUDE_PLUGIN_ROOT}` to the plugin directory.

| Hook event         | Matcher             | Script                               | Timeout |
|--------------------|---------------------|--------------------------------------|---------|
| `SessionStart`     | —                   | `hooks/scripts/on-session-start.js`  | 15s     |
| `Notification`     | `permission_prompt` | `hooks/scripts/on-notification.js`   | 5s      |
| `UserPromptSubmit` | —                   | `hooks/scripts/on-prompt-submit.js`  | 5s      |
| `Stop`             | —                   | `hooks/scripts/on-stop.js`           | 5s      |
| `SessionEnd`       | —                   | `hooks/scripts/on-session-end.js`    | 15s     |
| `PreToolUse`       | `Skill\|mcp__.*`    | `hooks/scripts/on-pre-tool-use.js`   | 5s      |
| `PostToolUse`      | —                   | `hooks/scripts/on-post-tool-use.js`  | 5s      |

### What does NOT happen yet

- No Electron install (`node_modules/electron` is absent)
- No `~/.code-pet/` directory
- No running process
- No HTTP server listening

The plugin is essentially dormant until the user starts a Claude Code session.

---

## Phase 2: First `SessionStart` — Bootstrap + Launch

Triggered by Claude Code firing the `SessionStart` hook.

> Note: `/plugin install` registers the plugin in storage but does not load it into the running Claude Code process. The
> user must fully quit Claude Code and reopen it before Phase 2 can begin.

### Step 2.1 — Hook entry

Claude Code runs `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/on-session-start.js`. The script immediately calls
`bootstrap(PLUGIN_ROOT)` (`hooks/scripts/on-session-start.js:11`).

### Step 2.2 — Check whether Electron is installed

`bootstrap.js:17-27` looks for `node_modules/electron/package.json` AND verifies the binary path returned by
`require('electron')` exists on disk.

- If both checks pass → `bootstrap()` returns `{ ready: true }` and the script proceeds to Step 2.6.
- Otherwise → continue to Step 2.3.

### Step 2.3 — Check the install lock

`bootstrap.js:29-43` (`isInstalling()`) checks `~/.code-pet/installing`.

- If the lock exists and was modified less than **10 minutes** ago (`bootstrap.js:35`) → another process is already
  installing. Return `{ ready: false, reason: 'install-in-progress' }`.
- If the lock is older than 10 minutes → treat it as stale, delete it, and continue.
- If no lock → continue.

### Step 2.4 — Spawn `npm install` in the background

`bootstrap.js:45-74` (`startInstall()`):

1. `mkdir -p ~/.code-pet/`
2. Write the current PID into `~/.code-pet/installing` with `flag: 'wx'` (atomic create — fails if another process raced
   ahead).
3. Open `~/.code-pet/install.log` in append mode.
4. Spawn `npm install --prefix <pluginRoot>` with `detached: true`, stdio piped to the log file, then `child.unref()` so
   the child outlives the hook.
5. On child exit: close the log fd and unlink the lock file.

### Step 2.5 — Tell the user, exit non-blocking

The hook prints one of two messages to stderr (visible in Claude Code) and exits 0 (`on-session-start.js:15-21`):

- First invocation — `npm install` just kicked off (`reason: 'install-started'`):

  ```
  Code Pet: Installing Electron (~85MB), pet will appear on next session...
  ```

- Any later SessionStart fired while `npm install` is still running (`reason: 'install-in-progress'`, lock file detected
  by `bootstrap.js:29-43`):

  ```
  Code Pet: Installation in progress, pet will appear soon...
  ```

The pet **does not appear during this first session**. The user will see it the next time they start Claude Code,
provided `npm install` has finished by then.

### Step 2.6 — Launch Electron (subsequent SessionStart)

Once `bootstrap()` returns `{ ready: true }`, the hook lazy-requires `src/app/core/process-manager.js` and calls
`pm.isRunning()` (`process-manager.js:84-94`):

1. HTTP `GET http://127.0.0.1:31425/health` with 1s timeout. If 200 → already running.
2. Otherwise, read `~/.code-pet/app.pid` and probe with `kill(pid, 0)`. If alive → already running.
3. Otherwise, delete the stale PID file and report not running.

If not running, `pm.launchApp(PLUGIN_ROOT)` (`process-manager.js:106-141`):

1. Resolves the OS-specific Electron binary inside the plugin's `node_modules/electron/dist/`.
2. Spawns `<electronBin> src/app/main.js` with `detached: true`, env `CODE_PET_PORT` and `CODE_PET_PLUGIN_ROOT`, stdio
   piped to `~/.code-pet/app.log`.
3. Writes the child's PID to `~/.code-pet/app.pid`, then `child.unref()`.

### Step 2.7 — Electron main process startup

`src/app/main.js`:

1. `app.requestSingleInstanceLock()` (line 25). If another Electron is already holding the lock → quit immediately.
2. On `ready`: load settings, license, marketplace config, scan pet catalog.
3. `writePid(process.pid)` (line 52) — re-writes `~/.code-pet/app.pid` with the actual Electron PID (not the
   spawn-wrapper PID).
4. `await startServer()` — start HTTP listener (Step 2.8).
5. `createOverlayWindow()` — transparent, click-through, always-on-top, 96×96px window in the bottom-right corner.

### Step 2.8 — HTTP event server

`src/app/server/event-server.js` listens on `127.0.0.1:31425` (override with `CODE_PET_PORT`). Routes:

| Method | Path          | Purpose                                                                                                               |
|--------|---------------|-----------------------------------------------------------------------------------------------------------------------|
| `GET`  | `/health`     | `200 ok` if renderer ready, `503 waiting` otherwise. Used by `pm.healthCheck()`.                                      |
| `POST` | `/event`      | Main event dispatch. Body: `{ event, project, projectName, claudePid, tty, permissionMode?, toolName?, toolInput?, toolUseId?, agentId? }`. |
| `GET`  | `/last-event` | Snapshot of session state (debugging). Query: `?session=KEY` or `?project=PATH`.                                      |
| `POST` | `/shutdown`   | Graceful quit. Responds, then `app.quit()` after 100 ms.                                                              |

If port `31425` is already bound by another process, `event-server.js:186-212` checks if the holder is healthy. If yes →
quit (another instance wins). If no → kill the stale PID and retry once.

### Step 2.9 — Send `awaken`

Back in the hook (`on-session-start.js:33-43`): poll `/health` up to 10 times at 200 ms intervals (max ~2 s), then HTTP
POST `awaken` to `/event`. The renderer plays the one-shot `waking_up` animation; the server stays in `idle`.

---

## Phase 3: Runtime Behavior

Once the Electron app is up, every other registered hook is a one-line HTTP POST.

| Hook script           | HTTP event sent                                                           | Server-side state                  |
|-----------------------|---------------------------------------------------------------------------|------------------------------------|
| `on-prompt-submit.js` | `working_started` (or `planning_started` if `permission_mode === "plan"`) | `working` / `planning`             |
| `on-notification.js`  | `action_requested` (only when `notification_type === permission_prompt`)  | `waiting_for_action`               |
| `on-pre-tool-use.js`  | `action_started` (Skill and `mcp__*` tools only; stamps the start time for duration pairing) | no state change |
| `on-post-tool-use.js` | `action_completed` (+ `agentId` for subagent tool calls)                  | restores previous active state; wakes an idle pet when agent-tagged (background subagent) |
| `on-stop.js`          | `work_finished`                                                           | `idle`                             |
| `on-session-end.js`   | `falling_asleep`                                                          | removes project (only from `idle`) |

For the full event matrix and per-state behavior, see [`hook-table.md`](./hook-table.md) and [
`state-diagram.puml`](./state-diagram.puml).

### Files created in `~/.code-pet/`

| File               | Created by                               | Purpose                                                        |
|--------------------|------------------------------------------|----------------------------------------------------------------|
| `app.pid`          | `process-manager.js:19-22`, `main.js:52` | Electron process ID                                            |
| `app.log`          | `process-manager.js:117-119`             | Electron stdout/stderr (append, no rotation)                   |
| `install.log`      | `bootstrap.js:54-55`                     | npm install output                                             |
| `installing`       | `bootstrap.js:48`                        | Bootstrap lock (stale at 10 min)                               |
| `code-pet.log`     | `src/app/core/logger.js`                      | Structured app log (1 MB ring)                                 |
| `hooks-debug.log`  | `send-event.js` debug path               | Per-hook event log; only written if `~/.code-pet/debug` exists |
| `marketplace.json` | User-provided                            | API URL, key, marketplace ID for premium pets                  |
| `product-map.json` | `marketplace-api.js`                     | Cached productId ↔ petId map                                   |
| `license.json`     | `license-manager.js`                     | Activated license, owned pet IDs                               |
| `pets/{id}/`       | `premium-store.js`                       | Downloaded marketplace pets (plaintext sprites + manifest)     |

### Cleanup timers

| Resource                       | Threshold                            | Source                                                         |
|--------------------------------|--------------------------------------|----------------------------------------------------------------|
| Install lock file              | 10 minutes                           | `bootstrap.js:35`                                              |
| Per-project pet registry entry | 3 hours since last event             | `pet-registry.js:150` (raised from 30 min in commit `47b5b3e`) |
| Idle Electron auto-shutdown    | 5 seconds after last project removed | `event-server.js:33-42`                                        |

---

## Phase 4: Session End

Triggered by Claude Code firing the `SessionEnd` hook.

1. `on-session-end.js:9` sends `falling_asleep` to `/event`.
2. If the HTTP send fails (server unreachable) → fallback to `pm.stopApp()` (`on-session-end.js:11-13`) which POSTs
   `/shutdown` and, on failure, kills the PID directly.
3. Server-side, `falling_asleep` removes the project from the registry **only** if the pet is in `idle`. In `working`,
   `planning`, or `waiting_for_action` it is ignored (so a long-running build doesn't kill the pet just because the user
   opened a second terminal).
4. When the registry becomes empty, `event-server.js:33-42` schedules `app.quit()` after 5 seconds (cancelled if a new
   event arrives).
5. On `before-quit` (`main.js:116-121`): close settings window, `await stopServer()`, `removePid()`.

---

## Phase 5: Plugin Update

Triggered by `/plugin update code-pet` (or by `git pull` in dev mode).

### What Claude Code does

Replaces the plugin source files (`.claude-plugin/`, `hooks/`, `src/`, `assets/`) and re-reads `hooks/hooks.json`. New,
removed, or renamed hook scripts take effect immediately.

### What survives the update

These live **outside** the plugin directory and are untouched:

- `~/.code-pet/app.pid`, `app.log`, `install.log`, `code-pet.log`, `hooks-debug.log`
- `~/.code-pet/license.json`, `marketplace.json`, `product-map.json`
- `~/.code-pet/pets/` — downloaded marketplace pets live under the user data dir, so they persist through plugin updates
  with no network dependency. If the user wipes this directory, the recovery loop in `main.js` redownloads owned pets on
  next startup using `license.json`.
- The **running Electron process** — it keeps running on the **old** code until the next restart

### What does NOT survive

These live **inside** the plugin directory:

- `node_modules/` — if Claude Code replaces the plugin dir wholesale, Electron is missing again. The next `SessionStart`
  will re-trigger the lazy bootstrap from Phase 2 (npm install + relaunch).

### The key insight: Electron is NOT auto-replaced

`/plugin update` only swaps **files on disk**. The Electron process that's already running has the **old**
`src/app/*.js` and `src/renderer/*.js` code loaded into memory, and Node.js / Chromium do not hot-reload it. The new
Electron only starts running when:

1. The **old** Electron process exits (auto-shutdown, manual `/shutdown`, or kill), AND
2. A **fresh** `SessionStart` fires after the old process is gone.

There is no "restart-on-update" hook — Code Pet does not know an update happened.

### Two kinds of files behave differently

| File category           | Path                                                   | When the new code takes effect                                                                     |
|-------------------------|--------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| Hook scripts            | `hooks/scripts/*.js`                                   | **Immediately** — every hook spawns a fresh `node` process, so the next event runs the new script. |
| Electron app code       | `src/app/*.js`, `src/renderer/*.js`, `assets/sprites/` | **Only after the old Electron exits and a new SessionStart spawns a fresh one.**                   |
| `hooks/hooks.json`      | hook registration                                      | **Immediately** when Claude Code re-reads the manifest during update.                              |
| `node_modules/electron` | binary                                                 | If wiped, re-installed on next SessionStart via Phase 2 bootstrap.                                 |

### Step-by-step — Scenario A: hook-script-only update

The simplest case. Nothing about Electron changes.

1. `/plugin update code-pet` swaps files on disk; `hooks/scripts/on-stop.js` (for example) is now the new version.
2. The user keeps working in their open Claude Code session.
3. Claude Code fires `Stop` → spawns `node hooks/scripts/on-stop.js` → **this is the new script**, runs immediately.
4. The new script HTTP-POSTs `work_finished` to the old Electron on `127.0.0.1:31425`.
5. Old Electron handles the event with old `src/app/server/event-server.js` code. That's fine because the wire protocol (event
   names, JSON shape) didn't change.
6. **Result:** new hooks active, old Electron still running. No restart needed.

### Step-by-step — Scenario B: Electron / renderer code changed

This is the case where you need to know what's happening.

1. **Update lands.** `/plugin update code-pet` swaps files. `src/app/server/event-server.js` is now v2 on disk. The running
   Electron still has v1 loaded in memory.
2. **User starts a new Claude Code session** in the same project (or any project).
3. Claude Code fires `SessionStart` → runs the **new** `hooks/scripts/on-session-start.js`.
4. Bootstrap step (`bootstrap.js`):
    - `isElectronInstalled()` checks `node_modules/electron`. Usually still present after a plugin update, so returns
      `true`.
    - If `node_modules/` was wiped (full reinstall mode), Phase 2 reinstall triggers: write `~/.code-pet/installing`
      lock, spawn `npm install` to `~/.code-pet/install.log`, exit with the "pet will appear on next session" message.
      Skip to step 7 on the SessionStart **after** install completes.
5. The hook calls `pm.isRunning()` (`process-manager.js:84-94`):
    - HTTP `GET /health` on `127.0.0.1:31425` → the **old** Electron answers `200 ok`.
    - `isRunning()` returns `true` → `launchApp()` is **skipped**.
6. **The old Electron is reused.** The new code on disk is never loaded. The pet keeps running v1 behavior. ⚠️ This is
   the trap.
7. **To force the swap, kill the old Electron.** Three ways, in order of cleanliness:

   **(a) Graceful HTTP shutdown** — drains in 100 ms, removes PID file, releases port:

   ```sh
   curl -X POST http://127.0.0.1:31425/shutdown
   ```

   This hits `event-server.js:164-169` → responds `200 shutting-down` → `setTimeout(() => app.quit(), 100)` →
   `before-quit` handler closes settings window, `stopServer()`, `removePid()` (`main.js:116-121`).

   **(b) Drain via SessionEnd** — let it die naturally:
    - End every Claude Code session that has a pet for the project.
    - Each `SessionEnd` POSTs `falling_asleep`. If the pet is in `idle`, the project is removed from the registry.
    - When the registry hits 0, `event-server.js:33-42` schedules `app.quit()` after **5 seconds** (cancelled if a new
      event arrives in that window).
    - `before-quit` runs the same cleanup as (a).

   **(c) Hard kill** — last resort if HTTP is unresponsive:

   ```sh
   kill "$(cat ~/.code-pet/app.pid)"
   # or
   pkill -f "Electron.*code-pet"
   rm -f ~/.code-pet/app.pid
   ```

8. **Confirm the old process is gone:**

   ```sh
   curl -sf http://127.0.0.1:31425/health || echo "down"
   ```

   Should print `down`. If `~/.code-pet/app.pid` still exists, `pm.isRunning()` will detect it as stale on the next
   call (`process-manager.js:88-92`: `kill(pid, 0)` fails → PID file deleted automatically).

9. **Trigger a fresh SessionStart.** Open a new Claude Code session.
10. The hook runs again. This time:
    - `pm.isRunning()` → `/health` fails (no listener) → reads PID file (empty/stale) → returns `false`.
    - `pm.launchApp(PLUGIN_ROOT)` (`process-manager.js:106-141`) resolves the Electron binary at
      `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` (macOS), spawns it with `src/app/main.js` — *
      *the new v2 code** — and writes the new PID to `~/.code-pet/app.pid`.
    - `main.js` requires `event-server.js` — the v2 file — and starts the HTTP server on the same port.
11. Hook polls `/health` for ~2 s, sends `awaken`. The new Electron answers. Pet appears running v2 code.

### Quick reference

| What changed                                   | Restart Electron?                                   |
|------------------------------------------------|-----------------------------------------------------|
| Only `hooks/scripts/*.js`                      | No                                                  |
| Only `hooks/hooks.json`                        | No (Claude Code re-reads it)                        |
| `src/app/*.js` (main process)                  | **Yes**                                             |
| `src/renderer/*.js`, `src/renderer/styles.css` | **Yes**                                             |
| `assets/sprites/`, `assets/pets/`              | **Yes** (catalog scan happens on Electron startup)  |
| `node_modules/` wiped                          | Yes — bootstrap will reinstall on next SessionStart |

---

## Phase 6: Plugin Uninstallation

Triggered by:

```
claude plugin remove code-pet
```

### What Claude Code does

Deregisters the seven hooks. Subsequent sessions will not invoke any Code Pet script.

### What is NOT cleaned automatically

Code Pet has no uninstall hook, so the following residual state remains:

| Residual                 | Path                                  | Size                                             |
|--------------------------|---------------------------------------|--------------------------------------------------|
| Runtime + license state  | `~/.code-pet/`                        | KB–MB (depends on premium pets)                  |
| Electron binary          | `<plugin-dir>/node_modules/electron/` | ~85 MB                                           |
| Other npm deps           | `<plugin-dir>/node_modules/`          | small                                            |
| Running Electron process | (memory)                              | only if `SessionEnd` did not fire before removal |

### Manual cleanup

```sh
# 1. Stop the running Electron, if any
curl -X POST http://127.0.0.1:31425/shutdown 2>/dev/null \
  || pkill -f "Electron.*code-pet"

# 2. Remove runtime state (logs, license, premium sprites)
rm -rf ~/.code-pet

# 3. Remove npm dependencies inside the plugin dir
rm -rf <plugin-dir>/node_modules
```

Premium license activations are tracked server-side; deleting `license.json` locally does not deactivate them on the
marketplace.

---

## Troubleshooting

| Symptom                                                          | Check                                                                                                  |
|------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| Pet never appears after install                                  | `cat ~/.code-pet/install.log` (npm install errors); `cat ~/.code-pet/app.log` (Electron errors)        |
| "Installing Electron…" message persists across multiple sessions | `cat ~/.code-pet/installing` to see the installer PID; if the PID is dead, `rm ~/.code-pet/installing` |
| Pet stuck in wrong state                                         | `curl 'http://127.0.0.1:31425/last-event?project=$PWD'`                                                |
| Need verbose hook + app logs                                     | `touch ~/.code-pet/debug` to enable; `rm ~/.code-pet/debug` to disable                                 |
| Old Electron still running after update                          | `curl -X POST http://127.0.0.1:31425/shutdown` and start a new Claude session                          |
| Port 31425 conflict                                              | Set `CODE_PET_PORT=<port>` in your shell before launching Claude Code                                  |

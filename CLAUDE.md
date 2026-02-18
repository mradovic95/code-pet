# Code Pet

Animated desktop pet that reacts to Claude Code activity. A transparent, always-on-top Electron overlay (96×96px, bottom-right corner) shows a sprite-animated dog that responds to hook events.

## Tech Stack

- **Node.js** (>= 18) — hook scripts, process management
- **Electron** (^33.0.0) — transparent overlay window, the only runtime dependency
- No other external dependencies. Keep it that way.

## Directory Structure

```
.claude-plugin/plugin.json   # Claude Code plugin manifest
hooks/
  hooks.json                 # Hook event → script mapping
  scripts/                   # Hook handlers (plain Node.js, no Electron)
    bootstrap.js             # Lazy Electron installer (background npm install)
    send-event.js            # HTTP POST client to event server
    on-session-start.js      # SessionStart: bootstrap → launch app → send wake
    on-pre-tool-use.js       # PreToolUse: send thinking or typing
    on-post-tool-use.js      # PostToolUse: send success or error
    on-notification.js       # Notification: send idle
src/
  app/                       # Electron main process
    main.js                  # Entry point: PID → server → overlay window
    event-server.js          # HTTP server on 127.0.0.1:31425
    process-manager.js       # PID file, app launch/stop, health checks
    window-manager.js        # Transparent click-through BrowserWindow
    logger.js                # File logger (~/.code-pet/code-pet.log, 1MB max)
    preload.js               # Context bridge: window.assistantDog.onEvent()
  renderer/                  # Chromium renderer (the visible overlay)
    index.html               # Shell: <div id="dog">, loads dog.js + ipc.js
    dog.js                   # Sprite state machine (core animation logic)
    ipc.js                   # Wires IPC events to state machine
    styles.css               # CSS sprite strip animations for all 7 states
assets/sprites/              # Horizontal sprite strips (64×64px per frame)
scripts/
  generate-placeholders.js   # Dev utility: regenerate SVG placeholder sprites
```

## Architecture

```
Claude Code hooks (stdin JSON)
  → hooks/scripts/*.js (plain Node.js)
    → HTTP POST to 127.0.0.1:31425/event
      → event-server.js (Electron main process)
        → IPC: win.webContents.send('dog-event', name)
          → preload.js context bridge
            → dog.js state machine
              → CSS class swap on #dog → sprite animation plays
```

Hook scripts and the Electron app communicate **only via HTTP**. Hooks have zero Electron dependency.

## State Machine (dog.js)

Seven states: `idle`, `wake`, `sleep`, `thinking`, `typing`, `success`, `error`

| State | Frames | Duration | Loops | Auto-transition |
|-------|--------|----------|-------|-----------------|
| idle | 4 | 1600ms | yes | — |
| wake | 4 | 800ms | no | → idle (800ms) |
| sleep | 4 | 2400ms | yes | — |
| thinking | 4 | 1200ms | yes | → idle (10s inactivity) |
| typing | 6 | 600ms | yes | → idle (10s inactivity) |
| success | 4 | 1000ms | no | → idle (2500ms) |
| error | 4 | 800ms | no | → idle (2000ms) |

- **Debounce**: 300ms — rapid state changes collapse to the latest event
- **Persistent states** (thinking, typing): reset their 10s inactivity timer on each new event
- **One-shot states** (wake, success, error): play once then auto-return to idle

## Key Conventions

- All hook scripts exit with `process.stdout.write('{}')` and code 0 — never block Claude Code
- Errors in hooks are silently swallowed; the pet is non-intrusive
- Electron installs lazily on first `SessionStart` via background `npm install` (lock file at `~/.code-pet/installing`)
- Single instance enforced via `app.requestSingleInstanceLock()` + PID file
- Renderer uses `contextIsolation: true`, `nodeIntegration: false`
- Overlay is click-through (`setIgnoreMouseEvents(true)`), always-on-top at `screen-saver` level, visible on all workspaces
- `CODE_PET_PORT` env var overrides the default port 31425

## Runtime State (all in `~/.code-pet/`)

| File | Purpose |
|------|---------|
| `app.pid` | Running Electron process PID |
| `code-pet.log` | Structured app log (1MB, truncated on overflow) |
| `app.log` | Electron stdout/stderr |
| `install.log` | npm install output |
| `installing` | Lock file during npm install (contains PID, stale after 10min) |

## Development Commands

```bash
# Regenerate placeholder sprite assets
node scripts/generate-placeholders.js

# Install the plugin in Claude Code
claude --plugin-dir /path/to/code-pet

# Run Electron manually (after npm install)
npx electron src/app/main.js
```

## Sprite Format

Each sprite is a horizontal PNG strip of 64×64px frames with transparent background. Frame counts must match the `SPRITES` config in `src/renderer/dog.js`. CSS in `styles.css` uses `background-position` with `steps(N)` to animate.

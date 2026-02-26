# Code Pet

Animated desktop pet that reacts to Claude Code activity. A transparent, always-on-top Electron overlay (96×96px, bottom-right corner) shows a sprite-animated dog that responds to hook events.

## Tech Stack

- **Node.js** (>= 18) — hook scripts, process management
- **Electron** (^33.0.0) — transparent overlay window, the only runtime dependency
- No other external dependencies. Keep it that way.

## Directory Structure

```
.claude-plugin/plugin.json   # Claude Code plugin manifest
.claude-plugin/marketplace.json # Claude Code marketplace metadata
hooks/
  hooks.json                 # Hook event → script mapping
  scripts/                   # Hook handlers (plain Node.js, no Electron)
    bootstrap.js             # Lazy Electron installer (background npm install)
    send-event.js            # HTTP POST client to event server
    on-session-start.js      # SessionStart: bootstrap → launch app → send awaken
    on-session-end.js        # SessionEnd: send falling_asleep → shut down Electron
    on-notification.js       # Notification: send action_requested (+notification payload)
    on-prompt-submit.js      # UserPromptSubmit: send working_started or planning_started (+prompt_length)
    on-post-tool-use.js      # PostToolUse: sends question_answered for AskUserQuestion, logs all tools
    on-stop.js               # Stop: send work_finished (+stop_reason)
src/
  app/                       # Electron main process
    main.js                  # Entry point: PID → server → overlay window
    event-server.js          # HTTP server on 127.0.0.1:31425 (/event, /health, /last-event, /shutdown)
    process-manager.js       # PID file, app launch/stop, health checks
    window-manager.js        # Transparent click-through BrowserWindow
    logger.js                # File logger (~/.code-pet/code-pet.log, 1MB max)
    preload.js               # Context bridge: window.codePet.onPetEvent()
    settings-preload.js      # Context bridge for settings window
  renderer/                  # Chromium renderer (the visible overlay)
    index.html               # Shell: <div id="pets-container">, loads pet.js + pet-manager.js + ipc.js
    pet.js                   # Sprite state machine + interaction (Pet class)
    pet-manager.js           # Multi-project pet orchestration (PetManager class)
    ipc.js                   # Wires IPC events to state machine
    styles.css               # CSS sprite strip animations for all 5 states
    settings.html            # Settings window UI (opened on double-click)
    settings.js              # Settings window logic
    settings.css             # Settings window styling
assets/sprites/              # Horizontal sprite strips (64×64px per frame)
docs/
  hook-table.md              # Complete hook event → pet event → state matrix
  state-diagram.puml         # PlantUML state machine and event flow diagrams
scripts/
  generate-placeholders.js   # Dev utility: regenerate SVG placeholder sprites
test.sh                      # Dev utility: send events to the pet (curl wrapper)
```

## Architecture

```
Claude Code hooks (stdin JSON)
  → hooks/scripts/*.js (plain Node.js)
    → HTTP POST to 127.0.0.1:31425/event { event: "<semantic_event>" }
      → event-server.js: EVENT_TO_STATE mapping + special handlers → resolves state name
        → IPC: sendToRenderer('pet-event', { project, state, projectName })
          → preload.js context bridge
            → pet.js state machine
              → CSS class swap on .pet → sprite animation plays
```

Hook scripts and the Electron app communicate **only via HTTP**. Hooks have zero Electron dependency.

## Events and States

Five semantic events map to five visual states. Two additional events (`falling_asleep`, `question_answered`) are handled specially by the server without a dedicated visual state.

| Event (hook sends) | State (pet.js) | Triggered by |
|---------------------|----------------|--------------|
| `awaken` | `waking_up` | SessionStart |
| `working_started` | `working` | UserPromptSubmit (normal mode) |
| `planning_started` | `planning` | UserPromptSubmit (plan mode) |
| `action_requested` | `waiting_for_action` | Notification (permission_prompt) |
| `work_finished` | `idle` | Stop |
| `question_answered` | *(restores previous)* | PostToolUse (AskUserQuestion) |
| `falling_asleep` | *(restores or tracks)* | SessionEnd |

> `on-post-tool-use.js` sends `question_answered` when `AskUserQuestion` completes. The server restores the pet to its previous active state (`working` or `planning`) via `lastActiveEvent`. For all other tools, the hook only logs to `hooks-debug.log`.

> `falling_asleep` is handled specially by the server: restores from `waiting_for_action` to the previous active state, is suppressed during active work (spurious SessionEnd), or is tracked for shutdown when no active state exists.

## State Machine & Interaction (pet.js)

Five states: `idle`, `waking_up`, `working`, `planning`, `waiting_for_action`

| State | Frames | Duration | Loops | Auto-transition |
|-------|--------|----------|-------|-----------------|
| idle | 4 | 1600ms | yes | — |
| waking_up | 20 | 4000ms | no | → idle (4000ms) |
| working | 4 | 1200ms | yes | — |
| planning | 4 | 1200ms | yes | — |
| waiting_for_action | 4 | 1600ms | yes | — |

- **Debounce**: 300ms — rapid state changes collapse to the latest event
- **Active states** (working, planning): loop until explicitly changed by a hook event (Stop → idle, UserPromptSubmit → working/planning)
- **Plan mode detection**: `on-prompt-submit.js` checks `permission_mode === "plan"` in stdin JSON to send `planning_started` instead of `working_started`
- **One-shot states** (waking_up): plays once then auto-returns to idle
- **`falling_asleep` handling**: event-server.js handles `falling_asleep` in three cases: (1) if pet is in `waiting_for_action` with a prior active state, restores to working/planning; (2) if pet is actively working/planning, suppresses the event (spurious SessionEnd); (3) if no active state, tracks the event for `on-session-end.js` shutdown check.
- **Awaken suppression**: when `awaken` arrives while `lastActiveEvent` is set or `lastEventName` is `action_requested`, event-server.js suppresses it silently — no state mutation, no forwarding to the renderer. Prevents spurious `SessionStart` (fired after permission prompts / AskQuestion answers) from interrupting work animations. Only fires `waking_up` when the pet has zero state (idle/fresh).

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
| `hooks-debug.log` | Timestamped log of all hook events sent via `send-event.js` |

## Development Commands

```bash
# Regenerate placeholder sprite assets
node scripts/generate-placeholders.js

# Install the plugin in Claude Code
claude --plugin-dir /path/to/code-pet

# Run Electron manually (after npm install)
npx electron src/app/main.js

# Send an event to the running pet (defaults to awaken)
./test.sh                    # sends awaken
./test.sh working_started    # sends working_started
```

## Sprite Format

Each sprite is a horizontal SVG strip of 64×64px frames with transparent background. Frame counts must match the `SPRITES` config in `src/renderer/pet.js`. CSS in `styles.css` uses `background-position` with `steps(N)` to animate.

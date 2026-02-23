# Code Pet

An animated desktop pet companion that reacts to Claude Code activity. The pet appears as a small overlay in the
bottom-right corner of your screen and responds to session events — working, planning, waiting, and more.

## Installation

**Step 1** — Add the marketplace (one-time setup):

```
/plugin marketplace add mradovic95/code-pet
```

**Step 2** — Install the plugin:

```
/plugin install code-pet
```

**Step 3** — Run `/reset` or start a new session so Claude picks up the new hooks.

That's it. Everything else is automatic:

1. Claude Code discovers hooks from `hooks/hooks.json`
2. On first session start, Electron is installed automatically in the background (~85MB)
3. On second session onward, the pet launches instantly

To uninstall:

```bash
claude plugin remove code-pet
```

## How It Works

```
Session starts → hook launches Electron overlay → pet wakes up
Prompt submitted → pet starts working (or planning in plan mode)
Notification → pet waits for action
Stop → pet returns to idle
Session ends → pet goes to sleep
```

The overlay is transparent, frameless, always-on-top, click-through, and never steals focus.

## Event Server

While running, the pet listens on `127.0.0.1:31425` (configurable via `CODE_PET_PORT`):

```bash
# Health check
curl http://localhost:31425/health

# Send an event
curl -X POST http://localhost:31425/event \
  -H 'Content-Type: application/json' \
  -d '{"event":"working_started"}'

# Shutdown
curl -X POST http://localhost:31425/shutdown
```

Valid events: `awaken`, `falling_asleep`, `working_started`, `planning_started`, `action_requested`, `work_finished`

## Custom Sprites

Replace the placeholder sprite sheets in `assets/sprites/` with your own artwork:

- Each file is a horizontal strip SVG
- Each frame is exactly 64x64px
- Transparent background
- Frame counts are configured in `src/renderer/dog.js` (`SPRITES` object)

| File                     | Frames | Description                         |
|--------------------------|--------|-------------------------------------|
| `idle.svg`               | 4      | Default resting animation (loops)   |
| `waking_up.svg`          | 4      | Session start greeting (plays once) |
| `going_to_sleep.svg`     | 4      | Sleeping/inactive (loops)           |
| `working.svg`            | 4      | Processing/working (loops)          |
| `planning.svg`           | 4      | Planning mode (loops)               |
| `waiting_for_action.svg` | 4      | Waiting for user action (loops)     |

To regenerate the placeholder sprites:

```bash
node scripts/generate-placeholders.js
```

## Project Structure

```
code-pet/
├── .claude-plugin/plugin.json    # Claude Code plugin manifest
├── hooks/
│   ├── hooks.json                # Hook event → script mapping
│   └── scripts/                  # Hook handler scripts
├── src/
│   ├── app/                      # Electron main process
│   └── renderer/                 # Overlay UI + sprite animation
├── assets/sprites/               # Sprite sheet SVGs
└── scripts/                      # Development utilities
```

## Requirements

- Node.js >= 18
- macOS, Linux, or Windows
- Claude Code with plugin support

## Troubleshooting

Force-stop the pet and clean up its PID file:

```bash
pkill -9 -f code-pet; rm -f ~/.code-pet/app.pid
```

# Code Pet

An animated desktop pet companion that reacts to Claude Code activity. The pet appears as a small overlay in the
bottom-right corner of your screen and responds to session events — thinking, typing, success, errors, and more.

## Installation

Add the plugin to Claude Code:

```bash
claude --plugin-dir /path/to/code-pet
```

That's it. Everything else is automatic:

1. Claude Code discovers hooks from `hooks/hooks.json`
2. On first session start, Electron is installed automatically in the background (~85MB)
3. On second session onward, the pet launches instantly

## How It Works

```
Session starts → hook launches Electron overlay → pet wakes up
Tool call begins → pet thinks or types
Tool call ends → pet celebrates or reacts to errors
Notification → pet returns to idle
Inactivity → pet returns to idle after 10s
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
  -d '{"event":"thinking"}'

# Shutdown
curl -X POST http://localhost:31425/shutdown
```

Valid events: `idle`, `wake`, `sleep`, `thinking`, `typing`, `success`, `error`

## Custom Sprites

Replace the placeholder sprite sheets in `assets/sprites/` with your own artwork:

- Each file is a horizontal strip PNG
- Each frame is exactly 64x64px
- Transparent background (PNG-24 with alpha)
- Frame counts are configured in `src/renderer/dog.js` (`SPRITES` object)

| File           | Frames | Description                         |
|----------------|--------|-------------------------------------|
| `idle.png`     | 4      | Default resting animation (loops)   |
| `wake.png`     | 4      | Session start greeting (plays once) |
| `sleep.png`    | 4      | Sleeping/inactive (loops)           |
| `thinking.png` | 4      | Processing/reading (loops)          |
| `typing.png`   | 6      | Writing/editing files (loops)       |
| `success.png`  | 4      | Tool succeeded (plays once)         |
| `error.png`    | 4      | Tool failed (plays once)            |

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
├── assets/sprites/               # Sprite sheet PNGs
└── scripts/                      # Development utilities
```

## Requirements

- Node.js >= 18
- macOS, Linux, or Windows
- Claude Code with plugin support

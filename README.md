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
Session ends → pet shuts down (if no active work)
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

Valid events: `awaken`, `falling_asleep`, `working_started`, `planning_started`, `action_requested`, `work_finished`, `action_completed`

## Custom Sprites

Each pet has its own directory in `assets/pets/{id}/` with a `manifest.json` and sprite sheets:

- Each sprite is a horizontal strip (PNG or SVG)
- Each frame is exactly 64x64px
- Transparent background
- All strips must be exactly `frameSize × frameCount` pixels wide (e.g., 256x64 for 4 frames)
- Frame counts are defined in each pet's `manifest.json`

| File                     | Frames | Description                         |
|--------------------------|--------|-------------------------------------|
| `idle.png`               | 4      | Default resting animation (loops)   |
| `waking_up.png`          | 4+     | Session start greeting (plays once) |
| `working.png`            | 4      | Processing/working (loops)          |
| `planning.png`           | 4      | Planning mode (loops)               |
| `waiting_for_action.png` | 4      | Waiting for user action (loops)     |
| `icon.png`               | 1      | 64x64 icon (first frame of idle)    |

## Premium Pets (Marketplace)

Premium pets are purchased from the marketplace and downloaded via license key. To configure:

1. Create `~/.code-pet/marketplace.json`:
   ```json
   {
     "baseUrl": "https://2vyd33gumd.execute-api.us-east-2.amazonaws.com/stage",
     "apiKey": "your-api-key",
     "marketplaceId": 1
   }
   ```
2. Open the pet settings (double-click the pet) and use the Store tab
3. Buy a pet (free or via PayPal for premium)
4. Activate the license key

Without a `marketplace.json`, the app runs in mock mode with dev assets.

## Project Structure

```
code-pet/
├── .claude-plugin/plugin.json    # Claude Code plugin manifest
├── hooks/
│   ├── hooks.json                # Hook event → script mapping
│   └── scripts/                  # Hook handler scripts
├── src/
│   ├── app/                      # Electron main process + marketplace integration
│   └── renderer/                 # Overlay UI + sprite animation + settings/store
├── assets/pets/                  # Free pet sprite sheets (PNG, 64×64 frames)
├── assets/pets-dev/              # Premium pet dev assets (copied in mock mode)
├── test/                         # Unit + integration tests (node:test)
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

Check hook event logs for debugging:

```bash
tail -f ~/.code-pet/hooks-debug.log
```

# Troubleshooting

Runtime state lives in `~/.code-pet/`. Most issues can be resolved by
inspecting logs or cleaning up the PID file.

## Force-stop the pet

If the overlay won't close or hooks can't reach the server:

```bash
pkill -9 -f code-pet; rm -f ~/.code-pet/app.pid
```

## Debug logging

Logging is off by default. To enable:

```bash
touch ~/.code-pet/debug
```

To disable:

```bash
rm ~/.code-pet/debug
```

## Watch hook events live

```bash
tail -f ~/.code-pet/hooks-debug.log
```

Each line is a timestamped record of a hook event sent via `send-event.js`,
plus the full stdin JSON the hook received from Claude Code.

## App logs

| File | Contents |
|---|---|
| `~/.code-pet/code-pet.log` | Structured app log (1 MB, truncated on overflow) |
| `~/.code-pet/app.log` | Electron stdout/stderr |
| `~/.code-pet/install.log` | npm install output (first-run Electron installation) |
| `~/.code-pet/installing` | Lock file during npm install (contains PID, stale after 10 min) |

## First-run install stuck

On first `SessionStart`, Code Pet runs `npm install` in the background to
fetch Electron (~85 MB). If this stalls:

```bash
# Check whether install is in progress
cat ~/.code-pet/installing

# Tail install output
tail -f ~/.code-pet/install.log

# Force retry
rm ~/.code-pet/installing
```

Then start a new Claude Code session.

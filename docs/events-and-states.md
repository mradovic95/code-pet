# Events and states

Code Pet runs a small HTTP server while the overlay is alive and exposes a
semantic event API. Hooks in `hooks/scripts/` translate Claude Code events
into HTTP POSTs; the server routes them through a per-project state machine.

## Event server

While running, the pet listens on `127.0.0.1:31425` (configurable via the
`CODE_PET_PORT` env var):

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

## Valid events

`awaken`, `falling_asleep`, `working_started`, `planning_started`,
`action_requested`, `work_finished`, `action_completed`, `dismiss`

## Event → state mapping

| Event | Resulting state | Triggered by |
|---|---|---|
| `awaken` | *(renderer-only `waking_up` animation — state stays `idle`)* | SessionStart |
| `working_started` | `working` | UserPromptSubmit (normal mode) |
| `planning_started` | `planning` | UserPromptSubmit (plan mode) |
| `action_requested` | `waiting_for_action` | Notification (permission_prompt) |
| `work_finished` | `idle` | Stop |
| `action_completed` | *(restores previous active state)* | PostToolUse (any tool) |
| `falling_asleep` | *(removes project only in `idle`; ignored elsewhere)* | SessionEnd |
| `dismiss` | *(removes project unconditionally)* | UI: Settings → Dismiss Pet |

See [`hook-table.md`](./hook-table.md) for the complete hook → event → state
matrix, and [`state-diagram.puml`](./state-diagram.puml) for the PlantUML
diagram.

## Dev utility

`./test.sh` is a small curl wrapper for exercising the event API during
development:

```bash
./test.sh                    # sends awaken
./test.sh working_started
./test.sh planning_started
./test.sh action_requested
./test.sh work_finished
```

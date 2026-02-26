# State Machine Refactoring

## Summary

Replaced the procedural inline event handling in `event-server.js` with a proper state machine using the **whitelist pattern**: a `BaseState` class ignores all events by default, and each concrete state class explicitly overrides only the events it handles. This eliminates duplicate event sends, makes transitions self-documenting, and moves all event logic out of the HTTP server.

## How It Worked Before

All event handling lived inside the `/event` POST handler in `event-server.js` as a single procedural block:

- A flat `EVENT_TO_STATE` mapping converted event names to state names
- Three module-level variables (`lastEventName`, `lastActiveEvent`, `lastEventTime`) tracked state
- Special events (`question_answered`, `falling_asleep`, `awaken`) were handled via nested `if/else` blocks at the top of the handler
- There was no concept of "current state" — the server only tracked the last event name and checked it when needed
- Duplicate events were never filtered: sending `working_started` twice would re-send the state to the renderer both times
- All transition logic, suppression rules, and restore-from-context behavior were interleaved with HTTP response code

The old handler (~70 lines of branching logic):

```
POST /event → read body
  → if question_answered: check lastActiveEvent, maybe restore
  → if falling_asleep: 3-way branch on lastEventName/lastActiveEvent
  → else: lookup EVENT_TO_STATE
    → if awaken: suppress if lastActiveEvent set
    → update lastEventName/lastActiveEvent
    → sendToRenderer
    → respond
```

Problems:
- Adding a new state or event required understanding every `if/else` branch
- No way to see at a glance which events are valid in which state
- The same event could trigger different behavior depending on subtle ordering of checks
- Suppression logic for `awaken` was a special case bolted onto the general handler

## How It Works Now

### The Whitelist Pattern

`BaseState` defines a handler method for every event (`onAwaken`, `onWorkingStarted`, etc.), each returning `this.ignore(eventName)` by default. Subclasses override **only** the events they care about:

```js
// BaseState — everything is ignored by default
onAwaken(eventName)           { return this.ignore(eventName); }
onWorkingStarted(eventName)   { return this.ignore(eventName); }
// ...all 7 events

// IdleState — explicitly handles 5 events, inherits ignore for the rest
onAwaken() {
  this.context.lastEventName = this.eventName;
  return this.result({
    rendererState: 'waking_up',
    response: { state: 'waking_up' },
  });
}
onWorkingStarted() {
  this.context.lastActiveEvent = this.eventName;
  return this.transitionTo(STATES.WORKING);
}
```

This means:
- `awaken` while `working` → automatically ignored (no special suppression code needed)
- `working_started` while already `working` → automatically ignored (no duplicate sends)
- `action_requested` while already `waiting_for_action` → automatically ignored

The old awaken-suppression logic (`if (lastActiveEvent !== null || lastEventName === 'action_requested')`) is now emergent: `WorkingState`, `PlanningState`, and `WaitingForActionState` simply don't override `onAwaken`, so `BaseState.ignore()` handles it.

### Architecture

```
event-server.js (thin HTTP layer)
  → PetContext.handleEvent(eventName)
    → currentState.handleEvent(eventName)
      → dispatches to onXxx() method via EVENT_METHOD_MAP
      → state mutates context directly (transitions, tracked fields)
      → returns result object { rendererState, response, statusCode, action }
    → returns result to HTTP layer
```

The server (`event-server.js`) now contains **zero event logic** — it only:
1. Routes HTTP requests
2. Calls `context.handleEvent(eventName)`
3. Sends the result to the renderer if `rendererState` is set
4. Removes the project if `action === 'remove_project'`

### Class Hierarchy

```
BaseState                         ← ignore-all defaults + helper methods
  ├── IdleState                   ← awaken, working, planning, action, falling_asleep
  ├── ActiveState                 ← action_requested, work_finished, falling_asleep, question_answered
  │     ├── WorkingState          ← + planning_started
  │     └── PlanningState         ← + working_started
  └── WaitingForActionState       ← working, planning, work_finished, question_answered, falling_asleep
```

`ActiveState` is an intermediate class shared by `WorkingState` and `PlanningState`. It handles the events common to both active work states (transition to waiting, finish work, remove project on falling asleep, re-render on question answered). Each subclass only adds the ability to switch to the *other* active state.

### File Structure

```
src/app/state-machine/
  states.js                   ← STATES constant (idle, working, planning, waiting_for_action)
  events.js                   ← EVENTS, EVENT_TO_STATE, VALID_EVENTS constants (re-exports STATES)
  base-state.js               ← BaseState: dispatch, defaults, helpers
  state-factory.js            ← createState(): maps state name → class instance
  active-state.js             ← ActiveState: shared working/planning behavior
  idle-state.js               ← IdleState
  working-state.js            ← WorkingState (extends ActiveState)
  planning-state.js           ← PlanningState (extends ActiveState)
  waiting-for-action-state.js ← WaitingForActionState
  pet-context.js              ← PetContext: orchestrator, owns mutable state per project
```

### Result Objects

Every handler returns a result object via `BaseState.result()`:

```js
{
  rendererState:  undefined,   // state to send to renderer (undefined = don't send)
  response:       {},          // HTTP response body
  statusCode:     200,         // HTTP status code
  action:         undefined,   // 'remove_project' triggers project cleanup
}
```

State transitions and tracked-field mutations (`lastActiveEvent`, `lastEventName`) happen imperatively inside handlers via `this.context`. The result object is purely for communicating back to the HTTP layer — `ignore()` returns a minimal result with no `rendererState` or `action`.

## State x Event Matrix

| Event \ State | `idle` | `working` | `planning` | `waiting_for_action` |
|---|---|---|---|---|
| `awaken` | **stay idle** (renderer waking_up) | ignore | ignore | ignore |
| `working_started` | **→ working** | ignore | **→ working** | **→ working** |
| `planning_started` | **→ planning** | **→ planning** | ignore | **→ planning** |
| `action_requested` | **→ waiting** | **→ waiting** | **→ waiting** | ignore |
| `work_finished` | ignore | **→ idle** | **→ idle** | **→ idle** |
| `question_answered` | ignore | re-render | re-render | restore / ignore |
| `falling_asleep` | remove | remove | remove | restore / remove |

**Legend:**
- **stay idle** = no state transition, sends renderer-only `waking_up` animation
- **→ state** = transition to that state + send to renderer
- **ignore** = `BaseState` default, no state change, no renderer update
- **re-render** = send current state to renderer again (e.g., after AskUserQuestion completes)
- **restore** = transition to state stored in `lastActiveEvent` (if set), otherwise fall back to ignore or remove
- **remove** = remove the project (triggers shutdown timer if no projects remain)

## Verification

Manual verification via `test.sh`:

```bash
# Basic lifecycle
./test.sh awaken           # idle → idle (plays waking_up animation)
./test.sh working_started  # → working
./test.sh work_finished    # → idle

# Duplicate suppression (implicit from whitelist)
./test.sh working_started  # idle → working
./test.sh working_started  # ignored (already working)

# Awaken suppression (implicit from whitelist)
./test.sh working_started  # idle → working
./test.sh awaken           # ignored (WorkingState doesn't handle awaken)

# question_answered restore
./test.sh working_started       # → working
./test.sh action_requested      # → waiting_for_action
./test.sh question_answered     # → working (restored from lastActiveEvent)

# falling_asleep behavior
./test.sh working_started       # → working
./test.sh falling_asleep        # remove project

./test.sh awaken                # idle (plays waking_up animation)
./test.sh falling_asleep        # remove project
```

Verify responses using the `/last-event` endpoint:
```bash
curl -s "http://127.0.0.1:31425/last-event?project=$(pwd)"
```

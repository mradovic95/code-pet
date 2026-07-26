# Investigation: Pet behavior with background subagents

**Date:** 2026-07-13
**Status:** Implemented (2026-07-13)

## Question

When Claude Code runs a **background subagent** (Agent/Task tool running async), does the pet go idle and let the
subagent run, or does it wait for the subagent to finish?

## Method

- Read the hook scripts (`hooks/scripts/*.js`, `hooks/hooks.json`) and the server state machine (
  `src/app/pet/state-machine/`).
- Mined real hook traffic from `~/.code-pet/hooks-debug.log` (debug sentinel enabled).
- Ran a live experiment: launched an actual background subagent from a Claude Code session in this repo and observed
  which hooks fired, when, and with what payloads.
- Cross-checked Claude Code hook semantics against the official docs (code.claude.com/docs).

## Findings

**Short answer: the pet does NOT wait. It goes idle the moment the main agent's turn ends, and everything the background
subagent does afterwards is invisible to it.**

### Verified timeline for a background subagent

1. **User submits prompt** → `UserPromptSubmit` → `working_started` → pet shows `working`.
2. **Background agent launches** → `PostToolUse` for the `Agent` tool fires **immediately at launch** (verified live),
   not at completion → `action_completed` → `ActiveState.onActionCompleted()` re-affirms `working`. No visible change.
3. **Main agent ends its turn while the subagent still runs** → `Stop` fires immediately (background work does not defer
   it) → `work_finished` → `ActiveState.onWorkFinished()` (`src/app/pet/state-machine/active-state.js:18`) clears
   `lastActiveEvent` and transitions to **`idle`**.
4. **Subagent keeps working** → its inner tool calls **do** fire the parent session's `PostToolUse` hook, tagged with
   `agent_id`/`agent_type` in the stdin JSON (verified in live payloads for both background and foreground agents). Each
   sends `action_completed` → but `IdleState` doesn't override `onActionCompleted`, so `BaseState.ignore()` swallows
   them (`src/app/pet/state-machine/base-state.js:37`). **Pet stays idle while real work happens.**
5. **Subagent finishes** → Claude Code fires `SubagentStop` (docs: "Stop hooks automatically convert to SubagentStop for
   subagents") — code-pet does not register `SubagentStop` in `hooks/hooks.json`, so nothing reaches the pet.
6. **Task-notification wrap-up turn**: the subagent's completion re-invokes the main agent. This does **not** fire
   `UserPromptSubmit` (verified: only one prompt-submit in the log for the whole session). The wrap-up turn's tool calls
   send `action_completed` → ignored in idle. Its final `Stop` sends `work_finished` → also ignored in idle (`IdleState`
   has no `onWorkFinished`). **The pet sleeps through the entire wrap-up turn.**

### Exception

A **permission prompt** raised during background work (by main agent or subagent) still fires `Notification` →
`action_requested` → `IdleState.onActionRequested()` → pet shows `waiting_for_action`; the next `action_completed` (
carrying `permissionMode`) then moves it to `working`/`planning` via `WaitingForActionState.onActionCompleted()`.

### Contrast: foreground subagents already behave correctly

The main turn doesn't end while a foreground subagent runs; its inner `PostToolUse` events re-affirm `working`, so the
pet animates as working until the real `Stop`.

## UX assessment

The pet's one job is to answer "is Claude still doing something for me?" at a glance. With a background subagent
running, the true answer is *yes* (the result isn't ready), but the pet says *no*. The pet should stay/return to
`working` while subagents tied to the session run, going idle only when the session is truly quiescent.

## Proposed fix

Wake the idle pet on **subagent-tagged** `action_completed` events only. Return-to-idle needs no new hook: once the pet
is back in `working`, the wrap-up turn after the subagent completes ends with a normal `Stop` → `work_finished` → idle
via existing `ActiveState.onWorkFinished()`.

Untagged `action_completed` in idle stays ignored — that guard protects against a main-agent `PostToolUse` racing in
just after `Stop` and resurrecting the pet with no later `Stop` to put it back to sleep.

Deliberately **not** registering `SubagentStop`: it fires for foreground subagents too, mid-turn, and mapping it to
`work_finished` would wrongly idle the pet in the middle of active work.

### Changes

1. **`hooks/scripts/on-post-tool-use.js`** — forward the subagent marker:
   `sendEvent('action_completed', { permissionMode: input.permission_mode, toolName: input.tool_name, toolInput: input.tool_input, agentId: input.agent_id })`
2. **`src/app/server/event-server.js`** (~line 156) — mirror the existing `permissionMode` pattern: set
   `pet.lastAgentId = body.agentId || null` on every `/event` before dispatch (reset to null when absent, so a stale
   flag can't linger).
3. **`src/app/pet/state-machine/pet-context.js`** — add `this.lastAgentId = null;` to the constructor (alongside
   `permissionMode`).
4. **`src/app/pet/state-machine/idle-state.js`** — add `onActionCompleted()`:
    - if `!this.context.lastAgentId` → `return this.ignore()` (preserve current behavior for main-agent events);
    - else reuse the mode logic from `WaitingForActionState.onActionCompleted()` (`waiting-for-action-state.js:24-39`):
      `permissionMode === 'plan'` → set `lastActiveEvent = EVENTS.PLANNING_STARTED`, transition to `PLANNING`; otherwise
      set `lastActiveEvent = EVENTS.WORKING_STARTED`, transition to `WORKING`.
5. **Docs** — update `docs/hook-table.md` (PostToolUse row: "ignored in idle" → "ignored in idle unless agent-tagged (
   background subagent) — then resumes working/planning") and the matching CLAUDE.md bullet under Events and States.

### Tests (conventions: `sut`, GIVEN/WHEN/THEN, mock context)

- `test/unit/state-machine/idle-state.test.js`:
    - stays ignored on `action_completed` without `lastAgentId` (regression guard for the race);
    - transitions to `working` on `action_completed` with `lastAgentId` set;
    - transitions to `planning` with `lastAgentId` + `permissionMode: 'plan'`;
    - sets `lastActiveEvent` accordingly.
- `test/unit/event-server.test.js`: `agentId` in body sets/clears `pet.lastAgentId`.
- `test/integration/hook-post-tool-use.test.js`: stdin containing `agent_id` → HTTP payload contains `agentId`.

### Verification

1. `npm test` (unit + integration).
2. Live: with the pet running and debug on, launch a background agent in a Claude Code session, end the turn — pet
   should drop to idle at `Stop`, then flip back to `working` on the subagent's first tool event, then go idle after the
   wrap-up turn's `Stop`. Confirm the sequence in `~/.code-pet/hooks-debug.log` / `code-pet.log`.
3. Regression: normal prompt → work → Stop still idles the pet; foreground subagents unchanged.

## Known edge case (accepted)

If a subagent's last tool event arrives *after* the wrap-up turn's final `Stop` (unlikely — the subagent finished before
the wrap-up turn even started), the pet would wake with no `Stop` to follow. The next user prompt or turn end heals it.

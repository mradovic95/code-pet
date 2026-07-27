# Agent-Type Attribution for Usage Events — Investigation

**Date:** 2026-07-21 · **Claude Code CLI:** 2.1.201 · **Status:** resolved — implemented

## Question

Usage events carry an optional `agentId` that marks "this skill/MCP call ran
inside *some* subagent" — but not *which kind* (Explore, Plan, code-reviewer, …).
Can we attribute inner tool calls to the subagent's type?

The initial hypothesis ("option 1") was that the `agent_id` on inner hook payloads
might equal the `tool_use_id` of the `Task`/`Agent` call that spawned the subagent,
letting us reuse the pending-tool-start map on `PetContext` (which already sees
`toolInput.subagent_type` at spawn time) as a lookup table.

## Method

1. Enabled hook debug logging (`touch ~/.code-pet/debug`) so every hook script dumps
   its full stdin JSON to `~/.code-pet/hooks-debug.log`.
2. Spawned two subagents (`Explore`, `claude-code-guide`) from a live session and let
   them run Read/Bash/Grep. A third, organic spawn from a second concurrent session
   landed in the log as a bonus sample.
3. Inspected 3 spawn payloads and 13 inner tool-call payloads.
4. Cross-checked against the official hooks reference:
   https://code.claude.com/docs/en/hooks

## Findings

### 1. The option-1 hypothesis is false

`agent_id` and `tool_use_id` live in different namespaces and never match:

| Field | Example |
|---|---|
| spawn `tool_use_id` | `toolu_01A5z4y6irLpDUcetBj2b2Kw` |
| inner `agent_id` | `a58b187b8511d2779` |

### 2. No correlation is needed — `agent_type` is delivered directly

Every PreToolUse/PostToolUse payload for a tool call made **inside** a subagent
carries **both** fields as documented common input fields:

```json
{"hook_event_name":"PostToolUse","tool_name":"Bash",
 "agent_id":"a58b187b8511d2779","agent_type":"Explore", ...}
```

Per the docs: `agent_type` is "Agent name (for example, `Explore` or
`security-reviewer`)… For subagents shipped by a plugin, this is the plugin-scoped
identifier such as `my-plugin:reviewer`". Present whenever the hook fires inside a
subagent (or the session runs with `--agent`). All 13 captured inner payloads had it.

### 3. Bonus observations (future options, not used)

- The spawn's own PostToolUse `tool_response` contains the spawned agent's id
  (`tool_response.agentId`) next to `tool_input.subagent_type` — an undocumented but
  observed direct mapping, useful if per-instance (not per-type) attribution is ever
  wanted.
- `SubagentStart` / `SubagentStop` hook events exist (documented; matcher filters on
  agent type). Payload schemas are not fully documented.

## Design chosen

Thread the field through the existing `agentId` path, identically:

```
on-post-tool-use.js  (agentType: input.agent_type)
  → event-server.js  (extra.agentType)
    → PetContext.recordToolUsage (opaque pass-through)
      → UsageEvent (optional frozen field, serialized to usage.log)
```

Analytics: `agentSplit()` gains a `byType` breakdown; the report's Top Agents table
gains a "Calls inside" column (agent_type and subagent_type share the same
namespace, so spawn counts and inner-call counts join on the event name).

**Fallback:** on older CLI versions without `agent_type`, the field is simply absent
— events stay untyped exactly as before; tagged-but-untyped events group under
`unknown` in `byType`. No breakage, no migration.

## Cleanup

Debug logging was disabled after the probe (`rm ~/.code-pet/debug`);
`hooks-debug.log` can be deleted freely.

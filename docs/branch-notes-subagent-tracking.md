# Branch Notes: subagent tracking

Summary of the subagent-tracking work on this branch vs `main`.

> The branch also originally carried an opt-in **built-in tool tracking**
> feature (a `builtin` event type + a Settings toggle). That was removed
> before release — built-in tools are high volume and added little analytical
> value, and the Usage-tab read path parsed the whole log on every open. Only
> the subagent + agent-type work below ships. (The branch name still contains
> "builtin" for history continuity; the feature does not.)

## What it does

The usage-tracking subsystem previously recorded two event types: `skill` and
`mcp_tool`. This branch adds one more:

- **`subagent` — always on.** Every subagent spawn (the `Task`/`Agent` tool)
  is recorded, with the event name taken from `tool_input.subagent_type`.

It also records which agent type a tool call ran *inside* (`agentType`) and
surfaces the new data in the settings Usage tab and the report.

## Changes by area

### Hooks

- `hooks/hooks.json` — PreToolUse matcher widened from `Skill|mcp__.*` to
  `Skill|Task|Agent|mcp__.*`, so subagent spawns participate in
  PreToolUse→PostToolUse duration pairing.
- `hooks/scripts/on-pre-tool-use.js` — comment updated to match.

### Recording (main process)

- `src/app/state-machine/pet-context.js` — `recordToolUsage()` gained a
  branch: `SUBAGENT_TOOL_NAMES` (`Task`, `Agent`; exact-match Set) records a
  `subagent` event with the name taken from `subagent_type`. Other built-in
  tools are not recorded.

### Analytics (`src/tracking/usage-analytics.js`)

- New report data: `totals.subagents`, `topAgents` (runs, sessions, avg/max
  duration per agent type), and `agentSplit` (% of events carrying an
  `agentId`, i.e. run inside a subagent, with a `byType` breakdown).
- New section in both the markdown and HTML report renderers: **Top Agents**
  (with a **Calls inside** column joining spawn counts with inner-call counts).

> A `WORKFLOW_TYPES` / `filterWorkflow()` whitelist that scoped insight sections
> to `skill`/`mcp_tool`/`subagent` was added earlier on this branch and then
> **removed** — it was a no-op on any released-version log (recording only ever
> writes those three types) and existed only to keep legacy `builtin` lines out
> of insights, but `builtin` was never in a released version. Insight sections
> now aggregate the (period/project/session-filtered) event set directly.

### Agent-type attribution

- `hooks/scripts/on-post-tool-use.js` + `src/app/event-server.js` — the hook
  payload's documented `agent_type` field is forwarded through the existing
  `agentId` path and lands as an optional `agentType` on `UsageEvent`
  (`src/tracking/usage-event.js`).
- Events from CLI versions without the field stay untyped and group under
  "unknown".
- Investigation notes: `docs/agent-type-attribution-investigation.md`.

### Usage tab: Agents section + typed badges

- `src/renderer/tabs/usage.html` + `settings.js` + `settings.css` — an
  **Agents** section (per-agent-type run counts) alongside MCP Tools and
  Skills, narrowed by the same period/project/session filters. Event Log
  badges map each event type to its own pill (MCP / Skill / Agent) instead
  of labeling everything non-MCP as Skill.

### Dev scripts

- `scripts/generate-fake-usage.js` — the fake-usage generator emits the three
  tracked event types (skill, mcp_tool, subagent). Subagent runs carry
  `durationMs`; each run's inner events are tagged with the run's `agentId` +
  `agentType` (~10% of runs omit `agentType` to mimic hook payloads from older
  CLI versions).

### Docs & tests

- Updated: `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `docs/usage-tracking.md`,
  `docs/hook-table.md`.
- New/extended tests: `test/unit/state-machine/pet-context.test.js`
  (subagent recording, agent-type forwarding, built-ins never recorded),
  `test/unit/tracking/usage-analytics.test.js` (agentSplit,
  Top Agents report section), and integration tests
  `test/integration/hook-pre-tool-use.test.js` /
  `hook-post-tool-use.test.js` (Task/Agent matcher contract).

## Event flow (subagent)

```
PreToolUse (Skill|Task|Agent|mcp__.*) → action_started (starts duration timer)
PostToolUse (any tool)                → action_completed
  → PetContext.recordToolUsage(toolName, toolInput, { durationMs, agentId, agentType })
      mcp__*        → 'mcp_tool' event
      Skill         → 'skill' event
      Task | Agent  → 'subagent' event (name = subagent_type)
      anything else → not recorded
  → UsageTracker → FilesystemStore → ~/.code-pet/usage.log (NDJSON)
```

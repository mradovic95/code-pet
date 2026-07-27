# File & Directory Activity Metrics — Investigation

**Question:** Should Code Pet gain a feature/view that shows which files and directories
(per project or per session) are most opened, edited, or otherwise touched during
development — analogous to the existing skill/MCP/subagent Usage tab? Does anything like it
already exist, and does it make sense to build?

**Status:** Implemented (branch `feat/file-activity-view`). The investigation below stands; the
chosen approach diverged from §5's hook-based recommendation toward a cheaper, on-demand
transcript-based design — see **Decision** at the end.

---

## 1. Does anything like it exist today?

**No.** The tracking subsystem records exactly three event types and nothing file-shaped:

| Recorded type | Source tool    | `name` field              |
|---------------|----------------|---------------------------|
| `skill`       | `Skill`        | `toolInput.skill`         |
| `mcp_tool`    | `mcp__*`       | full tool name            |
| `subagent`    | `Task`/`Agent` | `toolInput.subagent_type` |

(`src/app/pet/state-machine/pet-context.js:62` — `recordToolUsage`.) A grep across
`src/tracking/` finds no file/directory/hotspot/path aggregation anywhere. The analytics
module (`usage-analytics.js`) produces top-skills, top-MCP, agent split, weekly/day/week/month
trends, co-occurrence, dormant detection, and duration stats — none of them file-aware.

The design is deliberate. Both CLAUDE.md and the code comment state it plainly:

> Other built-in tools (Read, Bash, Edit, …) are not recorded — they are high volume and add
> little analytical value.

So this feature is a **reversal of a documented decision**, not a gap. That matters for how we
justify it.

## 1a. Prior art — has anyone built this elsewhere?

Yes — the *idea* is mature and well-proven, and there are even Claude-Code-specific tools in
the space. But nobody does exactly what's proposed here (agent-touched file/dir hotspots
surfaced locally in the pet's own Usage tab). Three tiers of prior art:

**Tier 1 — Git/editor-based hotspot & churn tools (mature, but measure the *human*, not the agent).**

- **CodeScene** — the canonical "behavioral code analysis" product. Ranks *hotspots* = files
  with the highest Git change frequency (× complexity), on the well-established finding that
  change frequency correlates with defects and maintenance cost. This is the intellectual
  origin of "most-touched files = where attention/risk concentrates."
- **WakaTime** — automatic editor-plugin time tracking; reports time spent "down to the file,"
  per project/branch/language, and now even tags AI-generated code per file. Closest thing to
  "which files did I spend time in," but it instruments the *editor*, not an agent.
- **git-of-theseus / GitChurnJS / GitClear** — churn/growth visualizers driven by Git history.

  → All of these read Git commits or editor telemetry. They cannot see what an AI agent *read*
  (Read never touches Git) or which files it opened but didn't commit. Code Pet's data source is
  fundamentally different: the agent's tool calls.

**Tier 2 — Official Claude Code analytics (agent-aware, but team-level and gated).**

- Anthropic ships a **Claude Code Analytics dashboard + Admin API** — sessions, lines
  added/removed, commits/PRs, and *accept/reject rates per editing tool (Edit, MultiEdit, Write,
  NotebookEdit)*, plus token/cost by model. This confirms the tool-level data is considered
  valuable. **But**: it is org/team aggregate, aimed at adoption/productivity management, gated
  to orgs on the Anthropic API + Console — not a per-developer, per-file "what did I work on in
  this session" view, and not local.

**Tier 3 — Community Claude Code monitors (closest prior art, and validating).**

- **hoangsonww/Claude-Code-Agent-Monitor** — a real-time dashboard tracking sessions, agent
  activity, tool usage, and subagent orchestration… and it literally ships "a cute buddy."
  Strikingly close to Code Pet's premise. It's a heavyweight separate web app (SQLite + Express +
  React + WebSockets).
- **JKershaw/dash** — analyzes Claude Code conversation logs to surface friction and a timeline.
- **claude-code-usage-dashboard** plugin — usage/cost tracking.

  → These prove the appetite for local, individual, agent-activity analytics. None of them
  (from what's visible) specifically rank *most-touched files/directories*, and all are standalone
  apps you install and run separately.

**What this means for Code Pet's version.** The concept is validated on all fronts — hotspots
are a proven signal (Tier 1), tool-level file activity is officially considered worth tracking
(Tier 2), and local per-session agent monitors already have users (Tier 3). Code Pet's *unique
angle* is narrow but real: the file/directory data **already flows through its pipeline for
free** (see §2), so it can offer a lightweight, zero-extra-dependency, always-present "hotspots
of this session/project" view inside a tool the developer is already running — without a
separate dashboard app, without Git history, and covering *reads* (attention) that Git-based
tools structurally can't see. It's a differentiated slice, not a novel category.

## 2. Is the data even available? (Yes — the plumbing already exists)

This is the surprising finding. The raw material is **already flowing to the server and being
discarded**:

- `hooks/hooks.json` registers `PostToolUse` with **no matcher** → the hook fires for *every*
  tool, not just the tracked three.
- `hooks/scripts/on-post-tool-use.js:32` already forwards `toolInput` in the `action_completed`
  payload.
- `event-server.js:168` already passes `body.toolInput` into `recordToolUsage`, which inspects
  it — then falls through to the "not recorded" no-op for Read/Edit/Write/etc.

The tool inputs that carry usable paths:

| Tool            | Path field                | Maps to concept                      |
|-----------------|---------------------------|--------------------------------------|
| `Read`          | `file_path`               | file **opened**                      |
| `Edit`          | `file_path`               | file **edited**                      |
| `Write`         | `file_path`               | file **written**                     |
| `NotebookEdit`  | `notebook_path`           | notebook edited                      |
| `Glob` / `Grep` | `path` (a dir), `pattern` | directory **searched** (weak signal) |
| `Bash`          | `command`                 | no reliable path — **not usable**    |

Directory metrics are free: `path.dirname(file_path)` rolled up. Timing ("when files are
touched") is also free — every `UsageEvent` already carries `timestamp`, and `durationMs`
pairing already works for any tool with a `tool_use_id`.

**Mapping the user's three verbs:**

- *opened* → `Read` ✅
- *edited* → `Edit`/`Write`/`NotebookEdit` ✅
- *cited* → ❌ no hook exists for "referenced in the conversation/response." Only
  tool-touched files are observable. "Cited" can't be delivered as asked; the honest scope is
  "files touched by tools."

## 3. What would it take to build?

Small-to-medium, and it rides existing rails:

1. **New event types** in `recordToolUsage` — e.g. `file_read`, `file_edit`, with
   `name` = the (ideally project-relative) path. `UsageEvent` is already generic; no schema
   change needed beyond allowing the new `type` strings.
2. **New analytics** in `usage-analytics.js` — `topFiles`, `topDirectories` (dirname rollup),
   optionally per-session vs per-project split. These are the same `topN`/grouping primitives
   already in the file.
3. **New Usage-tab section + report block** — mirror the existing "Skill Insights" /
   "top MCP" tables. Report must stay script-free (sandboxed iframe) — same constraint as
   today.
4. **Hook**: essentially nothing. `PostToolUse` already fires for all tools and forwards
   `toolInput`. This is the cheapest part.

## 4. The real costs (why this isn't a clear yes)

1. **Log volume.** `usage.log` "grows unbounded by design." Read/Edit fire orders of magnitude
   more than skills — a single session can touch hundreds of files. Recording one NDJSON line
   per file-touch inflates the log 10–100×. This is the exact reason the events were excluded.
2. **Privacy.** Absolute file paths are more sensitive than skill names — they leak directory
   structure, filenames, sometimes usernames. `projectPath` already does some of this, but
   per-file paths multiply the exposure. Storing **project-relative** paths mitigates most of it.
3. **Cardinality.** A handful of skills vs. potentially thousands of distinct paths. The UI and
   analytics must be top-N + rollup from day one; a flat list won't work like the skill list does.
4. **Signal quality.** Read-count ≠ importance (a file re-read 20× may just be large/awkward).
   Useful as a "where attention went" heat map, misleading as a "most important file" ranking.

## 5. Recommendation

**Worth building, but only if scoped deliberately — not as a straight copy of the skill
tracker.** Concretely:

- **Record only `Read`/`Edit`/`Write`/`NotebookEdit`.** Skip `Bash` (no path), and skip
  `Glob`/`Grep` initially (weak signal, high noise).
- **Store project-relative paths**, not absolute — kills most of the privacy cost.
- **Consider aggregate-count storage** (a per-file counter snapshot) instead of one log line
  per touch, to avoid the volume blow-up. This is a departure from the current "one event = one
  NDJSON line" store model, so it needs its own store variant or a periodic-flush design — the
  main design question if we proceed.
- **Gate behind a flag, default OFF** (`USAGE_TRACK_FILES` env / settings toggle), consistent
  with how volume-sensitive behaviors like `CODE_PET_IDLE_CLEANUP` are handled. Cataloguing it
  in `docs/feature-flags.md` would be required.
- **Drop "cited"** from scope — it's not observable from hooks; deliver "files/directories
  touched" and label it honestly.

If the volume/privacy concerns can't be resolved to satisfaction, an alternative is a
**session-scoped, in-memory-only** view (a "this session's hotspots" panel that never persists),
which sidesteps both the log growth and the long-term privacy footprint while still answering
"what did I work on just now."

## 6. Next step (per issue-first policy)

Code-pet requires a prior issue before any PR (`project_closed_solo`). Open an issue capturing
the decision below before opening the PR for `feat/file-activity-view`.

## 7. Decision (implemented)

§5 assumed hooks as the source and spent its effort *mitigating* the volume/privacy cost. The
better move was to **avoid that cost entirely**: parse the Claude Code **session transcript on
demand** instead of recording via hooks. The transcript
(`~/.claude/projects/<encoded-project>/<session-id>.jsonl`, one file per session) already
contains every `Read`/`Edit`/`Write`/`NotebookEdit` with its `file_path`, plus `.sessionId`,
`.cwd`, `.timestamp` per line — so:

- **No hooks, no persistence.** Nothing is written to `usage.log`; parsing happens only when the
  Files tab is opened/refreshed. This dissolves §4's log-volume and long-term-privacy costs.
- **Complementary, not a replacement.** The hook tracker (skills/MCP/subagents) is untouched.
- **Real session IDs.** Transcripts carry the actual Claude `sessionId` (the `usage.log`
  sessionId is only a per-pet-process random UUID).
- **Cardinality** handled by top-N + directory rollup, as §4 required.
- **"Cited" dropped**, as §5 recommended — only tool-touched files are observable.

Shape (see CLAUDE.md for the full trace): `src/tracking/transcript-reader.js` (main-only fs read) →
`get-file-activity` IPC → `src/tracking/file-activity.js` (pure aggregation) → a dedicated
**Files** settings tab (`tabs/file-activity.html`). Verified against `jq` ground truth: reader
output (Edit 838 / Read 503 / Write 159) matched the transcripts exactly.

> **Superseded detail (2026-07-27).** This section originally described the tab as "defaulting to
> the current session with a toggle to the whole project". The separate Scope toggle was collapsed
> into the Session filter itself, which now defaults to `All sessions` — the whole project — and
> narrows to one session when picked. The sequel doc added two further orthogonal filters (Agent,
> Mode). See CLAUDE.md for the current shape.

Deferred follow-ups: saveable HTML/MD export of the file view; forwarding the real `session_id`
through hooks to fix `usage.log`'s synthetic sessionId; Grep/Glob/Bash path extraction.

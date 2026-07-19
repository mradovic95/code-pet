# Claude Code Integration Research: What Else Should Code Pet Trace?

**Date:** 2026-07-15
**Purpose:** Follow-up to `market-research-feature-ideas.md`, narrowed to the Claude Code feature surface. Code Pet
already ships skill + MCP telemetry (`usage.log`, Usage tab). This document answers: what other signals does Claude Code
expose, what do users actually want tracked, and which tracing/integration extensions are worth building.

## Method

Three research threads: (1) official-docs inventory of the Claude Code signal surface (hooks, statusline, OpenTelemetry,
transcripts), (2) community demand mined from anthropics/claude-code issues (sorted by 👍 via the GitHub API), ccusage
and Claude-Code-Usage-Monitor issue trackers, and HN; (3) competitor telemetry teardown (clawd-on-desk, AgentPet,
Codachi, claude-code-tamagotchi, ccusage/sniffly/ccflare-class tools) including which data channel each uses.

**Verification note:** hook-event and statusline claims below were re-checked directly against the official
docs ([hooks reference](https://code.claude.com/docs/en/hooks), [statusline](https://code.claude.com/docs/en/statusline)).
One agent-reported claim did **not** survive verification and is corrected here: hook payloads do **not** carry
token/cost fields — the docs don't list them, and users are actively requesting
them ([#11008](https://github.com/anthropics/claude-code/issues/11008), 29 👍). Reaction counts are point-in-time (
2026-07-15).

---

## 1. Observable-Signal Inventory (verified)

### 1a. Hook events — what exists vs. what Code Pet consumes

The official hooks reference documents ~30 events. Code Pet consumes 6.

| Hook event                                                                                                                                                                                              | Code Pet today | Telemetry/integration potential                                                                                                                                                                                                                                            |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| SessionStart, SessionEnd, UserPromptSubmit, PostToolUse, Notification, Stop                                                                                                                             | ✅ consumed     | —                                                                                                                                                                                                                                                                          |
| **SubagentStart / SubagentStop**                                                                                                                                                                        | ❌              | Subagent lifecycle: `agent_type` (e.g. "Explore"), `agent_id`. Fires when a subagent spawns/finishes — the direct signal for a "subagent working" pet state and subagent usage events. Code Pet currently only infers subagents indirectly from `agent_id` on PostToolUse. |
| **TaskCreated / TaskCompleted**                                                                                                                                                                         | ❌              | Task-queue awareness (created via TaskCreate) — could count tasks per session.                                                                                                                                                                                             |
| **PostToolUseFailure**                                                                                                                                                                                  | ❌              | Tool failures — "confused" pet animation + error-count telemetry.                                                                                                                                                                                                          |
| **PermissionRequest / PermissionDenied**                                                                                                                                                                | ❌              | Richer than the Notification permission_prompt Code Pet uses; PermissionDenied identifies which tool got blocked.                                                                                                                                                          |
| **PreCompact / PostCompact**                                                                                                                                                                            | ❌              | Context-pressure moments — a `compaction` usage event; optional pet animation.                                                                                                                                                                                             |
| PreToolUse, PostToolBatch, Setup, StopFailure, TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged, FileChanged, WorktreeCreate/Remove, Elicitation(Result), UserPromptExpansion, MessageDisplay | ❌              | Mostly noise for a pet; WorktreeCreate and CwdChanged could matter later for project identity.                                                                                                                                                                             |

Common payload fields on all events: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `permission_mode`, `effort`,
`hook_event_name`; plus `agent_id`/`agent_type` when inside a subagent.

**Key negative finding:** hook payloads contain **no token or cost data
**. [#11008](https://github.com/anthropics/claude-code/issues/11008) (29 👍)
and [#50926](https://github.com/anthropics/claude-code/issues/50926) request exactly this. If Anthropic ships it, Code
Pet gets cost telemetry through its existing pipeline for free — worth watching.

### 1b. Statusline stdin JSON — the untapped high-value channel (verified against docs)

Claude Code pipes JSON to a configured statusline script on every assistant message / compaction / mode change. Fields
include:

- `context_window.used_percentage`, `total_input_tokens`, `context_window_size` — live context usage
- `cost.total_cost_usd`, `total_lines_added`, `total_lines_removed`, `total_duration_ms` — session cost & productivity
- `rate_limits.five_hour.used_percentage` / `.resets_at`, `rate_limits.seven_day.*` — **the rate-limit data everyone
  wants** (Pro/Max only)
- `session_id`, `workspace.project_dir`, `model.display_name`, `agent.name`

A statusline script that additionally POSTs this JSON to Code Pet's HTTP server (127.0.0.1:31425) would give the pet
everything in one move. **Proven in practice:** Codachi and claude-code-tamagotchi are built on this exact channel.

### 1c. Other channels (evaluated, ranked by real-world proof)

| Channel                                                 | Who uses it                                               | Verdict for Code Pet                                                                                                                                                                                                                                 |
|---------------------------------------------------------|-----------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Hooks                                                   | Every pet app (clawd-on-desk, AgentPet, CoPet) + Code Pet | ✅ Already the backbone; extend with SubagentStart/Stop                                                                                                                                                                                               |
| Statusline JSON                                         | Codachi, claude-code-tamagotchi                           | ✅ **Best next channel** — context %, cost, rate limits with zero new infra                                                                                                                                                                           |
| Transcript JSONL parsing (`~/.claude/projects/*.jsonl`) | ccusage (17k★), sniffly, claude-usage, token-dashboard    | ⚠️ Richest history (per-turn tokens, subagent attribution) but format is **officially internal/unstable** — Anthropic recommends hooks/statusline instead. Use as optional enrichment only, or consume ccusage's output rather than parsing yourself |
| OpenTelemetry export                                    | **Nobody** in the pet/monitor cohort                      | ❌ Skip — requires users to set env vars + run a collector; unproven in this niche                                                                                                                                                                    |
| API proxy                                               | ccflare only                                              | ❌ Far too heavy for a pet                                                                                                                                                                                                                            |

---

## 2. Community Demand (ranked by evidence strength)

1. **Rate-limit / quota burn with forecasting — the strongest signal by an order of magnitude.** Top visibility
   complaints on anthropics/claude-code: [#16157](https://github.com/anthropics/claude-code/issues/16157) (691
   👍), [#38335](https://github.com/anthropics/claude-code/issues/38335) (468
   👍), [#13585](https://github.com/anthropics/claude-code/issues/13585) (108
   👍), [#18456](https://github.com/anthropics/claude-code/issues/18456) (124 👍, context % in UI). The entire ccusage (
   17k★) / Usage-Monitor (8.4k★) ecosystem exists for this, and *their* top issues are about forecast accuracy ("when
   will I hit the limit"). A dense wave of ambient monitors keeps shipping (claudewatch, cctray, costats, Claumon…).
2. **A companion that reflects agent state.
   ** [#45596 "Bring Back Buddy"](https://github.com/anthropics/claude-code/issues/45596) — **1,152 👍, 262 comments**,
   the #2 open issue in the repo after Anthropic removed the `/buddy` companion. Its consolidated sub-asks read like a
   Code Pet backlog: customization (#45336), presence beyond the CLI (#45087), **per-subagent buddies** (#42091), a
   persistent off-switch (#45441). Mass-market validation that the companion category is wanted natively.
3. **"Claude needs me / Claude finished" beyond the terminal.** 7+ issues at 18–59 👍 each (iOS
   push [#29438](https://github.com/anthropics/claude-code/issues/29438), completed-task
   push [#28765](https://github.com/anthropics/claude-code/issues/28765), system
   toasts [#26581](https://github.com/anthropics/claude-code/issues/26581),
   tmux [#19976](https://github.com/anthropics/claude-code/issues/19976)). Confirms the first research doc's #1 finding
   from the Claude Code side.
4. **Cost/usage attribution by project, task, and model.**
   ccusage [#281](https://github.com/ccusage/ccusage/issues/281) (
   per-project), [#14](https://github.com/ccusage/ccusage/issues/14) (per-model); CodeBurn's per-*task* cost analysis
   got [112 HN points](https://news.ycombinator.com/item?id=47759035). Code Pet's per-project pet keying is a natural
   surface for per-project burn.
5. **Subagent visibility: which agent, what cost, is it rogue.
   ** [#24537](https://github.com/anthropics/claude-code/issues/24537) (agent-hierarchy
   dashboard), [#7881](https://github.com/anthropics/claude-code/issues/7881) (can't identify which subagent stopped),
   ccusage [#313](https://github.com/ccusage/ccusage/issues/313),
   Usage-Monitor [#137](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor/issues/137) ("not accurate anymore
   without Agents monitoring"); new tools ObservAgent, agent-pd. Newer feature → lower raw counts, consistent growth.
6. **Skill/plugin invocation analytics — exactly what Code Pet already logs.
   ** [#35319](https://github.com/anthropics/claude-code/issues/35319) (34 👍): *"our org went from 67 to 183 skills in
   under a month… every proposed solution requires one missing primitive: invocation
   data."* [#14920](https://github.com/anthropics/claude-code/issues/14920) (77 👍, disable individual skills — the
   pruning motive). Anthropic has started shipping "last used" hints in `/plugin`, and third-party skill-analytics
   plugins are appearing — Code Pet's `usage.log` is this primitive, but the *views* (used vs. never-used, trends) are
   what people ask for.
7. **Activity history: heatmaps, streaks, "Wrapped".** ccheatmap, Claude Wrapped, Year in Code, screen-time-style
   reports all got Show HN traction; Anthropic's own dashboard now has a streak/heatmap that users file accuracy bugs
   against (they care). Strong thematic fit with a pet (streaks → pet happiness), and dovetails with the
   cosmetic-progression finding in the market doc.

Competitor gap check: no pet combines per-project cost history or daily summaries (daily summary explicitly requested on
clawd-on-desk, [#678](https://github.com/rullerzhou-afk/clawd-on-desk/issues/678)); AgentPet's users push for cost
accuracy and cross-device sync; Codachi proves pet + metrics fuse in one surface.

---

## 3. Prioritized Tracing / Integration Candidates

Mapped to the existing architecture: new `UsageEvent` types are additions to `recordToolUsage()`/`UsageTracker` in
`src/app/state-machine/pet-context.js` + `src/tracking/`; new hook handlers follow the `hooks/scripts/on-*.js` →
`send-event.js` pattern; UI lands in the settings Usage tab.

| # | Candidate                                                                                                                                                                                                                                                                | Evidence                                                                                                                                                                 | How it fits                                                                                                                                                                                   | Effort       |
|---|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|
| 1 | **Statusline companion channel** — optional statusline script (installed via settings, like the hooks) that forwards the stdin JSON to a new `/statusline` endpoint on the event server; store rate-limit %, context %, session cost keyed by `session_id`/`project_dir` | Demand #1 (691/468/124 👍 issues; two 8k–17k★ tools); Codachi proves the channel                                                                                         | New endpoint in `event-server.js`; a `statusline`-type UsageEvent or a separate rolling snapshot; Usage-tab gauges. Pet flavor: pet "tires" as the 5-hour window depletes, warn at thresholds | M            |
| 2 | **Subagent tracing** — new `on-subagent-start.js` / `on-subagent-stop.js` hooks sending a `subagent` event; record `agent_type` as a UsageEvent; optionally a distinct "juggling" pet state when ≥1 subagent is live                                                     | Demand #5; clawd-on-desk ships the state; would also *simplify* the current indirect agentId-on-PostToolUse inference (see `docs/background-subagents-investigation.md`) | Two small hook scripts + `hooks.json` entries; `tracker.record('subagent', agentType)`; state machine already has the wake logic                                                              | S–M          |
| 3 | **Skill-analytics views on existing data** — "last used / never used", per-project and per-week trends, top-skills list in the Usage tab; optional NDJSON export                                                                                                         | Demand #6 (#35319 is verbatim this); zero new collection needed                                                                                                          | Pure Usage-tab UI over `usage.log` (`settings.js` already renders events); aggregation in `usage-tracker.js`                                                                                  | S            |
| 4 | **Session/activity history: streaks + heatmap** — derive sessions-per-day from existing timestamps; GitHub-style heatmap in Usage tab; later a yearly "Wrapped" recap                                                                                                    | Demand #7; feeds the cosmetic-progression feature from the market doc                                                                                                    | `usage.log` already has timestamps + projectPath; consider adding a lightweight `session` event (awaken/falling_asleep already flow through the server)                                       | M            |
| 5 | **Tool-failure telemetry + pet reaction** — handle `PostToolUseFailure`; record `tool_failure` events; brief "confused" animation                                                                                                                                        | Medium (sniffly's error-analysis niche; personality differentiator)                                                                                                      | One hook script; one sprite state (falls back gracefully for pets without it)                                                                                                                 | S–M          |
| 6 | **Notification escalation** — consume the `idle_prompt` Notification matcher (only `permission_prompt` is used today); optional sound/system toast when waiting > N min                                                                                                  | Demand #3; ties to sound-pack feature from the market doc                                                                                                                | `on-notification.js` already receives the payload — extend the filter; sounds exist per pet manifest                                                                                          | S            |
| 7 | **Compaction awareness** — `PreCompact`/`PostCompact` → `compaction` UsageEvent (context pressure history per project)                                                                                                                                                   | Weak-medium; cheap                                                                                                                                                       | One hook script; no UI needed initially                                                                                                                                                       | S            |
| 8 | **Per-project cost history** (via #1's statusline data or by consuming ccusage output)                                                                                                                                                                                   | Demand #4; no pet ships it                                                                                                                                               | Extends #1; avoid parsing transcripts yourself                                                                                                                                                | M (after #1) |

**Recommended order:** 3 → 2 → 1 → 6 (3 is pure UI on data you already collect; 2 is small and fixes a real modeling
gap; 1 is the highest-demand item; 6 is a quick win aligned with the market doc).

## 4. What NOT to Trace

- **Prompt contents, tool inputs, file paths** — `usage.log` is plaintext NDJSON; names/counts are fine, payloads are
  not. (OpenPets markets "no prompts/paths leaked" as a feature — privacy transparency is a selling point in this
  category; Bongo Cat users literally decompiled it to check.)
- **Anything requiring transcript JSONL parsing as a primary source** — officially internal/unstable format; breakage
  risk lands on you.
- **OTel pipeline** — heavy user setup, zero adoption among comparable tools.
- **High-volume per-tool events without rotation** — `usage.log` grows unbounded by design; before adding chattier event
  types (every tool call, every statusline tick), add size-capped rotation or aggregate-then-store, or the log becomes
  the next `code-pet.log` truncation problem.
- **Behavior policing** (claude-code-tamagotchi's violation-interruption) — it spends its own LLM tokens to judge
  sessions and can block tools; off-brand for a non-intrusive pet.

## 5. Watchlist

- [#11008](https://github.com/anthropics/claude-code/issues/11008)/[#50926](https://github.com/anthropics/claude-code/issues/50926) —
  token/cost in hook payloads: if shipped, candidate #8 becomes trivial through the existing hook pipeline.
- [#45596](https://github.com/anthropics/claude-code/issues/45596) — if Anthropic revives Buddy natively, Code Pet's
  differentiators are the visual overlay, marketplace content, and the telemetry views above.
- [#7881](https://github.com/anthropics/claude-code/issues/7881) — subagent identity in SubagentStop; affects how
  precisely candidate #2 can attribute per-agent stats.

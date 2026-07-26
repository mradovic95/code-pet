# File Activity Metrics — What Should It Measure Next? (Investigation)

**Question:** The Files tab ships three numbers per file — reads, edits, writes — each a raw count
of tool calls. What *richer* statistics are available from the same transcript source, and which of
them are actually worth building? Ranked by potential impact.

**Status:** Research (2026-07-26). **Candidates §4.1 and §4.3 are implemented** — see the Done notes
there; §4.2 and §4.4–4.9 remain proposals. Sequel to
`docs/file-directory-metrics-investigation.md` — that doc asked *should a file view exist at all*;
this one asks *what should it measure*.

**One finding was not a feature idea but a correctness gap** (§4.1): the reader silently skipped
subagent transcripts, so the tab's totals were understated by ~21%. It was ranked first below and
has since been fixed.

---

## 1. Measurement basis

Every number in this document was measured over this project's own transcript corpus, not estimated:

- **84** session transcripts under `~/.claude/projects/-Users-mihailoradovic-my-projects-code-pet/`
- **239** distinct files touched
- **1654** main-agent file touches — Read 563 / Edit 918 / Write 173
- **448** additional subagent file touches across **57** subagent transcripts (see §4.1)
- **2102** touches in total, of which the tab currently sees 1654

Anything below with a percentage traces back to those counts.

The corpus is **live** — active sessions append to it while it is being read, so a re-run drifts by
a few touches (a verification run minutes later returned 1657 main / 332 plan-mode). Treat the
figures as a snapshot; the ratios are stable, the absolute counts are not.

## 2. What the tab measures today, and its four blind spots

`src/tracking/file-activity.js` buckets each touch by tool name via its `CATEGORY` map — `Read` →
reads, `Edit`/`NotebookEdit` → edits, `Write` → writes — and sums. Directory totals are a `dirOf`
rollup. That's the whole model: **one tool call = one count of weight 1**.

Four things that model cannot express:

1. **Magnitude.** Twenty one-line edits and one 300-line rewrite score identically. The corpus
   contains 918 edits totalling **+12155 / −4129** lines; the spread across files is invisible.
2. **Intent.** A file read while planning an approach and a file edited to ship it are the same
   event type today. **19.9%** of touches happened in plan mode (§4.3).
3. **Attribution.** Which agent touched the file. **21%** of touches are subagents' and are missing
   entirely (§4.1).
4. **Recency.** Timestamps are parsed and used only for session start/end bounds — never for "what
   is hot this week", even though the Usage tab already has that idiom.

## 3. Data inventory — what the transcripts actually carry

Everything usable, with measured coverage. This table is the reference value of this document; the
ranking in §4 is derived from it.

| Source field | Coverage in corpus | Enables |
|---|---|---|
| `<session>/subagents/agent-*.jsonl` | 57 transcripts, 448 touches | subagent file activity (currently unread) |
| `…/agent-*.meta.json` → `agentType`, `description`, `spawnDepth` | 1 per subagent transcript | main-vs-subagent split, per-agent-type breakdown |
| `agentId` on sidechain records | present | per-agent-instance attribution |
| `toolUseResult.structuredPatch` (hunks with `lines`) | **958 of 1073** edit/write results non-empty; 115 empty, 0 missing | added/removed line counts per file |
| `permission-mode` records (`{"permissionMode":"plan"}`) | 1060 records; tags 329 of 1654 touches | plan vs. execution split — **no timestamp on these records** |
| `gitBranch` | **1654/1654** | per-branch file activity |
| `timestamp` | **1654/1654** | recency, heat, trends |
| `toolUseResult.file.numLines` / `totalLines` | **529/560** reads | read depth; 267 reads were partial |
| `tool_result.is_error` + denial text | 21 of 1654 (1.3%) | failed and user-rejected edits |
| `toolUseResult.replaceAll` | 3 occurrences | edit breadth (negligible in practice) |
| `sessionId` (already used) | all | re-read detection, co-edit coupling |

Two fields that look useful and are not: `userModified` (**0** occurrences in the whole corpus) and
`spawnDepth` (always `1` — no nested subagents observed).

## 4. Candidates, ranked by potential impact (high → low)

### 4.1 Subagent coverage and the main-vs-subagent split — **highest** ✅ DONE

> **Status: implemented (2026-07-26).** The reader now walks `<session-id>/subagents/agent-*.jsonl`
> and reads the `.meta.json` sidecars; events carry `agentId`/`agentType`; the Files tab gained an
> Agent filter (All / Main agent / Subagents), a split note, and a **By Agent Type** list.
> Post-fix run over the same corpus: **2128 touches, 448 of them subagents' (21%)**, agent
> distribution matching the research below exactly, and 0 untyped subagent touches. The pre-fix
> reader returned 1680 for the same input. The research below is kept as written.

**Answers:** "what did my subagents read?" — and, first, "are the numbers on this tab even right?"

`transcript-reader.js` collects directory entries with `e.isFile() && e.name.endsWith('.jsonl')`, so
it reads only top-level session transcripts. Subagent transcripts live one level down, at
`<session-id>/subagents/agent-<id>.jsonl`, each with an `agent-<id>.meta.json` sidecar. They are
never opened.

Measured consequence: **448 file touches (21% of 2102) are missing from the tab**, all of them
`Read`. The per-agent-type split, from the sidecars:

| agentType | subagents | file touches |
|---|---|---|
| Explore | 26 | 300 |
| Plan | 10 | 118 |
| claude-code-guide | 12 | 19 |
| general-purpose | 9 | 11 |

This ranks first for two independent reasons. It is a **correctness gap** — the tab reports
understated totals today, and the deficit is concentrated in reads, which is exactly the column the
tab uses to claim "where attention went". And the fix simultaneously unlocks the *dimension* the
data was hiding: reads are how subagents work (all 448 touches are reads, zero edits), so the split
cleanly separates delegated context-gathering from the main agent's own work. It also closes a gap
against the hook tracker, which already has `agentType`/`agentId` attribution
(`docs/agent-type-attribution-investigation.md`) — the two views currently disagree about whether
subagents exist.

**Effort:** reader change (recurse one level, parse the sidecars) plus an aggregator field. The only
candidate here that changes existing displayed numbers.

**Caveats:** `isSidechain` is `false` on every record in the top-level transcripts, so it cannot be
used to detect the gap — only the directory walk reveals it. A subagent's `cwd`/`gitBranch` can
differ from the parent session's if it ran in a worktree.

### 4.2 Line churn (added / removed lines) — **high**

**Answers:** "which files *changed* most", as opposed to "which files were touched most".

`toolUseResult.structuredPatch` carries unified-diff hunks whose `lines` are `+`/`-` prefixed, so
per-file added/removed counts are a straight sum. Coverage is **958 of 1073** edit/write results
(89%), with **0** results missing the field — the 115 empties are no-op writes. Corpus totals:
**+12155 / −4129**.

This is the largest fidelity upgrade available to the numbers already on screen. It converts the
edits column from an activity proxy into an actual magnitude, and it is what makes the top-files
ranking defensible — §4 of the predecessor doc flagged "read-count ≠ importance" as a signal-quality
risk, and churn is the standard answer to it (it is the same measure CodeScene's hotspot analysis is
built on, cited there as Tier 1 prior art).

**Effort:** reader change (carry two extra integers per event) plus aggregator sums.

**Caveats:** churn overstates generated/boilerplate files (a regenerated lockfile dwarfs a careful
50-line refactor). It needs to be shown *beside* counts, not instead of them. Writes report their
whole content as added lines, so a new file's first write is a large positive spike by construction.

### 4.3 Plan vs. execution split — **high** ✅ DONE

> **Status: implemented (2026-07-26).** Events carry a nullable `planMode`; the Files tab gained a **Mode**
> filter (All / Plan mode only / Execution only), a split note, per-file `P`/`X` counts beside `R`/`E`/`W`,
> and a **Read to Orient** list. Post-fix run over the corpus: **2170 touches, 759 in plan mode (35%)**,
> **zero** untagged on either side. Two things below turned out to be wrong or incomplete, and the
> implementation departs from them:
>
> 1. **Subagent transcripts contain no `permission-mode` records at all**, so tracking the most recent value
>    while parsing leaves all 448 subagent touches (21%) untagged — reintroducing §4.1's blind spot on a new
>    axis. Fixed by inheritance: each `agent-<id>.meta.json` carries a `toolUseId` that resolves to the
>    spawning tool call in the parent transcript, so the parse collects `tool_use id → planMode` and the
>    subagent adopts the mode its spawn ran in. Resolution was **57/57, zero unknown**, and every sidecar
>    resolved inside its *own* parent session (0 foreign) — which is what lets the reader stay
>    session-parallel and only order main-before-subagents *within* a session. Result: 428 plan / 20 exec,
>    with every `Explore` and `Plan` subagent in plan mode. This is what raises the headline from 19% to
>    **35%**: delegated exploration is overwhelmingly a planning activity, so the axis and §4.1 compound.
> 2. **`ExitPlanMode` is not optional as a boundary — it is load-bearing.** A `permission-mode` record does
>    not reliably follow plan approval (of 108 calls, 55 have none within the next 15 lines), so
>    most-recent-value alone tags post-approval work as planning. Treating the call as the boundary re-tags
>    **48 non-read touches** and moves the main-agent share 22.9% → 19.3%, which is what reconciles with the
>    19.9% measured below.
>
> Also checked and rejected: `{"type":"mode","mode":…}` records (1100 of them) only ever hold `"normal"` —
> not a usable carrier. A second, redundant carrier *is* honoured: a top-level `permissionMode` on `user`
> prompt records (344 in corpus). And `planMode` is genuinely nullable — an unresolvable `toolUseId` or a
> transcript that never reveals a mode yields `null`, counted toward neither side rather than silently
> folded into execution. The research below is kept as written.

**Answers:** "which files do I read to *understand* this project, versus change to *deliver*?" — the
question that prompted this investigation.

Transcripts contain `{"type":"permission-mode","permissionMode":"plan"}` records (**1060** of them)
interleaved with the tool calls, plus `ExitPlanMode` tool calls (**106**) as explicit plan
boundaries. Tracking the most recent value while parsing tags each touch. Measured: **329 of 1654
touches (19.9%)** occurred in plan mode.

Unlike §4.1 and §4.2, which sharpen existing numbers, this adds a genuinely new axis. Its practical
payoff: the files that dominate plan-mode reads are the ones the agent repeatedly needs in order to
orient — the strongest available signal for what belongs in `CLAUDE.md` or a summary doc, since
those reads are pure overhead paid before any work happens.

**Effort:** reader change (one state variable, one boolean per event) plus aggregator grouping.

**Caveats:** the `permission-mode` records carry **no timestamp** — verified across all 1060. The
tag therefore depends on line order within a transcript, which is reliable while parsing a file
sequentially but is not reconstructible from a merged or re-sorted event stream. That is a real
constraint on the event shape, and the one design consequence worth flagging before implementation.
Plan mode also is not the only planning that happens, so the metric under-reports intent rather than
over-reporting it.

### 4.4 Read-but-never-edited files and redundant re-reads — **medium-high**

**Answers:** "what is this project's context tax?"

Both derive from events **already collected** — no reader change at all, pure aggregation over the
existing `{tool, filePath, sessionId}` shape, reusing `groupBySession` from `usage-analytics.js`.
Measured: **59** files read but never once edited; **24** files re-read within a single session,
for **110** redundant reads.

Best value-per-effort of anything here. A file read repeatedly and never modified is either
documentation that should be summarized or a dependency whose contents keep being re-derived;
re-reads within one session indicate context that was loaded, lost, and reloaded. Both are
actionable in a way a raw count is not.

**Caveats:** legitimate re-reads exist (re-reading after an edit to verify is normal and correct),
so the metric wants a "distinct sessions" framing rather than being presented as pure waste. Its
insight ceiling is lower than §4.1–4.3: it refines a list rather than adding a dimension.

### 4.5 Per-branch attribution — **medium**

**Answers:** "what did this feature branch touch?"

`gitBranch` is present on **1654/1654** touches — total coverage, zero parsing risk. It matches how
work is actually organized here (the corpus spans branches like `feat/skill-analytics` and
`feat/file-activity-view`), and a branch filter is a closer match to "what am I working on" than the
existing session filter, since one branch spans many sessions.

**Effort:** carry one existing string through; one more filter in the UI, mirroring the Session
filter the tab already has.

**Caveats:** long-lived branches blur back into project-wide totals; detached HEAD or worktrees
report whatever the record says. Overlaps the session filter conceptually, so it is a second lens on
the same data rather than new information — which is why it sits below §4.4.

### 4.6 Recency and heat — **medium**

**Answers:** "what is hot *now*", instead of an all-time ranking.

`timestamp` coverage is **1654/1654**. The Usage tab already solved this exact presentation problem
— `dayTrend`, `weekTrend`, `monthTrend` in `usage-analytics.js`, surfaced as a CSS-only toggle — so
the idiom, and the constraint that the report stay script-free, are both already established.

**Caveats:** mostly a re-slice of existing data, and all-time totals stay the more useful default
for a hotspots view. Value is in consistency with the Usage tab as much as in new insight.

### 4.7 Co-edit coupling — **low-medium**

**Answers:** "which files always change together?"

Measurable from existing events, and `coOccurrence` in `usage-analytics.js` already implements the
primitive. But the measured output is where this candidate loses its rank — the top pairs in this
corpus are CHANGELOG.md + CLAUDE.md (21 shared sessions), CHANGELOG.md + settings.js (11),
CLAUDE.md + settings.js (11). Those are documentation-maintenance habits, not architectural
coupling. The signal is dominated by files that change alongside *everything*, which is precisely
the failure mode that makes naive co-occurrence misleading, and suppressing it needs a normalization
step (lift, or an explicit ignore list) rather than a raw count.

**Caveats:** as above — needs normalization to say anything true. Worth revisiting once churn (§4.2)
exists, since churn-weighted coupling is far less boilerplate-prone.

### 4.8 Read depth — **low**

**Answers:** "was that a peek or a full load?"

`toolUseResult.file.numLines` vs `totalLines`, present on **529/560** reads; **267** reads (~48%)
were partial. Cheap to collect. But it is hard to name a decision that changes on knowing it, and it
partially duplicates what churn already conveys about file size. Collect it if the reader is being
touched for §4.2 anyway; do not build a view for it.

### 4.9 Failed and user-rejected edits — **lowest**

**Answers:** "which files are hard to edit?" and "where do I reject the agent's changes?"

Both are observable: `tool_result.is_error` plus denial-text matching yields **9 user-rejected
Edits, 9 Edit errors, 3 Read errors**. Conceptually this is the most interesting item in the lower
half — rejection rate per editing tool is a metric Anthropic's own Claude Code Analytics tracks
(Tier 2 prior art in the predecessor doc).

It ranks last purely on density: **21 of 1654 touches (1.3%)**. A UI section that is empty for most
projects and shows single digits for the rest cannot carry its own weight, and rejection detection
relies on matching English denial strings, which is inherently brittle. Revisit only if the corpus
grows or a rejection-focused question is actually being asked.

## 5. Non-goals

- **`Bash` command paths** — no reliable extraction; ruled out by the predecessor doc's §2.
- **`Grep`/`Glob` directory searches** — weak signal, high noise; explicitly deferred previously.
- **"Cited in the conversation"** — not observable from any source; dropped in the predecessor doc
  and still not available. Only tool-touched files can be counted.
- **Nested subagent trees** — `spawnDepth` is `1` for all 57 subagents; no data to justify it.

## 6. Recommendation

**Build §4.1–4.3 as one slice, and let §4.4 ride along.** (§4.1 and §4.3 are done; §4.2 stands.)

They compose rather than merely coexisting: §4.1 makes the totals correct, §4.2 makes them
proportional, §4.3 makes them interpretable, and all three need the same single change point in
`parseTranscript`. Doing them together means the reader is opened once. §4.4 requires no reader
change at all, so it is free to include and pointless to schedule separately.

§4.1 and §4.3 shipped ahead of §4.2 — §4.1 because it was a correctness gap rather than an
enhancement, §4.3 because it depended on §4.1's directory walk to be worth anything (see its status
note: the axis is only 19% of touches without subagents and 35% with them). §4.1 established the
event-shape precedent both followed: extra per-touch attributes are added as nullable fields on the
reader's event objects, named to match the hook tracker's vocabulary (`agentId`/`agentType`), and the
aggregator exposes them in the same `topFiles`/`topDirs` list shape the renderer already knows how to
draw — §4.3 added `planMode` that way, plus a `modeSplit` mirroring `agentSplit` field-for-field.

**§4.2 inherits one new constraint** from §4.3's implementation: `parseTranscript` now returns
`{ events, spawnModes }` and a session's main transcript must be parsed before its subagents, so
churn cannot be added by a purely line-local change to the parse loop.

§4.5 and §4.6 are good follow-ups once that lands — both are re-slices of fields already carried,
and both are cheaper after the event shape has settled. §4.7–4.9 should wait: 4.7 needs
normalization before it says anything true, and 4.8/4.9 lack a question that changes a decision.

One constraint for whoever implements the rest: churn must be displayed beside counts rather than
replacing them (§4.2). The other — the plan-mode tag depending on transcript line order — is now
settled in code, and §4.3's status note records how.

## 7. Next step

Per the issue-first policy, no PR without a prior issue. §4.1 warranted **its own** issue, separate
from any metrics work — it was not a feature request but understated totals on the
`feat/file-activity-view` branch — and it is now implemented; the issue covering it can be closed
with the branch.

The remaining candidates belong in a second issue, scoped to the §6 slice (§4.2 churn and §4.3 plan
vs. execution, with §4.4 riding along).

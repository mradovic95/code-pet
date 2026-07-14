# Investigation: phantom pets spawn for subfolders of the active project

**Date:** 2026-07-13
**Symptom:** One terminal, one Claude Code session, one pet — yet over time new pets appear, keyed to *subfolders* of the same project. Observed while a session worked in `incident-agent`: pets labeled "slack module", "src", and eventually "interaction" (a deep Java package directory) appeared alongside the real pet.

## Evidence (`~/.code-pet/code-pet.log`)

All phantom registrations carry the **same claudePid (50918)** as the legitimate session pet — this is not a second session, it is the same session registering under drifted paths:

```
11:20:46 New session registered: .../incident-agent::50918 (incident agent)      ← real pet
12:23:19 New session registered: .../incident-agent/slack-module::50918          ← phantom
12:23:42 New session registered: .../incident-agent/slack-module/src::50918      ← phantom
13:47:26 New session registered: .../slack-module/.../service/interaction::50918 ← phantom
```

`~/.code-pet/hooks-debug.log` shows what created each one — a PostToolUse for a Bash command that `cd`-ed:

```
13:47:26 [interaction] PostToolUse: tool=Bash
         input={"command":"cd .../slack/application/service/interaction\ngrep -n ..."}
         stdin cwd = ".../application/service/interaction"
```

## Root cause

Hook processes are spawned with the Claude session's **current** shell cwd, which moves whenever a Bash tool call runs `cd <subdir>` (common during plan-mode investigation and subagent exploration — `cd X && grep ...`). `send-event.js` derived the pet's project identity from `process.cwd()`, so after any such `cd`, every subsequent hook reported `project = <subfolder>`. The registry key `${projectPath}::${claudePid}` then no longer matched the real pet's key (`root::pid` vs `subfolder::samePid`), and `PetRegistry.getOrCreate()` minted a phantom pet — even when the triggering event was then ignored in idle (registration happens before dispatch).

The stdin JSON `cwd` field drifts identically, so it cannot be used as a fix either.

Downstream damage: the phantom pet never receives `work_finished`/`falling_asleep` under its key, so it lingers; meanwhile the real pet misses the events routed to the phantom key.

## Fix: derive project identity from `CLAUDE_PROJECT_DIR`

Claude Code sets `CLAUDE_PROJECT_DIR` in the environment of **every** hook command (all events, plugin hooks included). Verified against the official docs (https://code.claude.com/docs/en/hooks.md):

> The project root doesn't change when Claude executes `cd` commands. The `cwd` field in the JSON input reflects the *current* working directory, while `CLAUDE_PROJECT_DIR` always points to the project's root and remains constant throughout the session.

`send-event.js` now uses:

```js
function getProjectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}
```

All hook scripts funnel through `getProjectContext()`, so this single point covers SessionStart, UserPromptSubmit, PostToolUse, Notification, Stop, and SessionEnd. The `process.cwd()` fallback keeps `./test.sh`, manual runs, and older Claude Code versions working.

## Explicitly unchanged (by design)

Pet keying stays `${projectPath}::${claudePid}` — **one pet per session**. Two concurrent Claude sessions in the same folder still get separate pets with suffixed labels (`"name (2)"` via `PetRegistry._recomputeLabels()`). That behavior is intentional and untouched; the fix only stabilizes the `projectPath` half of the key so a single session can never fan out across subfolders.

## Tests

`test/integration/hook-post-tool-use.test.js`:
- `CLAUDE_PROJECT_DIR` wins over a drifted cwd (hook spawned with cwd in a subfolder reports the root as `project`).
- Without `CLAUDE_PROJECT_DIR`, `project` falls back to the hook's cwd.
- `spawnHook` strips an inherited `CLAUDE_PROJECT_DIR` from the base env, so running the suite inside a Claude Code session stays deterministic.

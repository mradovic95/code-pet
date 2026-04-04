# Plugin Distribution Investigation

Deep analysis of how code-pet is installed, distributed, and updated as a Claude Code plugin — and what needs to happen
for marketplace readiness.

---

## 1. Current Installation Flow

### How It Works Today

The plugin uses Claude Code's plugin system with three user-facing steps:

```
/plugin marketplace add mradovic95/code-pet   # Register the marketplace source
/plugin install code-pet                       # Install the plugin
/reset                                         # Reload hooks in current session
```

Under the hood, this triggers:

```
Claude Code reads .claude-plugin/plugin.json
  → Registers plugin name, version, description, author
  → Reads hooks/hooks.json
  → Maps 6 hook events to their script commands
  → Plugin is "installed" (hooks are active)
```

At this point, **no dependencies are installed**. Electron (~85MB) is not yet on disk.

### Lazy Bootstrap on First Use

The first `SessionStart` hook triggers the real setup:

```
SessionStart fires → on-session-start.js executes
  → bootstrap.js checks: does node_modules/electron/ exist?
    ├── NO:  spawn detached `npm install --prefix <pluginRoot>`
    │        write lock file ~/.code-pet/installing (contains PID)
    │        return { ready: false, reason: 'install-started' }
    │        → hook exits immediately, pet doesn't appear yet
    │
    └── YES: return { ready: true }
             → process-manager checks if Electron app is running
               ├── Not running → launchApp() spawns Electron binary
               │   wait up to 2s for /health endpoint
               └── Running → skip launch
             → sendEvent('awaken') → HTTP POST 127.0.0.1:31425/event
             → Pet appears on screen
```

Key design decisions:

- **npm install runs detached** — survives Claude Code exit, doesn't block the hook
- **Lock file with stale detection** — removed after 10 minutes if install hangs
- **Install happens in the plugin directory** (`node_modules/` sits alongside `src/`, `hooks/`, etc.)
- **Second session onward** — instant startup (Electron already installed)

### What Gets Created on Disk

| Location                      | Contents                               | Created By                     |
|-------------------------------|----------------------------------------|--------------------------------|
| `<plugin-dir>/node_modules/`  | Electron binary + deps (~85MB)         | `npm install` via bootstrap.js |
| `~/.code-pet/app.pid`         | Running Electron PID                   | process-manager.js on launch   |
| `~/.code-pet/code-pet.log`    | Structured app log (1MB max)           | logger.js                      |
| `~/.code-pet/app.log`         | Electron stdout/stderr                 | spawn stdio redirect           |
| `~/.code-pet/install.log`     | npm install output                     | bootstrap.js                   |
| `~/.code-pet/installing`      | Lock file (PID) during install         | bootstrap.js                   |
| `~/.code-pet/hooks-debug.log` | Hook event trace                       | send-event.js                  |
| `~/.code-pet/settings.json`   | User preferences, pet types            | settings-store.js              |
| `~/.code-pet/license.json`    | License key + owned pets               | license-manager.js             |
| `~/.code-pet/premium-pets/`   | Downloaded premium sprites (encrypted) | premium-store.js               |

---

## 2. Plugin Manifest Structure

### plugin.json

```json
{
	"name": "code-pet",
	"description": "Animated desktop pet companion that reacts to Claude Code activity",
	"version": "0.1.0",
	"author": {
		"name": "mradovic95"
	},
	"homepage": "https://github.com/mradovic95/code-pet",
	"repository": "https://github.com/mradovic95/code-pet",
	"license": "MIT",
	"keywords": [
		"animation",
		"desktop",
		"companion",
		"overlay"
	]
}
```

This is what Claude Code reads to identify the plugin. The `version` field is the **only version source** — there's no
separate version check or auto-update mechanism.

### marketplace.json

```json
{
	"name": "code-pet-marketplace",
	"owner": {
		"name": "mradovic95"
	},
	"plugins": [
		{
			"name": "code-pet",
			"source": "./",
			"description": "Animated desktop pet companion that reacts to Claude Code activity",
			"version": "0.1.0"
		}
	]
}
```

This defines the marketplace as a container that can host multiple plugins. Currently contains only `code-pet`. The
`source: "./"` indicates the plugin lives in the same directory as the marketplace definition.

### hooks.json

Registers 6 hook types with their handler scripts:

| Hook Event         | Script                | Timeout | Matcher             |
|--------------------|-----------------------|---------|---------------------|
| `SessionStart`     | `on-session-start.js` | 15s     | —                   |
| `UserPromptSubmit` | `on-prompt-submit.js` | 5s      | —                   |
| `Notification`     | `on-notification.js`  | 5s      | `permission_prompt` |
| `PostToolUse`      | `on-post-tool-use.js` | 5s      | —                   |
| `Stop`             | `on-stop.js`          | 5s      | —                   |
| `SessionEnd`       | `on-session-end.js`   | 15s     | —                   |

All commands use `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<script>.js` — the `CLAUDE_PLUGIN_ROOT` env var is injected
by Claude Code at runtime.

---

## 3. How the Plugin System Works (Claude Code Side)

Based on the README and plugin structure, Claude Code's plugin system works as follows:

### Plugin Discovery

- `/plugin marketplace add <owner>/<repo>` — registers a GitHub repository as a marketplace source
- Claude Code reads `marketplace.json` to discover available plugins
- `/plugin install <name>` — installs a specific plugin from any registered marketplace

### Plugin Registration

- Claude Code clones/downloads the plugin to a local directory
- Reads `.claude-plugin/plugin.json` for metadata
- Reads `hooks/hooks.json` and registers all hook commands
- The `--plugin-dir` flag can also point to a local directory for development

### Hook Execution Model

- Hooks are **subprocess commands** — spawned fresh for each event
- stdin receives JSON context from Claude Code (varies per hook type)
- stdout must write `{}` (or valid JSON) — hooks must never block
- Each hook has a timeout (5s or 15s) — killed if exceeded
- Errors are silently swallowed — the pet never interrupts Claude Code

### Plugin Removal

```bash
claude plugin remove code-pet
```

This unregisters hooks but does NOT clean up `~/.code-pet/` or `node_modules/`.

---

## 4. Current Gaps for Marketplace Distribution

### 4.1. No Auto-Update Mechanism

**Problem:** There is zero version checking or update capability. Once installed, the plugin stays at whatever version
it was when installed. Users must manually reinstall to get updates.

**What's missing:**

- No version comparison between local and remote
- No notification when a new version is available
- No `claude plugin update <name>` equivalent documented
- Version is hardcoded in three places: `plugin.json`, `marketplace.json`, `package.json` — these must be kept in sync
  manually

**Options to consider:**

1. **Rely on Claude Code's plugin system** — if Claude Code adds `plugin update` commands, the plugin.json version field
   is already in place
2. **Add a self-check** — on SessionStart, the hook could fetch the latest version from GitHub releases and log a
   notification (but not block)
3. **GitHub-based distribution** — if the marketplace pulls from a GitHub repo, tagging releases would let Claude Code
   detect updates

### 4.2. No CI/CD Pipeline

**Problem:** No automated build, test, or release process.

**What's missing:**

- No `.github/workflows/` directory
- No automated tests
- No release script to bump version across all three files
- No automated changelog

**Minimum needed:**

- Version bump script: syncs version across `plugin.json`, `marketplace.json`, `package.json`
- GitHub Actions workflow: lint, test (if tests exist), create release on tag
- Optionally: build a platform-specific bundle to avoid user-side `npm install`

### 4.3. Electron Install UX

**Problem:** The lazy npm install is clever but has UX issues:

1. **First session: no pet appears** — user runs `/reset`, starts a session, and nothing happens. Electron is installing
   in the background. The user has no visibility into this.
2. **85MB download with no progress** — `npm install electron` is large. On slow connections this could take minutes.
   The user sees nothing.
3. **Install happens in the plugin directory** — this means `node_modules/` lives inside whatever directory Claude Code
   manages plugins in. If the plugin directory is read-only (some package managers), this fails silently.
4. **Lock file edge cases** — if the machine crashes during install, the lock file persists for 10 minutes before stale
   detection kicks in.

**Possible improvements:**

- Add a post-install step to the plugin manifest (if Claude Code supports it) that runs npm install
- Show a notification in Claude Code during install (would require a hooks API extension)
- Pre-bundle the Electron binary into the plugin distribution (large but eliminates the lazy install)
- Move node_modules to `~/.code-pet/node_modules/` so it's in user-writable space

### 4.4. Platform-Specific Electron Binary

**Problem:** `npm install electron` downloads the binary for the current platform. The plugin directory contains
platform-specific artifacts after first install.

**Implications:**

- Plugin cannot be shared as a pre-built zip across platforms
- Each user must run `npm install` on their own machine
- This is actually fine for marketplace distribution (each user installs independently) but prevents distributing a "
  ready to run" package

### 4.5. Port Collision

**Problem:** Default port 31425 is hardcoded. If another service uses this port, or if two different plugin
installations exist, they collide.

**Current mitigation:** `CODE_PET_PORT` env var can override, but this requires manual configuration.

### 4.6. Cleanup on Uninstall

**Problem:** `claude plugin remove code-pet` only unregisters hooks. It leaves behind:

- `~/.code-pet/` directory (logs, settings, PID, license, premium pets)
- `node_modules/electron` in the plugin directory
- Potentially a running Electron process

**What's missing:**

- No uninstall hook in the plugin system
- No cleanup script
- The running Electron app has no way to know the plugin was removed

---

## 5. Marketplace Readiness Checklist

### Must-Have for Marketplace Launch

- [ ] **Version sync script** — single command to bump version in all three manifests
- [ ] **Cleanup documentation** — tell users how to fully uninstall (`rm -rf ~/.code-pet`)
- [ ] **First-run UX** — at minimum, log a clear message when Electron is installing so the user knows to wait
- [ ] **Error recovery** — handle corrupted/partial Electron installs (detect broken `node_modules/electron` and
  re-install)
- [ ] **Cross-platform testing** — verify on macOS, Linux, Windows (Electron binary resolution differs)

### Should-Have

- [ ] **GitHub Actions CI** — lint + basic smoke test on PR, auto-release on tag
- [ ] **Version check on SessionStart** — compare local version to latest GitHub release, log if outdated
- [ ] **Graceful uninstall** — shutdown running Electron when plugin is removed (could be a SessionEnd hook that detects
  plugin removal)
- [ ] **Install progress visibility** — even just writing "Code Pet: installing Electron, pet will appear on next
  session" to stdout during the first SessionStart

### Nice-to-Have

- [ ] **Pre-bundled distribution** — platform-specific archives with Electron included (eliminates lazy install)
- [ ] **Auto-update** — background download of new plugin versions
- [ ] **Health dashboard** — `/status` endpoint showing version, uptime, active sessions

---

## 6. How Users Will Experience the Plugin

### Setup (First Time)

```
User: /plugin marketplace add mradovic95/code-pet
Claude: Marketplace added.

User: /plugin install code-pet
Claude: Plugin "code-pet" installed. Run /reset to activate hooks.

User: /reset
(Session restarts, SessionStart hook fires)
(Background: npm install electron runs — ~30-120s depending on connection)
(No pet appears yet)

User: (starts a new prompt or session)
(SessionStart fires again, Electron is now installed)
(Pet overlay appears in bottom-right corner, plays waking_up animation)
```

### Daily Use

```
Session starts → pet wakes up (waking_up animation, 4 seconds)
User submits prompt → pet works (working animation loops)
  OR in plan mode → pet plans (planning animation loops)
Permission prompt → pet waits (waiting_for_action animation)
Tool completes → pet resumes working/planning
User stops → pet returns to idle
Session ends → pet goes to sleep and disappears
  (if no other active sessions for this project)
```

### Interaction

- **Double-click pet** → opens settings window (pet type, sounds, tool usage stats)
- **Settings window** → change pet type (dog, cat, bird; dragon/panda premium)
- **Dismiss button** → removes pet for this session
- **Click pet name** → focuses the terminal running that Claude session

### Multiple Sessions

With the uncommitted session-key changes:

- Two sessions in same project → two pets labeled "MyProject" and "MyProject (2)"
- Changing pet type affects all sessions in that project
- Each session has independent state (working/idle/etc.)

### Update

Currently manual:

```
User: claude plugin remove code-pet
User: /plugin install code-pet
User: /reset
```

No automatic updates exist. Settings and license data in `~/.code-pet/` survive reinstall.

### Uninstall

```
User: claude plugin remove code-pet
(Hooks stop firing, but Electron may still be running)
(User should manually: pkill -f code-pet; rm -rf ~/.code-pet)
```

---

## 7. Recommendations

### Short Term (Pre-Marketplace)

1. **Add a version bump script** in `scripts/`:
   ```bash
   node scripts/bump-version.js 0.2.0
   # Updates plugin.json, marketplace.json, package.json
   ```

2. **Improve first-run experience**:
    - In `on-session-start.js`, when `bootstrap()` returns `{ ready: false }`, output a user-visible message (if the
      hooks protocol allows anything beyond `{}` on stdout)
    - If not, write to a status file that the settings window can show

3. **Add install validation**:
    - In `bootstrap.js`, after detecting Electron, verify the binary actually exists and is executable
    - If `node_modules/electron` exists but the binary is missing, delete and reinstall

4. **Handle running process on uninstall**:
    - In `on-session-end.js`, if the plugin directory no longer exists (CLAUDE_PLUGIN_ROOT is gone), force-kill the
      Electron app

### Medium Term (Post-Marketplace Launch)

5. **Version check on SessionStart**:
    - Fetch latest release tag from GitHub API (non-blocking, fire-and-forget)
    - If newer version exists, log to `~/.code-pet/code-pet.log`
    - Optionally show a subtle indicator on the pet overlay

6. **GitHub Actions**:
    - On push to main: lint all JS files
    - On tag: create GitHub release with changelog
    - Validate that version numbers are in sync across manifests

7. **Cleanup script**:
   ```bash
   node scripts/uninstall.js
   # Kills Electron, removes ~/.code-pet/, removes node_modules/
   ```

### Long Term

8. **Pre-bundled releases**: Platform-specific archives (macOS-arm64, macOS-x64, linux-x64, win-x64) with Electron
   pre-installed. Eliminates the lazy npm install entirely.

9. **Auto-update**: On SessionStart, if a new version is detected, download it to a staging area and hot-swap on next
   session start (requires careful atomic replacement).

10. **Plugin manifest extensions**: If Claude Code adds support for `postInstall`, `preUninstall`, or `onUpdate` hooks
    in plugin.json, wire them up for clean lifecycle management.

---

## 8. Architecture Summary

```
                          Claude Code Plugin System
                          ========================

  /plugin marketplace add mradovic95/code-pet
  /plugin install code-pet
                    │
                    ▼
  ┌─────────────────────────────────────────────┐
  │  .claude-plugin/                            │
  │    plugin.json      ← name, version, author │
  │    marketplace.json ← marketplace metadata  │
  │                                             │
  │  hooks/                                     │
  │    hooks.json       ← 6 hook event mappings │
  │    scripts/                                 │
  │      bootstrap.js   ← lazy npm install      │
  │      send-event.js  ← HTTP POST to app      │
  │      on-session-start.js                    │
  │      on-session-end.js                      │
  │      on-prompt-submit.js                    │
  │      on-notification.js                     │
  │      on-post-tool-use.js                    │
  │      on-stop.js                             │
  └─────────────┬───────────────────────────────┘
                │
     SessionStart fires
                │
                ▼
  ┌─────────────────────────────┐
  │  bootstrap.js               │
  │  ┌───────────────────────┐  │
  │  │ Electron installed?   │  │
  │  │  NO → npm install     │  │
  │  │  YES → continue       │  │
  │  └───────────────────────┘  │
  └─────────────┬───────────────┘
                │
                ▼
  ┌─────────────────────────────┐
  │  process-manager.js         │
  │  ┌───────────────────────┐  │
  │  │ App running?          │  │
  │  │  NO → spawn Electron  │  │
  │  │  YES → skip           │  │
  │  └───────────────────────┘  │
  └─────────────┬───────────────┘
                │
    HTTP POST 127.0.0.1:31425/event
                │
                ▼
  ┌─────────────────────────────┐
  │  Electron App               │
  │  ┌───────────────────────┐  │
  │  │ event-server.js       │  │
  │  │ pet-registry.js       │  │
  │  │ state machine         │  │
  │  │ window-manager.js     │  │
  │  └───────────────────────┘  │
  │  ┌───────────────────────┐  │
  │  │ Overlay Window        │  │
  │  │ pet.js + CSS sprites  │  │
  │  └───────────────────────┘  │
  └─────────────────────────────┘

  Runtime state: ~/.code-pet/
    app.pid, settings.json, logs, license.json
```

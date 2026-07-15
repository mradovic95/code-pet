# Code Pet

Animated desktop pet that reacts to Claude Code activity. A transparent, always-on-top Electron overlay (96×96px, bottom-right corner) shows a sprite-animated dog that responds to hook events.

## Tech Stack

- **Node.js** (>= 18) — hook scripts, process management
- **Electron** (^42.0.0) — transparent overlay window, the only runtime dependency
- No other external dependencies. Keep it that way.

## Directory Structure

```
.claude-plugin/plugin.json   # Claude Code plugin manifest
.claude-plugin/marketplace.json # Claude Code marketplace metadata
hooks/
  hooks.json                 # Hook event → script mapping
  scripts/                   # Hook handlers (plain Node.js, no Electron)
    bootstrap.js             # Lazy Electron installer (background npm install)
    send-event.js            # HTTP POST client to event server
    on-session-start.js      # SessionStart: bootstrap → launch app → send awaken
    on-session-end.js        # SessionEnd: send falling_asleep → shut down Electron (skipped for reason clear/resume)
    on-notification.js       # Notification: send action_requested (+notification payload)
    on-prompt-submit.js      # UserPromptSubmit: send working_started or planning_started (+prompt_length)
    on-pre-tool-use.js       # PreToolUse (matcher Skill|mcp__.*): sends action_started for duration pairing
    on-post-tool-use.js      # PostToolUse: sends action_completed for all tool completions
    on-stop.js               # Stop: send work_finished (+stop_reason)
src/
  app/                       # Electron main process
    main.js                  # Entry point: PID → server → overlay window
    event-server.js          # HTTP server on 127.0.0.1:31425 (/event, /health, /last-event, /shutdown)
    pet-registry.js          # PetRegistry class: per-project PetContext container with lifecycle callbacks
    pet-catalog.js           # Scans shipped + downloaded pet manifests, merges by id
    process-manager.js       # PID file, app launch/stop, health checks
    window-manager.js        # Transparent click-through BrowserWindow + marketplace IPC handlers
    logger.js                # File logger (~/.code-pet/code-pet.log, 1MB max)
    preload.js               # Context bridge: window.codePet.onPetEvent()
    settings-preload.js      # Context bridge for settings window (includes marketplace IPC)
    settings-store.js        # Persistent user settings (~/.code-pet/settings.json) with sound + dismissed pets
    terminal-focus.js        # macOS helper: focuses the terminal that spawned the session
    http-client.js           # Promise-based HTTP utility (Node.js built-in https/http, zero deps)
    marketplace-api.js       # Real marketplace REST API client (replaces MockLicenseAPI when configured)
    marketplace-catalog.js   # Catalog fetch + productId↔petId mapping (cached to product-map.json)
    marketplace-config.js    # Reads ~/.code-pet/marketplace.json for API URL, key, marketplace ID
    marketplace-constants.js # DEFAULT_BASE_URL, DEFAULT_MARKETPLACE_ID; consulted when no override
    license-api.js           # MockLicenseAPI (dev/test fallback when MARKETPLACE_MOCK=true)
    license-manager.js       # License activation, revalidation, offline grace period
    premium-store.js         # Downloads premium pet manifests + sprites to ~/.code-pet/pets/{id}/
    state-machine/             # Server-side state machine (whitelist pattern)
      states.js                # STATES enum
      events.js                # EVENTS, EVENT_TO_STATE, VALID_EVENTS
      base-state.js            # BaseState: ignore-all defaults, helpers
      state-factory.js         # createState(): state name → class instance
      pet-context.js           # PetContext: orchestrator, mutable state per project
      idle-state.js            # IdleState
      active-state.js          # ActiveState: shared working/planning base
      working-state.js         # WorkingState (extends ActiveState)
      planning-state.js        # PlanningState (extends ActiveState)
      waiting-for-action-state.js # WaitingForActionState
  renderer/                  # Chromium renderer (the visible overlay)
    index.html               # Shell: <div id="pets-container">, loads pet.js + pet-manager.js + ipc.js
    pet.js                   # Sprite state machine + interaction (Pet class)
    pet-manager.js           # Multi-project pet orchestration (PetManager class)
    pet-styles.js            # Builds + injects per-pet @keyframes/.pet.<state> CSS at runtime
    ipc.js                   # Wires IPC events to state machine
    styles.css               # Base/static styles for .pet (size, transitions); sprite rules are injected by pet-styles.js
    settings.html            # Settings window UI (opened on double-click)
    settings.js              # Settings window logic
    settings.css             # Settings window styling
    tabs/                    # Settings window tab partials
      general.html             # General settings tab
      store.html               # Marketplace / store tab
      usage.html               # Usage analytics tab
  tracking/                  # Skill / MCP tool usage tracking (self-contained)
    index.js                 # Barrel: UsageEvent, UsageTracker, UsageStore, createStore, MemoryStore, FilesystemStore, usageAnalytics
    usage-event.js           # Frozen UsageEvent value object (type, name, timestamp, sessionId, projectPath, durationMs?, agentId?)
    usage-analytics.js       # Pure aggregation over event arrays (summaries, trends, co-occurrence, dormant, report) — dual-export: require() + window.usageAnalytics in the settings renderer
    usage-tracker.js         # In-memory ring buffer + optional store sink (UsageTracker)
    usage-store.js           # UsageStore abstract contract + createStore({ type }) factory
    stores/
      memory-store.js        # No-op store (default; used in tests)
      filesystem-store.js    # NDJSON append-only at ~/.code-pet/usage.log (single-flight write queue)
assets/pets/{id}/            # Shipped pet bundles: idle/working/planning/waiting_for_action/waking_up PNG strips, sounds, icon.png, manifest.json
docs/
  hook-table.md              # Complete hook event → pet event → state matrix
  state-diagram.puml         # PlantUML state machine and event flow diagrams
scripts/
  generate-placeholders.js   # Dev utility: regenerate SVG placeholder sprites
test/
  helpers/                   # Mock logger, mock context, test HTTP server
  unit/                      # State machine, tracking, pet-registry, marketplace tests
  integration/               # Hook contract tests (spawn real processes + HTTP)
test.sh                      # Dev utility: send events to the pet (curl wrapper)
```

## Architecture

```
Claude Code hooks (stdin JSON)
  → hooks/scripts/*.js (plain Node.js)
    → HTTP POST to 127.0.0.1:31425/event { event: "<semantic_event>" }
      → event-server.js: routes HTTP requests, wires side effects (IPC, window resize, app quit)
        → pet-registry.js: getOrCreate/remove projects, stale cleanup, lifecycle callbacks
          → PetContext: state machine per project → resolves state name
            → IPC: sendToRenderer('pet-event', { project, state, projectName })
              → preload.js context bridge
                → pet.js renderer state machine
                  → CSS class swap on .pet → sprite animation plays
```

Hook scripts and the Electron app communicate **only via HTTP**. Hooks have zero Electron dependency.

**Side-channel: usage persistence.** Each `PetContext` owns a `UsageTracker` that records `skill` and `mcp_tool` events. The tracker holds a ring buffer in memory *and* writes each event through a `UsageStore` sink. The default sink is `FilesystemStore` (NDJSON at `~/.code-pet/usage.log`), constructed in `src/app/main.js` and threaded through `PetRegistry → PetContext → UsageTracker`. Backends are swapped by adding a class to `src/tracking/stores/` and a case to `createStore()` in `src/tracking/usage-store.js` — no other code changes. Events optionally carry `durationMs` (PreToolUse→PostToolUse pairing via an in-memory map on `PetContext`; the `action_started` event is handled before the state machine and never changes pet state) and `agentId` (subagent attribution). `src/tracking/usage-analytics.js` provides pure aggregation (top skills, weekly trends, co-occurrence, dormant detection, markdown report) consumed by the settings Usage tab. See `docs/usage-tracking.md` for the data format and operator reference.

## Marketplace Integration

Premium pets are purchased and downloaded from the deployed marketplace module (Spring Boot API backed by AWS API Gateway + EC2). Defaults live in `src/app/marketplace-constants.js` — `DEFAULT_BASE_URL` and `DEFAULT_MARKETPLACE_ID = 1`.

- **Real mode** (default): `MarketplaceAPI` calls the deployed REST API. No configuration required out of the box.
- **Mock mode** (dev only): `MockLicenseAPI` generates fake license keys for activation testing. Sprite download is not supported in mock mode — a real marketplace API is required to fetch assets. Activate by setting `MARKETPLACE_MOCK=true`.

```
Settings UI (Buy button)
  → buyer email collected (stored in settings.json under "buyerEmail")
  → IPC: purchase-pet { petId, buyerEmail }
    → MarketplaceAPI.purchase(petId, buyerEmail)
      → POST /api/v1/products/{productId}/purchases { buyerEmail }
        → FREE: license key returned immediately (also emailed to buyer)
        → PREMIUM: PayPal URL returned → shell.openExternal() → user pays
          → IPC: poll-payment-status → GET /purchases/payment-success?token=...
            → license key returned
  → IPC: activate-license
    → LicenseManager.activate(key) → POST /api/v1/licenses/{key}/activations { machineId }
    → PremiumStore.download(petId, key, api, productId)
      → GET /api/v1/products/{productId}/assets/manifest.json (header: X-License-Key)
      → GET /api/v1/products/{productId}/assets/{filename} (header: X-License-Key)
      → write to ~/.code-pet/pets/{petId}/
    → IPC: pet-catalog refresh → renderer reads the new pet's sprites from disk like any other
```

**Configuration** (all optional, overrides the defaults in `marketplace-constants.js`):

`~/.code-pet/marketplace.json`:
```json
{
  "baseUrl": "https://fake-marketplace.invalid",
  "marketplaceId": 1,
  "jwtToken": null
}
```

Env var overrides: `MARKETPLACE_URL`, `MARKETPLACE_ID`, `MARKETPLACE_MOCK`.

**Product ID ↔ Pet ID mapping**: The marketplace uses numeric `productId`, code-pet uses string `petId`. The mapping is built from the catalog response — `petId = product.name.toLowerCase().replace(/\s+/g, '-')` — and cached to `~/.code-pet/product-map.json`. **Sellers must name products predictably** for this to round-trip.

**Asset manifest convention**: Each product has a `manifest.json` asset listing sprite filenames. The client fetches `manifest.json` first, then each referenced sprite. Sellers are responsible for uploading both. Asset downloads are gated by `X-License-Key` (not `Authorization: Bearer`).

**Stale mock key recovery**: if `~/.code-pet/license.json` contains a key starting with `MOCK-` while running in real mode, the file is cleared on startup (logged as a warning). Prevents confusion when a dev toggles off mock mode.

## Events and States

Four semantic events map to four server-side states. Four additional events (`awaken`, `falling_asleep`, `action_completed`, `dismiss`) are handled specially by the server without a dedicated state.

| Event (hook sends) | State (pet.js) | Triggered by |
|---------------------|----------------|--------------|
| `awaken` | *(renderer-only `waking_up` animation)* | SessionStart |
| `action_started` | *(no state change)* | PreToolUse (Skill and MCP tools only) |
| `working_started` | `working` | UserPromptSubmit (normal mode) |
| `planning_started` | `planning` | UserPromptSubmit (plan mode) |
| `action_requested` | `waiting_for_action` | Notification (permission_prompt) |
| `work_finished` | `idle` | Stop |
| `action_completed` | *(restores previous)* | PostToolUse (any tool) |
| `falling_asleep` | *(ignored or removes project)* | SessionEnd (real terminations only; not sent for `reason: clear`/`resume`) |
| `dismiss` | *(removes project unconditionally)* | UI: Settings → Dismiss Pet |

> `awaken` does not change server state — the server stays in `idle` and sends `rendererState: 'waking_up'` to the renderer, which plays the one-shot animation (4s, frame count per the pet's manifest) and auto-transitions back to idle CSS.

> `on-post-tool-use.js` sends `action_completed` for every tool completion. The server restores the pet from `waiting_for_action` to its previous active state (`working` or `planning`) via `lastActiveEvent`. In active states, it re-affirms the current state. In idle, it is ignored — unless the event carries `agentId` (forwarded from the hook's `agent_id` stdin field, present only for tool calls made inside a subagent): then the pet wakes back to `working`/`planning`, so background subagents that outlive the main agent's turn keep the pet animated. Untagged events stay ignored in idle so a main-agent tool completion racing in after Stop can't wake the pet with no later Stop to re-idle it. See `docs/background-subagents-investigation.md`.

> `falling_asleep` is handled specially by the server: removes the project only in `idle`; ignored in all other states (`working`, `planning`, `waiting_for_action`). The hook itself filters first: `on-session-end.js` reads `reason` from stdin and sends nothing when the session ends in place (`clear` from `/clear`, `resume` from `/resume`/`--continue`) — the pet survives those and the follow-up SessionStart just replays the waking_up animation.

> `dismiss` unconditionally removes the project regardless of current state. It is triggered by the UI Dismiss button (Settings window), not by hooks. `BaseState.onDismiss()` defaults to `removeProject()`, so all states inherit this behavior.

## State Machine & Interaction (pet.js)

Four server-side states: `idle`, `working`, `planning`, `waiting_for_action`

`waking_up` is a renderer-only animation — the server stays in `idle` and sends `rendererState: 'waking_up'` to the renderer, which plays the one-shot animation and auto-transitions to idle CSS.

| State | Frames | Duration | Loops | Auto-transition |
|-------|--------|----------|-------|-----------------|
| idle | 4 | 1600ms | yes | — |
| working | 4 | 1200ms | yes | — |
| planning | 4 | 1200ms | yes | — |
| waiting_for_action | 4 | 1600ms | yes | — |
| *waking_up (renderer-only)* | per manifest (shipped pets: 4; in-code fallback in `pet.js`: 20) | 4000ms | no | → idle (4000ms) |

- **Debounce**: 300ms — rapid state changes collapse to the latest event
- **Active states** (working, planning): loop until explicitly changed by a hook event (Stop → idle, UserPromptSubmit → working/planning)
- **Plan mode detection**: `on-prompt-submit.js` checks `permission_mode === "plan"` in stdin JSON to send `planning_started` instead of `working_started`
- **`falling_asleep` handling**: State classes handle `falling_asleep` per-state: only IdleState removes the project; all other states (working, planning, waiting_for_action) ignore it via BaseState's default `ignore()` behavior.
- **Awaken suppression**: implicit via the whitelist pattern — only IdleState overrides `onAwaken()`. All other states inherit `BaseState.ignore()`, so awaken events during any non-idle state are silently ignored. Prevents spurious `SessionStart` (fired after permission prompts / AskQuestion answers) from interrupting work animations.

## Key Conventions

- All hook scripts exit with `process.stdout.write('{}')` and code 0 — never block Claude Code
- Project identity in hook payloads comes from `CLAUDE_PROJECT_DIR` (fallback: `process.cwd()`) via `getProjectRoot()` in `send-event.js` — never from the hook's cwd alone, which drifts when a Bash tool call runs `cd` mid-session and would mint phantom pets for subfolders. Pet keying stays one per session (`projectPath::claudePid`); concurrent sessions in the same folder get suffixed labels by design. See `docs/subfolder-pet-investigation.md`.
- Errors in hooks are silently swallowed; the pet is non-intrusive
- Electron installs lazily on first `SessionStart` via background `npm install` (lock file at `~/.code-pet/installing`)
- Single instance enforced via `app.requestSingleInstanceLock()` + PID file
- Renderer uses `contextIsolation: true`, `nodeIntegration: false`
- Overlay is click-through (`setIgnoreMouseEvents(true)`), always-on-top at `screen-saver` level, visible on all workspaces
- `CODE_PET_PORT` env var overrides the default port 31425
- `USAGE_STORE_TYPE` env var selects the persistence backend (`filesystem` default, `memory` to disable). Skill / MCP events are appended to `~/.code-pet/usage.log` by default.
- `CODE_PET_TOOL_START_TTL_MS` (default 600000) and `CODE_PET_MAX_PENDING_TOOL_STARTS` (default 50) env vars tune the duration-pairing map in `pet-context.js`; read once at app start, invalid values fall back.
- `CODE_PET_IDLE_CLEANUP=true` enables the 60 s stale-project sweep that removes projects idle > 3 h (`src/app/pet-registry.js:151`, gated in `src/app/event-server.js`). Default off — projects persist in the registry until the app exits, which can delay the 5 s idle-shutdown trigger on multi-project users.
- `touch ~/.code-pet/debug` enables file logging (`code-pet.log` and `hooks-debug.log`); `rm ~/.code-pet/debug` disables it. Logging is off by default.
- Hook scripts that read stdin log the full JSON to `~/.code-pet/hooks-debug.log` for debugging (e.g. `debugLog(`on-<hook> stdin: ${JSON.stringify(input)}`)` )
- All runtime flags (sentinel files, env vars, config fields, tunable constants) are catalogued in `docs/feature-flags.md`

## Runtime State (all in `~/.code-pet/`)

| File | Purpose |
|------|---------|
| `app.pid` | Running Electron process PID |
| `code-pet.log` | Structured app log (1MB, truncated on overflow) |
| `app.log` | Electron stdout/stderr |
| `install.log` | npm install output |
| `installing` | Lock file during npm install (contains PID, stale after 10min) |
| `hooks-debug.log` | Timestamped log of all hook events sent via `send-event.js` + full stdin JSON from each hook |
| `marketplace.json` | Marketplace API configuration (baseUrl, apiKey, marketplaceId) |
| `product-map.json` | Cached productId ↔ petId mapping from marketplace catalog |
| `license.json` | Activated license key, owned pets, validation timestamp |
| `pets/{id}/` | Downloaded marketplace pets (sprites + manifest + icon, plaintext). Lives outside the plugin dir so purchases survive `claude plugin upgrade`. Missing-but-owned pets are redownloaded on startup using `license.json`. |
| `usage.log` | Append-only NDJSON log of skill / MCP tool events. One JSON object per line. Grows unbounded by design (cross-session analytics). Disable with `USAGE_STORE_TYPE=memory`. |

## Testing

**Framework:** Node.js built-in test runner (`node:test`) — zero external dependencies.

```bash
npm test                    # run all tests
npm run test:unit           # unit tests only
npm run test:integration    # integration tests only
npm run test:watch          # watch mode
```

### Test Structure

```
test/
  helpers/
    mock-logger.js          # No-op logger replacement
    mock-modules.js         # Require cache mocking for logger, settings-store
    mock-context.js         # Mock PetContext for testing states in isolation
    test-http-server.js     # Records HTTP requests for hook contract tests
  unit/
    state-machine/          # One test file per state class
      idle-state.test.js
      working-state.test.js
      planning-state.test.js
      waiting-for-action-state.test.js
      active-state.test.js
      state-factory.test.js
      pet-context.test.js
    tracking/
      usage-event.test.js
      usage-tracker.test.js
      usage-store.test.js
      memory-store.test.js
      filesystem-store.test.js
    pet-registry.test.js
    pet-catalog.test.js
    premium-store.test.js
    event-server.test.js
    http-client.test.js
    marketplace-api.test.js
    marketplace-config.test.js
  integration/
    hook-prompt-submit.test.js
    hook-post-tool-use.test.js
    hook-stop.test.js
    hook-notification.test.js
    hook-session-end.test.js
    marketplace-flow.test.js
```

### Test Conventions

- **`sut`** — always name the system under test `sut`
- **`// GIVEN // WHEN // THEN`** — every test uses these section comments
- **Test names** — describe behavior: `"transitions to working when working_started received"`
- **State tests use mock context** — instantiate the state class directly with `createMockContext()`, not through PetContext
- **`pet-context.test.js`** — tests the full orchestration (PetContext + StateFactory + States together)
- **Integration tests** — spawn real child processes and HTTP servers, test the stdin → HTTP contract
- **Mock only external deps** — `logger`, `electron`, `settings-store`. Use real instances of own classes.
- **No `mock.module()`** — Node 22 doesn't support it; use `require.cache` manipulation via `mock-modules.js`

## Development Commands

```bash
# Regenerate placeholder sprite assets
node scripts/generate-placeholders.js

# Install the plugin in Claude Code
claude --plugin-dir /path/to/code-pet

# Run Electron manually (after npm install)
npx electron src/app/main.js

# Send an event to the running pet (defaults to awaken)
./test.sh                    # sends awaken
./test.sh working_started    # sends working_started
```

## Sprite Format

Each sprite is a horizontal strip of 64×64px frames (PNG or SVG) with transparent background. All sprite strips must be exactly `frameSize × frameCount` pixels wide (e.g., 256×64 for 4 frames at 64px). Frame counts are defined in each pet's `manifest.json`. CSS in `pet-styles.js` uses `background-position` with `steps(N)` to animate.

Each pet directory includes an `icon.png` (64×64) cropped from the first frame of `idle.png`. Pets live in two roots:
- **Shipped** (bird, cat, dog): `assets/pets/{id}/` inside the plugin dir. Replaced by `claude plugin upgrade`.
- **Downloaded** (anything from the marketplace): `~/.code-pet/pets/{id}/` under the user data dir. Survives plugin upgrade/reinstall.

`PetCatalog.scan()` is called once per root at startup. Later-root entries overlay earlier on id collision. The renderer reads each manifest's pre-built `_dirUrl` (computed in main via `pathToFileURL` so Windows paths round-trip correctly) and appends the sprite/sound/icon filename — shipped vs downloaded is invisible to the renderer. If an owned pet is missing from `~/.code-pet/pets/` on startup (e.g. the user wiped the dir), the recovery loop in `main.js` redownloads it from the marketplace using the persisted license.

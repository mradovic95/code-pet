# Feature Flags & Runtime Toggles

Every flag in Code Pet, grouped by mechanism. Precedence: **env var > config file > code default**.

## 1. Sentinel files (existence-based toggles)

| Path | Default | Effect when present | Enable | Disable |
|------|---------|---------------------|--------|---------|
| `~/.code-pet/debug` | absent | Enables file logging to `~/.code-pet/code-pet.log` (app) and `~/.code-pet/hooks-debug.log` (hooks) | `touch ~/.code-pet/debug` | `rm ~/.code-pet/debug` |

Read at `src/app/logger.js:8` and `hooks/scripts/send-event.js:9`. The main-process value is cached at module load and requires an app restart to pick up a change; hook scripts re-read on every fire since each hook spawns a fresh Node process.

**Not gated by this flag:** `~/.code-pet/app.log` (Electron stdout/stderr) and `~/.code-pet/install.log` (npm install output) are written by `src/app/process-manager.js` regardless. Expect them on user machines even when debug is disabled.

## 2. Environment variables

| Name | Default | Effect | Read at |
|------|---------|--------|---------|
| `CODE_PET_PORT` | `31425` | HTTP port for the event server + hook clients | `src/app/event-server.js:11`, `src/app/process-manager.js:11`, `hooks/scripts/send-event.js:10` |
| `MARKETPLACE_URL` | (from config file) | Overrides `marketplace.json.baseUrl` | `src/app/marketplace-config.js:33` |
| `MARKETPLACE_API_KEY` | (from config file) | Overrides `marketplace.json.apiKey`. Presence flips mock → real mode | `src/app/marketplace-config.js:36` |
| `MARKETPLACE_ID` | (from config file) | Overrides `marketplace.json.marketplaceId`; coerced to `Number` | `src/app/marketplace-config.js:39` |
| `CLAUDE_PLUGIN_ROOT` | resolved from hook script location | Plugin root directory; set by Claude Code at hook invocation time | `hooks/scripts/bootstrap.js`, `hooks/scripts/on-session-start.js`, `hooks/scripts/on-session-end.js` |
| `USAGE_STORE_TYPE` | `filesystem` | Backend for persistent skill / MCP usage events. `filesystem` writes NDJSON to `~/.code-pet/usage.log`; `memory` disables persistence (in-process only) | `src/app/main.js` (passed to `createStore`) |

## 3. `~/.code-pet/marketplace.json`

Defaults live in `src/app/marketplace-config.js:11-16`.

| Field | Default | Effect |
|-------|---------|--------|
| `baseUrl` | `https://2vyd33gumd.execute-api.us-east-2.amazonaws.com/stage` | Marketplace REST API base URL |
| `apiKey` | `null` | **Mock/real mode gate** — presence switches to `MarketplaceAPI` (see section 5) |
| `marketplaceId` | `null` | Marketplace ID passed to API calls |
| `jwtToken` | `null` | Session JWT; internal, populated by login flow |

Example:

```json
{
  "baseUrl": "https://2vyd33gumd.execute-api.us-east-2.amazonaws.com/stage",
  "apiKey": "your-api-key",
  "marketplaceId": 1
}
```

## 4. `~/.code-pet/settings.json` (UI-managed)

Written by `src/app/settings-store.js`. These are normally toggled through the Settings window (double-click the pet) — direct hand-editing works but is not the intended path.

| Key | Default | Effect |
|-----|---------|--------|
| `defaultPetType` | `"dog"` | Fallback pet type when a project has no override |
| `projectPets` | `{}` | Map of `projectPath → petType` — per-project override |
| `licenseKey` | `null` | Activated marketplace license |
| `activationId` | `null` | Machine-specific activation id bound to the license |
| `soundEnabled.idle` | `false` | Play sound when entering idle state |
| `soundEnabled.waiting_for_action` | `false` | Play sound when entering waiting-for-action state |

## 5. Mock vs real marketplace mode

Single decision point in `src/app/main.js`, gated by `marketplaceConfig.isConfigured()` which evaluates `!!config.apiKey` (`src/app/marketplace-config.js:66-68`).

- **Mock mode** (default, no `apiKey` set): `MockLicenseAPI` generates fake keys and copies sprites from `assets/pets-dev/`.
- **Real mode** (`apiKey` set via file or env): `MarketplaceAPI` calls the marketplace REST API and downloads XOR-encrypted sprites to `~/.code-pet/premium-pets/`.

To force mock mode in a configured environment: unset `MARKETPLACE_API_KEY` **and** remove `apiKey` from `~/.code-pet/marketplace.json`.

## 6. Settings-window tab flags

Hardcoded in `src/renderer/settings.js:3-7` as `FEATURE_FLAGS`. Renderer-only, compile-time toggles — flip the literal to `false` and reload the settings window. Backing IPC handlers in `src/app/window-manager.js` stay wired either way; hiding a tab just removes the UI entry point.

| Flag | Default | Hides when `false` | Wired at |
|------|---------|-------------------|----------|
| `STORE_TAB` | `true` | **Store** tab — marketplace grid, Buy buttons, license activation form | `src/renderer/settings.js:21-23, 55-58` |
| `USAGE_TAB` | `true` | **Usage** tab — MCP/skill usage counters, event log | `src/renderer/settings.js:24-26, 60-62` |

The **General** tab (pet selector, sound toggles, Dismiss) is always shown.

## 7. Tunable code constants

Internal — require a code change + rebuild, not runtime flags. Listed so operational tuning is discoverable.

| Constant | Value | Location | Effect |
|----------|-------|----------|--------|
| Stale session cleanup threshold | 3 hours | `src/app/pet-registry.js:150` | Projects with no events for this long are removed from the registry. Raised from 30 min in commit `47b5b3e`. |
| Cleanup check interval | 60 s | `src/app/pet-registry.js:154` | How often the stale-cleanup sweep runs |
| `REVALIDATION_INTERVAL` | 7 days | `src/app/license-manager.js:12` | License revalidation cadence against marketplace |
| `OFFLINE_GRACE_PERIOD` | 30 days | `src/app/license-manager.js:13` | License stays valid this long without a successful revalidation |
| `DEFAULT_MAX_EVENTS` | 2000 | `src/tracking/usage-tracker.js:6` | In-memory usage event cap; evicts 25% when exceeded |
| `DEBOUNCE_MS` | 300 ms | `src/renderer/pet.js:15` | Collapses rapid state changes in the renderer |
| `DEFAULT_TIMEOUT` | 15 s | `src/app/http-client.js:8` | HTTP timeout for marketplace API calls |
| App log max size | 1 MB | `src/app/logger.js:10` | `code-pet.log` is truncated (not rotated) at this size |

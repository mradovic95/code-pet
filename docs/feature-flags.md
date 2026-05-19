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
| `MARKETPLACE_URL` | `DEFAULT_BASE_URL` from `marketplace-constants.js` | Overrides `marketplace.json.baseUrl` | `src/app/marketplace-config.js` |
| `MARKETPLACE_ID` | `DEFAULT_MARKETPLACE_ID` (`1`) from `marketplace-constants.js` | Overrides `marketplace.json.marketplaceId`; coerced to `Number` | `src/app/marketplace-config.js` |
| `MARKETPLACE_MOCK` | `false` | When `"true"`, forces `MockLicenseAPI` instead of the real marketplace client (dev-only) | `src/app/marketplace-config.js` → `isMockMode()` |
| `CLAUDE_PLUGIN_ROOT` | resolved from hook script location | Plugin root directory; set by Claude Code at hook invocation time | `hooks/scripts/bootstrap.js`, `hooks/scripts/on-session-start.js`, `hooks/scripts/on-session-end.js` |
| `USAGE_STORE_TYPE` | `filesystem` | Backend for persistent skill / MCP usage events. `filesystem` writes NDJSON to `~/.code-pet/usage.log`; `memory` disables persistence (in-process only) | `src/app/main.js` (passed to `createStore`) |
| `CODE_PET_IDLE_CLEANUP` | `false` | When `"true"`, runs the 60 s stale-project sweep that removes projects idle > 3 h. Default off — projects persist in the registry until the Electron process exits. Disabling can delay or prevent the 5 s idle-shutdown trigger on multi-project users (registry never reaches empty on its own). | `src/app/event-server.js` |

## 3. `~/.code-pet/marketplace.json`

Defaults come from `src/app/marketplace-constants.js` and are merged with file values in `src/app/marketplace-config.js`.

| Field | Default | Effect |
|-------|---------|--------|
| `baseUrl` | `DEFAULT_BASE_URL` (deployed stage URL) | Marketplace REST API base URL |
| `marketplaceId` | `DEFAULT_MARKETPLACE_ID` (`1`) | Marketplace ID passed as `?marketplaceId=` when listing products |
| `jwtToken` | `null` | Session JWT for admin/seller endpoints; unused for customer flows |

File is optional — the defaults work out of the box. Example override:

```json
{
  "baseUrl": "https://staging.marketplace.example.com",
  "marketplaceId": 2
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
| `buyerEmail` | `null` | Email used for marketplace purchases — collected inline on first Buy click |

## 5. Mock vs real marketplace mode

Single decision point in `src/app/main.js`, gated by `marketplaceConfig.isMockMode()` which returns `process.env.MARKETPLACE_MOCK === 'true'`.

- **Real mode** (default): `MarketplaceAPI` calls the deployed marketplace REST API at `DEFAULT_BASE_URL` (see `src/app/marketplace-constants.js`). No configuration required.
- **Mock mode** (`MARKETPLACE_MOCK=true`): `MockLicenseAPI` generates fake license keys for activation testing. Sprite download is not supported in mock mode — `PremiumStore.download()` requires a real marketplace API + productId.

**Stale mock key guard**: on startup in real mode, if `~/.code-pet/license.json` holds a key starting with `MOCK-`, the file is cleared (with a warning log) to prevent mixed-state crashes for devs toggling between modes.

**Lazy catalog fetch**: `MarketplaceAPI.getCatalog()` is never called at app startup. The productId↔petId map is loaded from `~/.code-pet/product-map.json` in the `MarketplaceAPI` constructor, and refreshed on demand by `activate()`, `validate()`, and the Store tab (`getMarketplaceCatalog` IPC). The recovery loop in `src/app/main.js` lazy-primes via `getCatalog()` only on a first cache miss. Net effect: a fresh install with no owned pets produces **zero** marketplace HTTP until the user opens the Store tab.

## 6. Settings-window tab flags

Hardcoded in `src/renderer/settings.js:3-7` as `FEATURE_FLAGS`. Renderer-only, compile-time toggles — flip the literal to `false` and reload the settings window. Backing IPC handlers in `src/app/window-manager.js` stay wired either way; hiding a tab just removes the UI entry point. No marketplace HTTP fires while a tab is hidden (see section 5 — all marketplace calls are lazy / user-initiated).

| Flag | Default | Hides when `false` | Wired at |
|------|---------|-------------------|----------|
| `STORE_TAB` | `false` | **Store** tab — marketplace grid, Buy buttons, license activation form. Default is `false` for v1 until the marketplace ships publicly. | `src/renderer/settings.js:21-23, 55-58` |
| `USAGE_TAB` | `true` | **Usage** tab — MCP/skill usage counters, event log | `src/renderer/settings.js:24-26, 60-62` |

The **General** tab (pet selector, sound toggles, Dismiss) is always shown.

## 7. Tunable code constants

Internal — require a code change + rebuild, not runtime flags. Listed so operational tuning is discoverable.

| Constant | Value | Location | Effect |
|----------|-------|----------|--------|
| Stale session cleanup threshold | 3 hours | `src/app/pet-registry.js:150` | Projects with no events for this long are removed from the registry. Raised from 30 min in commit `47b5b3e`. Only applies when `CODE_PET_IDLE_CLEANUP=true` (see section 2); otherwise the sweep does not run. |
| Cleanup check interval | 60 s | `src/app/pet-registry.js:154` | How often the stale-cleanup sweep runs (when enabled via `CODE_PET_IDLE_CLEANUP`) |
| `REVALIDATION_INTERVAL` | 7 days | `src/app/license-manager.js:12` | License revalidation cadence against marketplace |
| `OFFLINE_GRACE_PERIOD` | 30 days | `src/app/license-manager.js:13` | License stays valid this long without a successful revalidation |
| `DEFAULT_MAX_EVENTS` | 2000 | `src/tracking/usage-tracker.js:6` | In-memory usage event cap; evicts 25% when exceeded |
| `DEBOUNCE_MS` | 300 ms | `src/renderer/pet.js:15` | Collapses rapid state changes in the renderer |
| `DEFAULT_TIMEOUT` | 15 s | `src/app/http-client.js:8` | HTTP timeout for marketplace API calls |
| App log max size | 1 MB | `src/app/logger.js:10` | `code-pet.log` is truncated (not rotated) at this size |

# Production Readiness Audit — code-pet (0.1.x)

## Context

A snapshot assessment of whether code-pet is production-ready and what
remains to do. The project self-identifies as `0.1.x — early, actively
developed` in the README. The store tab is intentionally disabled in the
first release (`STORE_TAB = false`, `src/renderer/settings.js:5`), so the
bar for the imminent ship is **the core pet experience**, not the
marketplace flow.

Three parallel audits (code quality, tests/CI, ops/security) found a small
number of real blockers, a larger set of must-fix-before-Store-launch
items, and a handful of nice-to-haves. The codebase is in good shape — docs,
security defaults, privacy, and dependency hygiene are all clean. The gaps
cluster in two areas: test coverage of the Electron-side code, and
marketplace resilience.

---

## Verdict

**Not yet 1.0, but close to a confident 0.1.x public release** if the small
set of Tier 1 items below is addressed. The marketplace path is functional
but fragile and is correctly gated off via `STORE_TAB`; it can be hardened
on its own track before the store tab is unhidden.

---

## Tier 1 — Must-fix before wider 0.1.x public release

Each item ends with the exact file:line and a one-sentence fix.

1. ~~**License field mismatch.** `package.json:11` says
   `"license": "SEE LICENSE IN LICENSE"`; `.claude-plugin/plugin.json:12` and
   the LICENSE file say MIT. → Change to `"license": "MIT"` in `package.json`.~~
   **[RESOLVED — original recommendation was incorrect.]** The repo has
   deliberate dual licensing: source code is MIT (`LICENSE`), art assets
   are proprietary (`assets/LICENSE`). `"SEE LICENSE IN LICENSE"` is the
   correct npm/SPDX convention for mixed-license packages; declaring
   `"MIT"` would misrepresent the asset license. `assets/LICENSE` was
   rewritten to include an explicit use grant (any context, personal or
   commercial), a clean prohibitions list, and a contact channel. Leave
   `package.json:11` as-is. GitHub showing "Other" instead of a green
   MIT badge is the honest representation.

2. ~~**CI doesn't validate the "Node ≥ 18" claim.** `.github/workflows/ci.yml`
   tests only one Node version (from `.nvmrc`). The README and
   `package.json:engines` advertise Node ≥ 18.
   → Add a `node-version: [18, 20, 22]` matrix to the test job (keep the
   3-OS matrix as-is).~~
   **[RESOLVED]** The `test` job in `.github/workflows/ci.yml` now runs
   a 3×3 matrix (Ubuntu/macOS/Windows × Node 18/20/22), producing 9
   parallel test runs per push. `.nvmrc` stays at 22.17.0 for local dev;
   `audit` and `version-sync` jobs remain single-Node. If a future run
   reveals real Node-18 incompatibility, the choice is to either fix the
   offending API or bump `engines` to `>= 20` — out of scope for this
   item.

3. ~~**Test timeout protection missing.** Integration tests spawn child
   processes via `spawn()` without timeouts; a hung hook would hang CI
   forever. → Add a per-test timeout (e.g. `test('...', { timeout: 30000 })`)
   in `test/integration/*.test.js`.~~
   **[WON'T DO — defensive only.]** Maintainer decision: skip. Hooks
   currently behave; if a CI job ever hangs it can be cancelled manually.
   Revisit if a real hang shows up in practice.

4. **Silent catches in `process-manager.js`** mask stale-PID and health-check
   failures (`src/app/process-manager.js:29, 37, 44, 165, 176`). The PID
   lifecycle is load-bearing for single-instance + clean restart.
   → Log via `logger.warn(...)` inside each catch instead of `/* ignore */`.

5. ~~**`console.log` leftover in hook bootstrap** at
   `hooks/scripts/bootstrap.js:99` — prints JSON to stdout in hook context,
   which is parsed by Claude Code. Per `hooks/scripts/*` convention, every
   hook should write only `{}` to stdout. → Replace with `debugLog(...)` or
   remove.~~
   **[WON'T DO — incorrect audit.]** The `console.log` is guarded by
   `if (require.main === module)` and only runs when `bootstrap.js` is
   invoked directly from a terminal (a deliberate dev-testing affordance,
   documented by the comment on line 95). Claude Code never invokes
   `bootstrap.js` directly — `hooks.json` only registers `on-*.js` scripts,
   and `on-session-start.js` imports bootstrap as a module, bypassing the
   guarded block. No stdout pollution in real flows.

6. **Test coverage for the renderer + event server.** Split into two
   sub-items; resolved separately.

   - **6a `src/app/event-server.js`** — **[RESOLVED]** Added
     `test/unit/event-server.test.js` (11 tests) covering all four routes
     (`/event`, `/health`, `/last-event`, `/shutdown`), the
     malformed-JSON path, and the 1MB body limit, against a real local
     HTTP listener with `electron` / `window-manager` / `process-manager`
     mocked via `require.cache`. The 413-on-oversize test also pinned
     down a small production-side defect (req.destroy() before response
     → client sees ECONNRESET instead of 413) for future cleanup.
     Deferred: EADDRINUSE recovery branch and the 5s shutdown-timer
     cancellation case — both noted as TODOs at the bottom of the test
     file.

   - **6b `src/renderer/pet.js`** — **[WON'T DO — high cost, low value.]**
     Browser-side code (`window.codePet`, `document` via `this.el`,
     `new Audio(...)`). Testing in Node would require either (a) jsdom
     or happy-dom as a dev dep, reversing the project's deliberate
     zero-dev-deps stance, or (b) heroic stubbing of every DOM API used.
     The state-machine logic that actually matters is already covered
     server-side by the seven test files in `test/unit/state-machine/`.
     What's left in pet.js is CSS class swapping, debounce timing, click
     disambiguation, and audio playback — low-risk DOM coupling that's
     exercised by manual smoke testing in the running Electron app.
     `window-manager.js` and `settings.js` follow the same reasoning.

---

## Tier 2 — Must-fix before Store tab is unhidden (1.0)

These don't block today's ship because `STORE_TAB = false`, but they're
hard requirements before the marketplace UI becomes user-visible.

1. **No retry/backoff in marketplace HTTP.** `src/app/http-client.js:8` is
   single-shot; `marketplace-api.js` calls (`activate`, `validate`,
   `getCatalog`, `purchase`, asset download) fail permanently on any
   transient. → Add exponential backoff (3 retries, 1s → 4s → 8s, with
   jitter) inside `http-client.js` for idempotent GETs; leave POSTs as a
   per-call opt-in.

2. **Payment success polling is dead code.**
   `src/app/marketplace-api.js:136-149` defines `checkPaymentStatus()` but
   nothing calls it; after the PayPal redirect there's no polling loop.
   → Wire it into the purchase flow in `src/app/window-manager.js` (the
   `purchase-pet` IPC handler) with a sane cap (e.g. poll every 3s for 5 min).

3. **Asset download is non-atomic.** `src/app/premium-store.js:43-71`
   writes sprites/manifest/icon directly to `~/.code-pet/pets/{id}/`; a
   mid-download failure leaves partial state on disk that survives restart.
   → Download to `~/.code-pet/pets/{id}.tmp/` and rename on success.

4. **Mock mode is unguarded.** `MARKETPLACE_MOCK=true` produces fake
   licenses that look real in the UI. → Add a one-line indicator in the
   Store tab header when `MARKETPLACE_MOCK` is set, and guard
   `license.json` write so `MOCK-*` keys never persist (already partially
   handled by the recovery loop in `main.js`, but make it active too).

5. **Marketplace + licensing test coverage.** No `license-manager.test.js`;
   `marketplace-api.test.js` covers only the happy path.
   → Add error-path tests (network timeout, 4xx, malformed manifest, stale
   `MOCK-*` recovery, offline grace window).

6. **License recovery flow on startup is untested.** `main.js` redownloads
   missing-but-owned pets at boot. Worth one integration test with a fake
   marketplace server.

---

## Tier 3 — Nice-to-have polish (any time)

- **Release checklist** — document the version-bump / tag / push sequence
  in `CONTRIBUTING.md` or a new `docs/releasing.md`. CI already has a
  `version-sync` job; reference it.
- **Config validation at startup** — validate `CODE_PET_PORT` is in
  `[1024, 65535]` and `marketplace.json#baseUrl` parses as a URL, with
  clear early-exit error messages. Currently both fail with cryptic
  errors deep in the call stack.
- **Coverage report** in CI (e.g. `node --test --experimental-test-coverage`)
  and a badge in the README — makes the test gap visible over time.
- **Per-OS test step labelling** in `ci.yml` so OS-specific flakes are
  easier to triage.

---

## What's already solid (no action needed)

- **Docs.** Substantive README, CHANGELOG follows Keep-a-Changelog,
  SECURITY.md is a real disclosure policy, CONTRIBUTING.md enforces
  issue-first, `docs/` includes flow diagrams.
- **Security defaults.** `contextIsolation: true`, `nodeIntegration: false`,
  HTTPS-only external URLs, no plaintext key logging,
  `shell.openExternal` is URL-validated.
- **Privacy.** Tracking layer (`src/tracking/`) has no network calls; usage
  log is local NDJSON; `USAGE_STORE_TYPE=memory` disables it.
- **Deps.** One pinned runtime dep (Electron 41.3.0), zero dev deps.
- **State machine.** Whitelist-pattern state machine has thorough unit
  tests per state plus a `pet-context.test.js` orchestration test.
- **Hook contract tests.** All five hooks have integration tests that
  spawn the real script against a recording HTTP server.

---

## Critical files referenced

- `package.json:11` (license field)
- `.github/workflows/ci.yml` (Node matrix)
- `test/integration/*.test.js` (timeouts)
- `src/app/process-manager.js:29, 37, 44, 165, 176` (silent catches)
- `hooks/scripts/bootstrap.js:99` (console.log)
- `src/app/event-server.js`, `src/renderer/pet.js` (missing unit tests)
- `src/app/http-client.js`, `src/app/marketplace-api.js`,
  `src/app/premium-store.js` (Tier 2)

---

## How to verify when done

- `npm test` green on the 3-OS × Node 18/20/22 matrix.
- `npm audit --audit-level=high` clean (already enforced in CI).
- Manual smoke: `claude --plugin-dir .` against a fresh `~/.code-pet/`,
  exercise SessionStart → UserPromptSubmit → Notification → Stop →
  SessionEnd, watch `~/.code-pet/code-pet.log` for warnings that used to be
  silent (validates the `process-manager.js` log fix).
- Settings → General double-click works; Store tab still hidden.

---

## Recommended sequencing

This is an audit, not a single-PR job. Suggested grouping for separate
PRs (one issue per PR, per project policy):

1. **PR-1 — release-hygiene** (low risk, ~1 hour): items T1.1, T1.2, T1.5
   (license field, Node matrix, console.log).
2. **PR-2 — robustness** (~½ day): T1.3, T1.4 (test timeouts, silent
   catches).
3. **PR-3 — coverage** (~1 day): T1.6 (event-server + pet.js unit tests).
4. **PR-4..N — marketplace hardening track** (Tier 2): one PR per topic,
   landed before flipping `STORE_TAB = true`.

After PR-1..3 land, the project is at a confident "0.1.x public" bar. After
the Tier 2 track lands, the Store tab can ship and the project is at 1.0.

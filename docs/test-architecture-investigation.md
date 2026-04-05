# Test Architecture Investigation

How to add tests to code-pet — framework choice, test layers, what to test first, and what to skip.

---

## 1. Framework Choice: Node.js Built-in Test Runner (`node:test`)

Node 22 (current environment) has a stable, zero-dependency test runner. This fits the project's
no-external-deps philosophy perfectly.

Provides:
- `node:test` — `describe`, `it`, `before`, `after`, `beforeEach`, `afterEach`
- `node:assert` — `strictEqual`, `deepStrictEqual`, `throws`, `ok`
- `mock.module()` — intercept `require()` calls (essential for mocking `logger`, `electron`, etc.)
- `mock.fn()` — spy/stub functions
- `mock.timers` — fake timers for testing cleanup intervals
- `--test` CLI flag for auto-discovery
- `--test-reporter` for TAP/spec output

**Zero npm installs required.**

---

## 2. Testability Analysis

| Module | Testability | Why | Mocks Needed |
|--------|-------------|-----|--------------|
| **State machine** (all states, PetContext) | EASY | Pure logic, no IO | `logger` (no-op) |
| **events.js, states.js** | EASY | Constants only | None |
| **UsageTracker, UsageEvent** | EASY | Pure data structures | None |
| **PetRegistry** | EASY | Map operations + callbacks | `settings-store` |
| **LicenseAPI (Mock)** | EASY | Pure logic | None |
| **settings-store** | MEDIUM | Filesystem IO | `fs` operations |
| **license-manager** | MEDIUM | Filesystem + API | `fs`, injectable API |
| **bootstrap.js** | MEDIUM | Spawn + filesystem | `fs`, `spawn` |
| **Hook scripts** | EASY (contracts) | stdin JSON → HTTP POST | Test HTTP server |
| **event-server** | MEDIUM-HARD | HTTP + Electron coupling | `electron`, `window-manager` |
| **process-manager** | MEDIUM-HARD | Subprocess + HTTP | `spawn`, `process.kill` |
| **window-manager** | HARD | Deep Electron coupling | Needs full Electron |
| **Renderer** (pet.js, etc.) | HARD | DOM + Electron IPC | Needs jsdom + mocks |
| **terminal-focus** | HARD | macOS-only, AppleScript | `execFile` |

---

## 3. Test Layers

### Layer 1: Unit Tests — Pure Logic

State machine classes, UsageTracker, event constants. Zero IO, zero mocking (except logger).

```
test/unit/
  state-machine/
    pet-context.test.js
    idle-state.test.js
    working-state.test.js
    planning-state.test.js
    waiting-for-action-state.test.js
    active-state.test.js
    state-factory.test.js
    events.test.js
  tracking/
    usage-tracker.test.js
    usage-event.test.js
  pet-registry.test.js
  settings-store.test.js
```

**Key test scenarios:**

State machine:
- Starts in `idle`
- `working_started` → transitions to `working`
- `planning_started` → transitions to `planning`
- `action_requested` → transitions to `waiting_for_action`
- `action_completed` in `waiting_for_action` → restores previous active state
- `action_completed` with `permissionMode='plan'` → goes to `planning`
- `work_finished` → transitions to `idle`, clears `lastActiveEvent`
- `awaken` in `idle` → returns `rendererState: 'waking_up'` (no state change)
- `awaken` in `working` → ignored (suppressed)
- `falling_asleep` in `idle` → removes project
- `falling_asleep` in `working/planning` → ignored
- `dismiss` → removes project (any state)
- Invalid event → returns 400 with valid events list
- Full lifecycle walk: idle → working → waiting → working → idle

PetRegistry:
- `getOrCreate` creates new PetContext, returns same on second call
- `makeSessionKey`/`parseSessionKey` are inverses
- `remove` fires `onProjectRemoved` callback
- `remove` last project fires `onEmpty`
- Two sessions on same project get numbered labels ("MyProject", "MyProject (2)")
- Stale cleanup removes projects older than 30 minutes

UsageTracker:
- `record()` creates event with correct type/name
- `getAggregatedCounts()` returns correct totals
- Eviction at `maxEvents` boundary
- `drain()` returns events and clears state

### Layer 2: Integration Tests — Event Server + Hook Contracts

Combines the event server tests and hook contract tests into a single layer. Both use real HTTP
and test the system at process/network boundaries.

**Event server tests** — real HTTP server on ephemeral port, mocked Electron and window-manager:
- `GET /health` returns 200 when renderer ready, 503 when not
- `POST /event` with `awaken` creates project in registry
- `POST /event` with `working_started` transitions state, sends IPC
- `POST /event` with invalid event returns 400
- `POST /event` → `dismiss` removes project
- `GET /last-event?session=...` returns snapshot
- `POST /shutdown` triggers `app.quit()`
- Full lifecycle: awaken → working → action_requested → action_completed → work_finished → falling_asleep

**Hook contract tests** — run hook scripts as real child processes, test HTTP server records requests:

Pattern:
```
test starts HTTP server on random port
  → sets CODE_PET_PORT=<random>
  → spawns `node hooks/scripts/on-prompt-submit.js`
  → pipes `{"permission_mode":"plan","prompt":"hello"}` to stdin
  → asserts HTTP server received POST /event with event="planning_started"
  → asserts child stdout is "{}"
  → asserts child exit code is 0
```

Key contract tests:
- `on-prompt-submit.js`: plan mode → `planning_started`, normal → `working_started`
- `on-notification.js`: permission_prompt → `action_requested`
- `on-post-tool-use.js`: → `action_completed` with `permissionMode` and `toolName`
- `on-stop.js`: → `work_finished`
- `on-session-end.js`: → `falling_asleep`
- All hooks: malformed stdin → still exits 0 with `{}` on stdout
- All hooks: unreachable server → still exits 0 with `{}` on stdout

### Layer 3: Renderer Tests (Skip for Now)

Requires DOM (jsdom) and mocked Electron IPC. Visual correctness matters less than behavioral
correctness. Add later if needed using Playwright with Electron support.

---

## 4. Directory Structure

```
test/
  helpers/
    mock-logger.js           # No-op logger (info/warn/error are no-ops)
    mock-electron.js         # Stub: app.quit as spy, requestSingleInstanceLock → true
    mock-window-manager.js   # Stub: sendToRenderer captures calls, isRendererReady configurable
    test-http-server.js      # Records incoming requests, exposes getRequests()/reset()/close()
  unit/
  unit/
    state-machine/
      pet-context.test.js
      idle-state.test.js
      working-state.test.js
      planning-state.test.js
      waiting-for-action-state.test.js
      active-state.test.js
      state-factory.test.js
      events.test.js
    tracking/
      usage-tracker.test.js
      usage-event.test.js
    pet-registry.test.js
    settings-store.test.js
  integration/
    event-server.test.js
    hook-prompt-submit.test.js
    hook-notification.test.js
    hook-post-tool-use.test.js
    hook-stop.test.js
    hook-session-end.test.js
```

---

## 5. npm Scripts

```json
{
  "scripts": {
    "test": "node --test test/**/*.test.js",
    "test:unit": "node --test test/unit/**/*.test.js",
    "test:integration": "node --test test/integration/**/*.test.js",
    "test:watch": "node --test --watch test/**/*.test.js"
  }
}
```

---

## 6. Mocking Strategy

The codebase uses CommonJS `require()`. Node's `mock.module()` intercepts requires before loading:

**Logger mock (used everywhere):**
```javascript
const { mock } = require('node:test');
mock.module('../../src/app/logger', {
  namedExports: { info: () => {}, warn: () => {}, error: () => {} }
});
```

**Electron mock (for event-server tests):**
```javascript
mock.module('electron', {
  namedExports: { app: { quit: mock.fn() } }
});
```

**Window-manager mock (for event-server tests):**
```javascript
mock.module('../../src/app/window-manager', {
  namedExports: {
    sendToRenderer: mock.fn(),
    isRendererReady: () => true,
    resizeForPetCount: mock.fn(),
  }
});
```

**Settings-store mock (for PetRegistry tests):**
```javascript
mock.module('../../src/app/settings-store', {
  namedExports: { getPetTypeForProject: () => 'dog' }
});
```

---

## 7. Priority Order

| Priority | What | Layer | Tests | Time | Value |
|----------|------|-------|-------|------|-------|
| **1** | State machine unit tests | Unit | ~20 | 2h | Core behavioral logic, most bug-prone |
| **2** | UsageTracker/UsageEvent | Unit | ~10 | 30m | Pure logic, trivially testable |
| **3** | PetRegistry unit tests | Unit | ~15 | 1h | Session management, label computation |
| **4** | Hook contracts + Event server | Integration | ~22 | 3h | Event names, stdin handling, HTTP routing |
| **5** | Settings-store unit tests | Unit | ~8 | 30m | Simple CRUD, low risk |

**Total: ~75 tests, ~7 hours of work.**

---

## 8. What NOT to Test

- **Renderer** (`pet.js`, `pet-manager.js`, `ipc.js`) — requires DOM + Electron. Visual correctness
  is secondary. Add later with Playwright if needed.
- **`main.js`** — Electron entry point with lifecycle wiring. Needs full Electron process.
- **`window-manager.js`** — deeply coupled to BrowserWindow APIs. Mock at the boundary.
- **`terminal-focus.js`** — macOS-only, AppleScript. System-level, not unit-testable.
- **`bootstrap.js` internals** — spawns `npm install`. Test only the decision logic (ready/not-ready),
  not the actual install.

---

## 9. Decoupling Improvements (Optional, for Better Testability)

These aren't required but would make testing cleaner:

1. **event-server.js** — Inject `app.quit()` and `sendToRenderer()` as callbacks instead of
   importing `electron` and `window-manager` directly. Then the server can be instantiated without
   Electron.

2. **settings-store.js** — Accept a configurable path or provide in-memory mode. Currently
   hardcodes `os.homedir()` paths.

3. **logger.js** — Add a test mode (no-op) or accept a writable stream. Currently always writes
   to `~/.code-pet/code-pet.log`.

---

## 10. Testing Guidelines

### Naming and Structure

- **`sut`** (System Under Test) — always name the object being tested `sut`. Makes it immediately
  clear what's being exercised vs. what's a dependency or helper.
- **`// GIVEN // WHEN // THEN`** — every test body must use these section comments to separate
  setup, action, and assertion. Even one-liner tests benefit from the visual structure.
- **Test names** — describe the behavior, not the method. Use format:
  `"<does something> when <condition>"` or `"<expected outcome> given <setup>"`.

### Test Isolation

- **One assertion concept per test** — a test can have multiple `assert` calls, but they should all
  verify the same logical outcome. If you're asserting two unrelated things, split into two tests.
- **No shared mutable state** — use `beforeEach` to create fresh instances. Never let one test's
  side effects leak into another.
- **Reset mocks** — call `mock.restoreAll()` in `afterEach` if using `mock.fn()` or `mock.method()`.

### Naming Conventions

- Test files: `<module-name>.test.js`
- Describe blocks: use the class/module name — `describe('PetContext', ...)`, `describe('IdleState', ...)`
- Nested describes for grouping: `describe('handleEvent', () => { describe('working_started', ...) })`

### What to Assert

- **State transitions** — assert the new state name, not internal implementation details
- **Return values** — assert `statusCode` and key response fields
- **Side effects** — assert callbacks were called (use `mock.fn()` and check `.mock.calls`)
- **Error cases** — assert 400 status and that state didn't change

### Anti-Patterns to Avoid

- Don't test private methods directly — test through the public API
- Don't assert exact error messages — assert error shape/code
- Don't mock what you own — prefer real instances of your own classes, mock only external
  dependencies (`fs`, `http`, `electron`, `child_process`)
- Don't duplicate the implementation in the test — if your test is a mirror of the source code,
  it's testing nothing

---

## 11. Example Test: PetContext Lifecycle

```javascript
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Mock logger before requiring state machine
mock.module('../../src/app/logger', {
  namedExports: { info: () => {}, warn: () => {}, error: () => {} }
});

const PetContext = require('../../src/app/state-machine/pet-context');

describe('PetContext', () => {
  let sut;

  beforeEach(() => {
    sut = new PetContext('my-project', 'dog');
  });

  it('starts in idle state', () => {
    // GIVEN
    // (fresh instance from beforeEach)

    // WHEN
    const snap = sut.getSnapshot();

    // THEN
    assert.equal(snap.currentState, 'idle');
  });

  it('transitions to working when working_started received', () => {
    // GIVEN
    // sut is in idle state

    // WHEN
    const result = sut.handleEvent('working_started');

    // THEN
    assert.equal(result.statusCode, 200);
    assert.equal(sut.getSnapshot().currentState, 'working');
  });

  it('transitions to waiting_for_action when action_requested during working', () => {
    // GIVEN
    sut.handleEvent('working_started');

    // WHEN
    const result = sut.handleEvent('action_requested');

    // THEN
    assert.equal(result.statusCode, 200);
    assert.equal(sut.getSnapshot().currentState, 'waiting_for_action');
  });

  it('restores previous active state when action_completed', () => {
    // GIVEN
    sut.handleEvent('working_started');
    sut.handleEvent('action_requested');

    // WHEN
    sut.handleEvent('action_completed');

    // THEN
    assert.equal(sut.getSnapshot().currentState, 'working');
  });

  it('returns 400 when event is invalid', () => {
    // GIVEN
    // sut is in idle state

    // WHEN
    const result = sut.handleEvent('invalid_event');

    // THEN
    assert.equal(result.statusCode, 400);
  });

  it('completes full lifecycle: idle → working → waiting → working → idle', () => {
    // GIVEN
    // sut is in idle state

    // WHEN / THEN — walk through lifecycle
    sut.handleEvent('working_started');
    assert.equal(sut.getSnapshot().currentState, 'working');

    sut.handleEvent('action_requested');
    assert.equal(sut.getSnapshot().currentState, 'waiting_for_action');

    sut.handleEvent('action_completed');
    assert.equal(sut.getSnapshot().currentState, 'working');

    sut.handleEvent('work_finished');
    assert.equal(sut.getSnapshot().currentState, 'idle');
  });
});
```

---

## 11. Example Test: Hook Contract

```javascript
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

describe('on-prompt-submit hook', () => {
  let server;
  let port;
  let requests;

  before(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => body += d);
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, body: JSON.parse(body) });
        res.writeHead(200);
        res.end('{}');
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  beforeEach(() => {
    requests = [];
  });

  after(() => server.close());

  function spawnHook(stdinJson) {
    const sut = spawn('node', [
      path.join(__dirname, '../../hooks/scripts/on-prompt-submit.js')
    ], {
      env: { ...process.env, CODE_PET_PORT: String(port) },
    });
    sut.stdin.write(JSON.stringify(stdinJson));
    sut.stdin.end();
    return new Promise((resolve) => sut.on('close', resolve));
  }

  it('sends planning_started when permission_mode is plan', async () => {
    // GIVEN
    const input = { permission_mode: 'plan', prompt: 'hello' };

    // WHEN
    await spawnHook(input);

    // THEN
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.event, 'planning_started');
  });

  it('sends working_started when permission_mode is not plan', async () => {
    // GIVEN
    const input = { permission_mode: 'auto-edit', prompt: 'fix bug' };

    // WHEN
    await spawnHook(input);

    // THEN
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.event, 'working_started');
  });
});
```

---

## Summary

- **Framework:** `node:test` (zero deps, built into Node 22)
- **Two layers:** Unit tests (state machine, registry, tracking) + Integration tests (event server, hook contracts)
- **First priority:** State machine unit tests (core logic, ~20 tests)
- **Second priority:** Integration tests — hook contracts + event server (~22 tests)
- **Skip for now:** Renderer, window-manager, terminal-focus (need Electron/DOM)
- **Total effort:** ~75 tests, ~7 hours
- **No new dependencies required**

# Contributing to Code Pet

Thanks for your interest! Bug reports, small fixes, and improvements to the
core plugin are welcome. **Pet content (new characters, sprites, animations)
is managed by the maintainer** — please don't open PRs for new pets.

## Setup

```bash
git clone https://github.com/mradovic95/code-pet.git
cd code-pet
npm install
npm test
```

## Running locally

```bash
# Start the Electron overlay
npx electron src/app/main.js

# Send a test event to the running pet
curl -s -X POST http://127.0.0.1:31425/event \
  -H "Content-Type: application/json" \
  -d '{"event": "awaken", "project": "/tmp/test"}'
```

## Testing

The project uses Node.js built-in test runner (`node:test`) with zero external test dependencies.

```bash
npm test                # all tests
npm run test:unit       # unit tests only
npm run test:integration # integration tests only
npm run test:watch      # watch mode
```

**Conventions:**
- Name the system under test `sut`
- Use `// GIVEN // WHEN // THEN` section comments
- Test names describe behavior: `"transitions to working when working_started received"`
- Mock only external deps (`logger`, `electron`, `settings-store`)

## Pull requests

- **Small fixes** (typos, minor bugs): open a PR directly.
- **Larger changes** (new features, refactors): [open an issue](https://github.com/mradovic95/code-pet/issues) first so we can discuss the approach.
- All PRs must pass `npm test` and the CI version sync check.
- PRs adding new pet characters will not be accepted.

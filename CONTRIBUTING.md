# Contributing to Code Pet

Code Pet is maintained as a small project. **Bug reports and feature requests** are welcome — please [open an issue](https://github.com/mradovic95/code-pet/issues).

**Code pull requests** are accepted on a case-by-case basis — but please **open an issue first** to discuss the change. Unsolicited PRs (without a prior issue) may be closed without review, to keep the maintainer's queue manageable.

Pet content (new characters, sprites, animations) is managed by the maintainer.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```bash
git clone https://github.com/mradovic95/code-pet.git
cd code-pet
npm install
npm test
```

For an architectural map of the codebase, see [CLAUDE.md](CLAUDE.md).

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

- **Open an issue first.** PRs without a prior issue may be closed without review.
- All PRs must pass `npm test` and the CI version-sync check.
- PRs adding new pet characters will not be accepted.

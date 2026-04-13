# CI, Versioning & Plugin Distribution Investigation

How version updates reach users, what CI to add, and how to prevent bad releases.

---

## 1. How Version Updates Work

### The Version is Everything

Claude Code uses the `version` field in `plugin.json` as the **sole trigger** for updates. Not git tags,
not commit SHAs, not file changes — only the version string.

```
Author bumps version in plugin.json
  → Pushes to GitHub
    → User runs `/plugin marketplace update` (or auto-update fires at startup)
      → Claude Code compares installed version vs remote version
        → If different → re-clones the repo into new cache directory
          → User runs `/reload-plugins` to activate
```

**If you push code without bumping the version, users will NOT get the update.** Claude Code sees the
same version and skips the download.

### Where Version Lives (3 files, must stay in sync)

| File | Field | Current |
|------|-------|---------|
| `package.json` | `version` | `0.1.0` |
| `.claude-plugin/plugin.json` | `version` | `0.1.0` |
| `.claude-plugin/marketplace.json` | `plugins[0].version` | `0.1.0` |

Bump script already exists: `node scripts/bump-version.js 0.2.0`

### Auto-Updates for Users

- **Anthropic marketplaces**: auto-update ON by default
- **Third-party marketplaces** (like yours): auto-update OFF by default
- Auto-updates run at Claude Code startup (background, non-blocking)
- Users can enable auto-update via `/plugin` → Marketplaces tab → toggle

---

## 2. How Users Install the Plugin

```
Step 1: /plugin marketplace add mradovic95/code-pet     # register marketplace
Step 2: /plugin install code-pet                         # install plugin
Step 3: /reset                                           # reload hooks
```

After this:
- First `SessionStart` → `bootstrap.js` runs `npm install` for Electron (~30-120s)
- Second session onward → pet appears instantly

### How Users Update

```
/plugin marketplace update        # fetch latest marketplace.json
/plugin update code-pet           # update plugin if new version available
/reload-plugins                   # activate new version
```

Or if auto-update is enabled, it happens automatically at startup.

---

## 3. Current State

| Item | Status |
|------|--------|
| Version bump script | ✓ `scripts/bump-version.js` |
| CI/CD pipelines | ✗ None |
| Git hooks (pre-push) | ✗ None |
| CHANGELOG | ✗ None |
| GitHub Actions | ✗ None |

---

## 4. Recommended CI Setup

### 4.1. GitHub Actions: Version Sync Check

Block PRs where version files are out of sync.

**`.github/workflows/ci.yml`**:

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Run tests
        run: npm test

      - name: Check version sync
        run: |
          PKG_VER=$(node -p "require('./package.json').version")
          PLUGIN_VER=$(node -p "require('./.claude-plugin/plugin.json').version")
          MARKET_VER=$(node -p "require('./.claude-plugin/marketplace.json').plugins[0].version")

          echo "package.json:     $PKG_VER"
          echo "plugin.json:      $PLUGIN_VER"
          echo "marketplace.json: $MARKET_VER"

          if [ "$PKG_VER" != "$PLUGIN_VER" ] || [ "$PKG_VER" != "$MARKET_VER" ]; then
            echo "::error::Version mismatch! Run: node scripts/bump-version.js $PKG_VER"
            exit 1
          fi
```

### 4.2. GitHub Actions: Release on Tag

Auto-create a GitHub release when you push a version tag.

**`.github/workflows/release.yml`**:

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Run tests
        run: npm test

      - name: Verify tag matches plugin version
        run: |
          TAG_VER="${GITHUB_REF_NAME#v}"
          PLUGIN_VER=$(node -p "require('./.claude-plugin/plugin.json').version")
          if [ "$TAG_VER" != "$PLUGIN_VER" ]; then
            echo "::error::Tag $TAG_VER does not match plugin.json version $PLUGIN_VER"
            exit 1
          fi

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

### 4.3. GitHub Actions: Block Push Without Version Bump

Check if code changed on `main` but version didn't bump compared to previous commit.

**Add to `.github/workflows/ci.yml`**:

```yaml
      - name: Check version bumped (on push to main)
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: |
          CURRENT_VER=$(node -p "require('./.claude-plugin/plugin.json').version")
          git fetch origin main --depth=2
          PREV_VER=$(git show HEAD~1:.claude-plugin/plugin.json 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).version" 2>/dev/null || echo "")

          if [ -z "$PREV_VER" ]; then
            echo "No previous version found, skipping check"
            exit 0
          fi

          if [ "$CURRENT_VER" = "$PREV_VER" ]; then
            echo "::warning::Code pushed to main without version bump ($CURRENT_VER). Users won't receive this update."
          fi
```

---

## 5. Recommended Release Workflow

### For Every Release

```bash
# 1. Bump version across all 3 files
node scripts/bump-version.js 0.2.0

# 2. Commit the version bump
git add package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "release: v0.2.0"

# 3. Tag it
git tag v0.2.0

# 4. Push
git push origin main --tags
```

This triggers:
- CI runs tests + version sync check
- Release workflow creates a GitHub release with auto-generated notes
- Users who run `/plugin marketplace update` get the new version

### Version Numbering Convention

| Change Type | Example | When |
|-------------|---------|------|
| Patch `0.1.x` | `0.1.0` → `0.1.1` | Bug fixes, sprite tweaks |
| Minor `0.x.0` | `0.1.0` → `0.2.0` | New features, new pet types |
| Major `x.0.0` | `0.2.0` → `1.0.0` | Breaking changes, marketplace launch |

---

## 6. Optional: Branch-Based Channels

For stable vs beta distribution, use separate marketplace definitions pointing to different branches:

```
main branch     → stable marketplace (version 0.2.0)
develop branch  → beta marketplace   (version 0.3.0-beta.1)
```

Users choose which to install:
```
/plugin marketplace add mradovic95/code-pet          # stable (main)
/plugin marketplace add mradovic95/code-pet@develop  # beta
```

Not needed now, but useful post-launch.

---

## 7. Summary

| What | How |
|------|-----|
| **Version is the update trigger** | Bump `plugin.json` version or users don't get updates |
| **Bump all 3 files** | `node scripts/bump-version.js <semver>` |
| **CI blocks mismatched versions** | GitHub Action compares all 3 version files |
| **CI blocks tagless releases** | Release workflow verifies tag matches plugin.json |
| **Users install** | `/plugin marketplace add mradovic95/code-pet` → `/plugin install code-pet` |
| **Users update** | `/plugin marketplace update` → `/plugin update code-pet` → `/reload-plugins` |
| **Auto-update** | Off by default for 3rd party; users can enable in plugin settings |

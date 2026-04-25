# README assets

Visual assets referenced by the root `README.md`.

## Generated GIFs (automated)

Per-pet state animations live under `pets/<id>/<state>.gif`:

```
pets/
  dog/
    idle.gif               ← also used as the gallery thumbnail
    working.gif
    planning.gif
    waiting_for_action.gif
    waking_up.gif
  cat/ …
  panda/ …
  dolphin/ …
  bird/ …
```

These are produced by `scripts/generate-readme-gifs.js` directly from each
pet's sprite strips under `assets/pets/<id>/`. Don't edit them by hand —
rerun the script after changing a sprite or manifest.

Premium pets (`panda/`, `dolphin/`) are marketplace-only; their sprite strips
don't live in this repo, so the script can't regenerate their GIFs. The
committed GIFs are rendered out-of-band from the seller-side source sprites
and only updated when those sprites change.

```
node scripts/generate-readme-gifs.js
```

Requires ImageMagick (`brew install imagemagick`).

## Hand-produced assets (still to create)

### `settings-general.png` and `settings-usage.png`

Screenshots of the Settings window, one per visible tab. Referenced from the
root README's "Customize your pet" and "See what you actually use" sections.

- Display width ~480px, capture at 2× retina (actual ~960px wide)
- Trim tightly to the settings window — no desktop background
- PNG, transparent or solid dark background matching the app chrome

**What each must show:**

- `settings-general.png` — **General** tab active. "Your Pets" list with
  multiple pets and one visibly selected (this is the visual answer to
  "how do I change my pet"). Sound toggles and Dismiss button should also
  be in frame.
- `settings-usage.png` — **Usage** tab active, after a short real session so
  the skill / MCP tool list is populated (empty state is unimpressive).

**How to capture:**

1. Run the app (`npx electron src/app/main.js` or via a normal Claude Code session).
2. Double-click the pet overlay to open the Settings window.
3. Use CleanShot / Kap / macOS `Shift+Cmd+4` then `Space` to snap the window.
4. Save into `assets/docs/` with the filenames above (overwrite existing).

The Store tab is hidden behind a feature flag in v1 — do not capture it.

### `hero.mp4` (+ `hero.gif` fallback)

- 10–15 seconds, seamless loop
- Shows a realistic Claude Code session with all four states back-to-back:
  `idle → working → waiting_for_action → work_finished → idle`
- 1200×675 or 1280×720, 16:9
- H.264 baseline codec (Safari-compatible)
- Record the terminal side with [VHS](https://github.com/charmbracelet/vhs)
  or asciinema; capture the pet corner with Kap / CleanShot / QuickTime;
  composite in a simple editor. Alternative: full-screen Kap + crop.

### `social-preview.png`

1280×640 PNG. Shows 2–3 pets + tagline. Upload via GitHub repo
Settings → General → Social preview (not referenced from the README
directly, but lives here for version control).

## Hosting note

GitHub renders `<video>` tags in READMEs if the file is uploaded via the
user-attachments CDN (drag into an issue, copy the URL). Committing the MP4
directly works for smaller files but bloats the repo. For files > 2 MB,
prefer the CDN path and leave this directory for GIFs and PNGs.

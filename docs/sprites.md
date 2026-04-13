# Custom sprites

Each pet has its own directory in `assets/pets/{id}/` with a `manifest.json`
and sprite sheets.

## Sprite sheet format

- Horizontal strip (PNG or SVG)
- Each frame is exactly **64×64px**
- Transparent background
- All strips must be exactly `frameSize × frameCount` pixels wide
  (e.g. 256×64 for 4 frames)
- Frame counts are declared in each pet's `manifest.json`

## Required files

| File | Frames | Description |
|---|---|---|
| `idle.png` | 4 | Default resting animation (loops) |
| `waking_up.png` | 4+ | Session start greeting (plays once) |
| `working.png` | 4 | Processing / working (loops) |
| `planning.png` | 4 | Planning mode (loops) |
| `waiting_for_action.png` | 4 | Waiting for user action (loops) |
| `icon.png` | 1 | 64×64 icon (first frame of idle) |

## Placeholder generator

During development you can regenerate placeholder SVG sprites:

```bash
node scripts/generate-placeholders.js
```

## Adding a new pet

1. Create `assets/pets/<id>/`
2. Add the six sprite files above
3. Add a `manifest.json` declaring frame counts
4. Add a 64×64 `icon.png` cropped from the first frame of `idle.png`

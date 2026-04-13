#!/usr/bin/env node
/**
 * Generate README-ready animated GIFs from sprite strips.
 *
 * Reads every pet manifest under `assets/pets/<id>/manifest.json`, slices each
 * sprite strip into frames, and writes animated GIFs with the correct per-frame
 * delay into `assets/docs/pets/<id>/<state>.gif` — one folder per pet, one
 * GIF per state. The `idle.gif` also serves as the gallery thumbnail in the
 * README (no duplicate file needed).
 *
 * Requires ImageMagick (`magick` on v7, `convert` on v6). On macOS:
 *   brew install imagemagick
 *
 * Usage:
 *   node scripts/generate-readme-gifs.js
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PETS_DIR = path.join(ROOT, 'assets', 'pets');
const OUT_DIR = path.join(ROOT, 'assets', 'docs', 'pets');

function detectImageMagick() {
  for (const bin of ['magick', 'convert']) {
    try {
      execSync(`${bin} -version`, { stdio: 'ignore' });
      return bin;
    } catch {
      // keep trying
    }
  }
  console.error(
    'ImageMagick not found. Install it first:\n' +
    '  macOS:  brew install imagemagick\n' +
    '  Linux:  apt install imagemagick   (or equivalent)\n'
  );
  process.exit(1);
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readManifests() {
  return fs.readdirSync(PETS_DIR)
    .map((id) => path.join(PETS_DIR, id, 'manifest.json'))
    .filter((p) => fs.existsSync(p))
    .map((p) => ({
      dir: path.dirname(p),
      manifest: JSON.parse(fs.readFileSync(p, 'utf8')),
    }));
}

function spriteToGif(bin, spritePath, outPath, frameSize, frames, durationMs) {
  // ImageMagick delay is in centiseconds (1/100s), rounded to nearest.
  const delayCs = Math.max(1, Math.round((durationMs / frames) / 10));
  // `-crop NxM@` splits the image into N×M equal tiles regardless of source
  // dimensions. This is resilient to sprites drawn at non-standard sizes
  // (e.g. the dog's waking_up.png is 749×182 with 4 frames, not 256×64).
  // We then resize every frame to the canonical frameSize.
  //
  // Disposal: `-set dispose Background` clears each frame's pixels to
  // transparent before drawing the next one, preventing ghosting when the
  // pet shifts position between frames on a transparent background.
  //
  // We skip `-layers Optimize`: it rewrites each frame as a minimal
  // bounding-box delta which assumes dispose=None (previous frame stays
  // visible). At 64×64 the full-frame output is still tiny (~10 KB).
  const args = [
    spritePath,
    '-coalesce',
    '-crop', `${frames}x1@`,
    '+repage',
    '-resize', `${frameSize}x${frameSize}`,
    '-set', 'dispose', 'Background',
    '-set', 'delay', String(delayCs),
    '-loop', '0',
    outPath,
  ];
  execFileSync(bin, args, { stdio: 'inherit' });
}

function main() {
  const bin = detectImageMagick();
  mkdirp(OUT_DIR);

  const manifests = readManifests();
  if (manifests.length === 0) {
    console.error(`No manifests found under ${PETS_DIR}`);
    process.exit(1);
  }

  let generated = 0;
  let skipped = 0;

  for (const { dir, manifest } of manifests) {
    const { id, frameSize = 64, sprites = {} } = manifest;
    const petOutDir = path.join(OUT_DIR, id);
    mkdirp(petOutDir);

    for (const [stateName, def] of Object.entries(sprites)) {
      const spritePath = path.join(dir, def.file);
      if (!fs.existsSync(spritePath)) {
        console.warn(`  [skip] ${id}/${stateName}: ${def.file} not found`);
        skipped++;
        continue;
      }
      const outPath = path.join(petOutDir, `${stateName}.gif`);
      console.log(`  [${id}] ${stateName} → ${path.relative(ROOT, outPath)}`);
      spriteToGif(bin, spritePath, outPath, frameSize, def.frames, def.duration);
      generated++;
    }
  }

  console.log(`\nDone. Generated ${generated} GIFs (${skipped} skipped).`);
  console.log(`  Output: ${path.relative(ROOT, OUT_DIR)}`);
}

main();

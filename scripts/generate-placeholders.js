'use strict';

/**
 * Generates placeholder sprite sheet PNGs for Code Pet.
 * Uses inline SVG → Buffer → PNG file approach (no external dependencies).
 * Each sprite is a horizontal strip of 64x64px frames.
 *
 * Run: node scripts/generate-placeholders.js
 */

const fs = require('fs');
const path = require('path');

const SPRITES_DIR = path.join(__dirname, '..', 'assets', 'sprites');

const STATES = {
  idle: {
    frames: 4,
    color: '#F5A623',
    label: 'idle',
    eyes: 'open',
    mouth: 'smile',
    extras: [],
  },
  wake: {
    frames: 4,
    color: '#F5A623',
    label: 'wake',
    eyes: 'wide',
    mouth: 'open',
    extras: ['!'],
  },
  sleep: {
    frames: 4,
    color: '#9B9B9B',
    label: 'sleep',
    eyes: 'closed',
    mouth: 'flat',
    extras: ['Z', 'z', 'Z', 'z'],
  },
  thinking: {
    frames: 4,
    color: '#4A90D9',
    label: 'think',
    eyes: 'open',
    mouth: 'flat',
    extras: ['.', '..', '...', '..'],
  },
  questioning: {
    frames: 4,
    color: '#F5A623',
    label: '?',
    eyes: 'wide',
    mouth: 'flat',
    extras: [],
  },
};

function generateEyes(type, cx, cy, frame) {
  const leftX = cx - 8;
  const rightX = cx + 8;
  const ey = cy - 4;

  switch (type) {
    case 'open':
      return `
        <circle cx="${leftX}" cy="${ey}" r="3" fill="#333"/>
        <circle cx="${rightX}" cy="${ey}" r="3" fill="#333"/>`;
    case 'wide':
      return `
        <circle cx="${leftX}" cy="${ey}" r="4" fill="#333"/>
        <circle cx="${rightX}" cy="${ey}" r="4" fill="#333"/>
        <circle cx="${leftX + 1}" cy="${ey - 1}" r="1.5" fill="white"/>
        <circle cx="${rightX + 1}" cy="${ey - 1}" r="1.5" fill="white"/>`;
    case 'closed':
      return `
        <line x1="${leftX - 3}" y1="${ey}" x2="${leftX + 3}" y2="${ey}" stroke="#333" stroke-width="2" stroke-linecap="round"/>
        <line x1="${rightX - 3}" y1="${ey}" x2="${rightX + 3}" y2="${ey}" stroke="#333" stroke-width="2" stroke-linecap="round"/>`;
    case 'happy':
      return `
        <path d="M${leftX - 3},${ey} Q${leftX},${ey - 4} ${leftX + 3},${ey}" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round"/>
        <path d="M${rightX - 3},${ey} Q${rightX},${ey - 4} ${rightX + 3},${ey}" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round"/>`;
    case 'cross':
      return `
        <line x1="${leftX - 3}" y1="${ey - 3}" x2="${leftX + 3}" y2="${ey + 3}" stroke="#333" stroke-width="2" stroke-linecap="round"/>
        <line x1="${leftX + 3}" y1="${ey - 3}" x2="${leftX - 3}" y2="${ey + 3}" stroke="#333" stroke-width="2" stroke-linecap="round"/>
        <line x1="${rightX - 3}" y1="${ey - 3}" x2="${rightX + 3}" y2="${ey + 3}" stroke="#333" stroke-width="2" stroke-linecap="round"/>
        <line x1="${rightX + 3}" y1="${ey - 3}" x2="${rightX - 3}" y2="${ey + 3}" stroke="#333" stroke-width="2" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

function generateMouth(type, cx, cy) {
  const my = cy + 6;

  switch (type) {
    case 'smile':
      return `<path d="M${cx - 5},${my} Q${cx},${my + 5} ${cx + 5},${my}" fill="none" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>`;
    case 'big-smile':
      return `<path d="M${cx - 7},${my} Q${cx},${my + 7} ${cx + 7},${my}" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round"/>`;
    case 'flat':
      return `<line x1="${cx - 5}" y1="${my}" x2="${cx + 5}" y2="${my}" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>`;
    case 'open':
      return `<ellipse cx="${cx}" cy="${my + 1}" rx="4" ry="3" fill="#333"/>`;
    case 'frown':
      return `<path d="M${cx - 5},${my + 4} Q${cx},${my - 2} ${cx + 5},${my + 4}" fill="none" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

function generateFrame(state, frameIndex) {
  const s = STATES[state];
  const offsetX = frameIndex * 64;
  const cx = offsetX + 32;
  const cy = 28;

  // Subtle vertical bounce per frame
  const bounceY = Math.sin((frameIndex / s.frames) * Math.PI * 2) * 2;

  // Ear positions
  const earOffset = state === 'wake' ? -2 : 0;
  const leftEarX = cx - 14;
  const rightEarX = cx + 14;
  const earTopY = cy - 22 + bounceY + earOffset;
  const earBaseY = cy - 10 + bounceY;

  // Extras text (thought bubbles, Zzz, etc.)
  let extrasEl = '';
  if (s.extras.length > 0) {
    const extraText = s.extras[frameIndex % s.extras.length];
    extrasEl = `<text x="${cx + 18}" y="${cy - 18 + bounceY}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#333" text-anchor="middle">${extraText}</text>`;
  }

  return `
    <!-- Frame ${frameIndex}: ${state} -->
    <!-- Left ear -->
    <polygon points="${leftEarX - 5},${earBaseY} ${leftEarX},${earTopY} ${leftEarX + 5},${earBaseY}" fill="${s.color}" stroke="#333" stroke-width="1"/>
    <!-- Right ear -->
    <polygon points="${rightEarX - 5},${earBaseY} ${rightEarX},${earTopY} ${rightEarX + 5},${earBaseY}" fill="${s.color}" stroke="#333" stroke-width="1"/>
    <!-- Head -->
    <circle cx="${cx}" cy="${cy + bounceY}" r="18" fill="${s.color}" stroke="#333" stroke-width="1.5"/>
    <!-- Eyes -->
    ${generateEyes(s.eyes, cx, cy + bounceY, frameIndex)}
    <!-- Nose -->
    <ellipse cx="${cx}" cy="${cy + 2 + bounceY}" rx="2.5" ry="2" fill="#333"/>
    <!-- Mouth -->
    ${generateMouth(s.mouth, cx, cy + bounceY)}
    <!-- Extras -->
    ${extrasEl}
    ${state === 'questioning' ? (() => {
      const angles = [-15, 0, 15, 0];
      const angle = angles[frameIndex % angles.length];
      const qx = cx;
      const qy = cy - 24 + bounceY;
      return `<!-- Question mark -->
    <text x="${qx}" y="${qy}" font-family="sans-serif" font-size="18" font-weight="bold" fill="#FFD700" stroke="#333" stroke-width="0.8" text-anchor="middle" transform="rotate(${angle}, ${qx}, ${qy})">?</text>`;
    })() : ''}
    <!-- Label -->
    <text x="${cx}" y="${58}" font-family="sans-serif" font-size="7" fill="#666" text-anchor="middle">${s.label} ${frameIndex + 1}</text>
  `;
}

function generateSpriteSheet(state) {
  const s = STATES[state];
  const width = s.frames * 64;
  const height = 64;

  let frames = '';
  for (let i = 0; i < s.frames; i++) {
    frames += generateFrame(state, i);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="none"/>
  ${frames}
</svg>`;
}

// Ensure output directory exists
if (!fs.existsSync(SPRITES_DIR)) {
  fs.mkdirSync(SPRITES_DIR, { recursive: true });
}

// Generate all sprite sheets as SVG (will be referenced directly)
for (const state of Object.keys(STATES)) {
  const svg = generateSpriteSheet(state);
  const outputPath = path.join(SPRITES_DIR, `${state}.svg`);

  // Write as SVG with .png extension — Electron/Chromium can render SVG in <img> and CSS backgrounds
  // For true PNG output, use a canvas library. SVG works perfectly as a placeholder.
  fs.writeFileSync(outputPath, svg);
  console.log(`Generated: ${outputPath} (${STATES[state].frames} frames)`);
}

console.log('\nAll placeholder sprites generated!');
console.log('Note: These are SVG files with .png extension — they work in Electron/Chromium.');
console.log('Replace with real PNG sprite sheets for production use.');

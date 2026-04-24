'use strict';

/**
 * Generates placeholder sprite sheets for Code Pet.
 * Each sprite is a horizontal SVG strip of 64x64px frames.
 *
 * Usage:
 *   node scripts/generate-placeholders.js          # generates dog (default)
 *   node scripts/generate-placeholders.js dog       # generates dog
 *   node scripts/generate-placeholders.js cat       # generates cat
 *   node scripts/generate-placeholders.js bird      # generates bird
 *   node scripts/generate-placeholders.js all       # generates all pets
 */

const fs = require('fs');
const path = require('path');

const PETS_DIR = path.join(__dirname, '..', 'assets', 'pets');

const PET_CONFIGS = {
  dog: {
    name: 'Dog',
    description: 'A loyal coding companion',
    tier: 'free',
    colors: {
      idle: '#F5A623',
      waking_up: '#F5A623',
      working: '#4A90D9',
      planning: '#9B59B6',
      waiting_for_action: '#F39C12',
    },
    earShape: 'floppy', // triangular dog ears
  },
  cat: {
    name: 'Cat',
    description: 'A curious coding cat',
    tier: 'free',
    colors: {
      idle: '#7BC67E',
      waking_up: '#7BC67E',
      working: '#4ECDC4',
      planning: '#A78BFA',
      waiting_for_action: '#FBBF24',
    },
    earShape: 'pointy', // pointy cat ears
  },
  bird: {
    name: 'Bird',
    description: 'A swift coding bird',
    tier: 'free',
    colors: {
      idle: '#60A5FA',
      waking_up: '#60A5FA',
      working: '#38BDF8',
      planning: '#C084FC',
      waiting_for_action: '#FB923C',
    },
    earShape: 'wing', // small wing shapes on sides
  },
};

const STATES = {
  idle: {
    frames: 4,
    duration: 1600,
    loop: true,
    label: 'idle',
    eyes: 'open',
    mouth: 'smile',
    extras: [],
  },
  waking_up: {
    frames: 20,
    duration: 4000,
    loop: false,
    label: 'wake',
    eyes: 'wide',
    mouth: 'open',
    extras: ['!', '!!', '!', '!!', '!', '!!', '!', '!!', '!', '!!', '!', '!!', '!', '!!', '!', '!!', '!', '!!', '!', '!!'],
  },
  working: {
    frames: 4,
    duration: 1200,
    loop: true,
    label: 'work',
    eyes: 'open',
    mouth: 'flat',
    extras: ['.', '..', '...', '..'],
  },
  planning: {
    frames: 4,
    duration: 1200,
    loop: true,
    label: 'plan',
    eyes: 'open',
    mouth: 'flat',
    extras: ['1.', '2.', '3.', '..'],
  },
  waiting_for_action: {
    frames: 4,
    duration: 1600,
    loop: true,
    label: 'wait',
    eyes: 'wide',
    mouth: 'flat',
    extras: ['...', '..', '...', '..'],
  },
};

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateEyes(type, cx, cy) {
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

function generateEars(earShape, cx, cy, bounceY, color, state) {
  const leftEarX = cx - 14;
  const rightEarX = cx + 14;
  const earOffset = state === 'waking_up' ? -2 : 0;

  if (earShape === 'horn') {
    // Dragon horns — curved spiky horns
    const hornTopY = cy - 26 + bounceY + earOffset;
    const hornBaseY = cy - 12 + bounceY;
    return `
    <polygon points="${leftEarX - 4},${hornBaseY} ${leftEarX - 1},${hornTopY} ${leftEarX + 4},${hornBaseY}" fill="#C0392B" stroke="#333" stroke-width="1"/>
    <polygon points="${leftEarX - 2},${hornBaseY - 1} ${leftEarX - 1},${hornTopY + 3} ${leftEarX + 2},${hornBaseY - 1}" fill="#E74C3C" stroke="none"/>
    <polygon points="${rightEarX - 4},${hornBaseY} ${rightEarX + 1},${hornTopY} ${rightEarX + 4},${hornBaseY}" fill="#C0392B" stroke="#333" stroke-width="1"/>
    <polygon points="${rightEarX - 2},${hornBaseY - 1} ${rightEarX + 1},${hornTopY + 3} ${rightEarX + 2},${hornBaseY - 1}" fill="#E74C3C" stroke="none"/>`;
  }

  if (earShape === 'round') {
    // Round panda ears — circular black ears
    const earY = cy - 16 + bounceY + earOffset;
    return `
    <circle cx="${leftEarX}" cy="${earY}" r="7" fill="#333" stroke="#222" stroke-width="1"/>
    <circle cx="${rightEarX}" cy="${earY}" r="7" fill="#333" stroke="#222" stroke-width="1"/>`;
  }

  if (earShape === 'wing') {
    // Small wing shapes on the sides of the head
    const wingY = cy - 2 + bounceY + earOffset;
    const wingSpread = state === 'working' || state === 'waking_up' ? 4 : 2;
    return `
    <path d="M${leftEarX + 2},${wingY} Q${leftEarX - 8},${wingY - wingSpread} ${leftEarX - 6},${wingY + 8}" fill="${color}" stroke="#333" stroke-width="1" fill-opacity="0.8"/>
    <path d="M${leftEarX + 2},${wingY + 2} Q${leftEarX - 5},${wingY - wingSpread + 2} ${leftEarX - 3},${wingY + 7}" fill="white" stroke="none" fill-opacity="0.3"/>
    <path d="M${rightEarX - 2},${wingY} Q${rightEarX + 8},${wingY - wingSpread} ${rightEarX + 6},${wingY + 8}" fill="${color}" stroke="#333" stroke-width="1" fill-opacity="0.8"/>
    <path d="M${rightEarX - 2},${wingY + 2} Q${rightEarX + 5},${wingY - wingSpread + 2} ${rightEarX + 3},${wingY + 7}" fill="white" stroke="none" fill-opacity="0.3"/>`;
  }

  if (earShape === 'pointy') {
    // Pointy cat ears — taller and sharper
    const earTopY = cy - 24 + bounceY + earOffset;
    const earBaseY = cy - 10 + bounceY;
    return `
    <polygon points="${leftEarX - 6},${earBaseY} ${leftEarX},${earTopY} ${leftEarX + 6},${earBaseY}" fill="${color}" stroke="#333" stroke-width="1"/>
    <polygon points="${leftEarX - 3},${earBaseY - 1} ${leftEarX},${earTopY + 4} ${leftEarX + 3},${earBaseY - 1}" fill="#FFB6C1" stroke="none"/>
    <polygon points="${rightEarX - 6},${earBaseY} ${rightEarX},${earTopY} ${rightEarX + 6},${earBaseY}" fill="${color}" stroke="#333" stroke-width="1"/>
    <polygon points="${rightEarX - 3},${earBaseY - 1} ${rightEarX},${earTopY + 4} ${rightEarX + 3},${earBaseY - 1}" fill="#FFB6C1" stroke="none"/>`;
  }

  // Default floppy dog ears
  const earTopY = cy - 22 + bounceY + earOffset;
  const earBaseY = cy - 10 + bounceY;
  return `
    <polygon points="${leftEarX - 5},${earBaseY} ${leftEarX},${earTopY} ${leftEarX + 5},${earBaseY}" fill="${color}" stroke="#333" stroke-width="1"/>
    <polygon points="${rightEarX - 5},${earBaseY} ${rightEarX},${earTopY} ${rightEarX + 5},${earBaseY}" fill="${color}" stroke="#333" stroke-width="1"/>`;
}

function generateFrame(state, frameIndex, petConfig) {
  const s = STATES[state];
  const color = petConfig.colors[state];
  const offsetX = frameIndex * 64;
  const cx = offsetX + 32;
  const cy = 28;

  // Subtle vertical bounce per frame
  const bounceY = Math.sin((frameIndex / s.frames) * Math.PI * 2) * 2;

  // Extras text
  let extrasEl = '';
  if (s.extras.length > 0) {
    const extraText = s.extras[frameIndex % s.extras.length];
    extrasEl = `<text x="${cx + 18}" y="${cy - 18 + bounceY}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#333" text-anchor="middle">${escapeXml(extraText)}</text>`;
  }

  return `
    <!-- Frame ${frameIndex}: ${state} -->
    ${generateEars(petConfig.earShape, cx, cy, bounceY, color, state)}
    <!-- Head -->
    <circle cx="${cx}" cy="${cy + bounceY}" r="18" fill="${color}" stroke="#333" stroke-width="1.5"/>
    <!-- Eyes -->
    ${generateEyes(s.eyes, cx, cy + bounceY)}
    <!-- Nose -->
    <ellipse cx="${cx}" cy="${cy + 2 + bounceY}" rx="2.5" ry="2" fill="#333"/>
    <!-- Mouth -->
    ${generateMouth(s.mouth, cx, cy + bounceY)}
    <!-- Extras -->
    ${extrasEl}
    <!-- Label -->
    <text x="${cx}" y="${58}" font-family="sans-serif" font-size="7" fill="#666" text-anchor="middle">${s.label} ${frameIndex + 1}</text>
  `;
}

function generateSpriteSheet(state, petConfig) {
  const s = STATES[state];
  const width = s.frames * 64;
  const height = 64;

  let frames = '';
  for (let i = 0; i < s.frames; i++) {
    frames += generateFrame(state, i, petConfig);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="none"/>
  ${frames}
</svg>`;
}

function generatePet(petId) {
  const petConfig = PET_CONFIGS[petId];
  if (!petConfig) {
    console.error(`Unknown pet: "${petId}". Available: ${Object.keys(PET_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  const petDir = path.join(PETS_DIR, petId);
  if (!fs.existsSync(petDir)) {
    fs.mkdirSync(petDir, { recursive: true });
  }

  // Generate sprite sheets
  for (const state of Object.keys(STATES)) {
    const svg = generateSpriteSheet(state, petConfig);
    const outputPath = path.join(petDir, `${state}.svg`);
    fs.writeFileSync(outputPath, svg);
    console.log(`Generated: ${outputPath} (${STATES[state].frames} frames)`);
  }

  // Generate manifest.json
  const manifest = {
    id: petId,
    name: petConfig.name,
    description: petConfig.description,
    tier: petConfig.tier || 'free',
    sprites: {},
    autoTransitions: { waking_up: { next: 'idle', delay: 4000 } },
    frameSize: 64,
  };

  for (const [state, config] of Object.entries(STATES)) {
    manifest.sprites[state] = {
      file: `${state}.svg`,
      frames: config.frames,
      duration: config.duration,
      loop: config.loop,
    };
  }

  const manifestPath = path.join(petDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Generated: ${manifestPath}`);
}

// CLI
const arg = process.argv[2] || 'dog';

if (arg === 'all') {
  for (const petId of Object.keys(PET_CONFIGS)) {
    console.log(`\n--- Generating ${petId} ---`);
    generatePet(petId);
  }
} else {
  generatePet(arg);
}

console.log('\nDone! SVG sprites work in Electron/Chromium.');

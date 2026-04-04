'use strict';

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/bump-version.js <semver>');
  console.error('Example: node scripts/bump-version.js 0.2.0');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const files = [
  { path: 'package.json', update: (j) => { j.version = version; } },
  { path: '.claude-plugin/plugin.json', update: (j) => { j.version = version; } },
  { path: '.claude-plugin/marketplace.json', update: (j) => { j.plugins[0].version = version; } },
];

for (const f of files) {
  const fp = path.join(root, f.path);
  const json = JSON.parse(fs.readFileSync(fp, 'utf8'));
  f.update(json);
  fs.writeFileSync(fp, JSON.stringify(json, null, '\t') + '\n');
  console.log(`Updated ${f.path} → ${version}`);
}

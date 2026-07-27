'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const arg = process.argv[2];

if (!arg) {
  console.error('Usage: node scripts/bump-version.js <patch|minor|major|semver>');
  console.error('Examples:');
  console.error('  node scripts/bump-version.js patch   # 0.1.0 → 0.1.1');
  console.error('  node scripts/bump-version.js minor   # 0.1.0 → 0.2.0');
  console.error('  node scripts/bump-version.js major   # 0.1.0 → 1.0.0');
  console.error('  node scripts/bump-version.js 0.2.0   # explicit version');
  process.exit(1);
}

function resolveVersion(input) {
  if (/^\d+\.\d+\.\d+$/.test(input)) return input;

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const parts = pkg.version.split('.').map(Number);

  switch (input) {
    case 'patch': parts[2]++; break;
    case 'minor': parts[1]++; parts[2] = 0; break;
    case 'major': parts[0]++; parts[1] = 0; parts[2] = 0; break;
    default:
      console.error(`Invalid argument: ${input}`);
      console.error('Expected: patch, minor, major, or exact semver (e.g. 0.2.0)');
      process.exit(1);
  }

  return parts.join('.');
}

const version = resolveVersion(arg);

const files = [
  { path: 'package.json', update: (j) => { j.version = version; } },
  // npm rewrites both of these from package.json on any install, so bump them
  // here too — otherwise the lockfile drifts until someone's unrelated
  // `npm install` corrects it and shows up as a stray diff in their branch.
  { path: 'package-lock.json', update: (j) => { j.version = version; j.packages[''].version = version; } },
  { path: '.claude-plugin/plugin.json', update: (j) => { j.version = version; } },
  { path: '.claude-plugin/marketplace.json', update: (j) => { j.plugins[0].version = version; } },
];

for (const f of files) {
  const fp = path.join(root, f.path);
  const json = JSON.parse(fs.readFileSync(fp, 'utf8'));
  f.update(json);
  fs.writeFileSync(fp, JSON.stringify(json, null, '\t') + '\n');
  console.error(`Updated ${f.path} → ${version}`);
}

// Output version to stdout (used by CI to capture the value)
process.stdout.write(version);

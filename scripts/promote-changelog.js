'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const version = process.argv[2];

if (!version) {
  console.error('Usage: node scripts/promote-changelog.js <version>');
  console.error('Example: node scripts/promote-changelog.js 0.2.0');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version: ${version}`);
  console.error('Expected exact semver (e.g. 0.2.0)');
  process.exit(1);
}

const changelogPath = path.join(root, 'CHANGELOG.md');
const original = fs.readFileSync(changelogPath, 'utf8');

const unreleasedHeading = '## [Unreleased]';
const unreleasedIdx = original.indexOf(unreleasedHeading);

if (unreleasedIdx === -1) {
  console.error('Could not find "## [Unreleased]" heading in CHANGELOG.md');
  process.exit(1);
}

const afterHeading = unreleasedIdx + unreleasedHeading.length;
const nextHeadingMatch = original.slice(afterHeading).match(/\n## \[/);
const nextHeadingIdx = nextHeadingMatch
  ? afterHeading + nextHeadingMatch.index
  : original.length;

const unreleasedBody = original.slice(afterHeading, nextHeadingIdx);
if (!/-\s+\S/.test(unreleasedBody)) {
  console.error('CHANGELOG.md [Unreleased] section is empty — nothing to promote.');
  console.error('Add entries under [Unreleased] before releasing.');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const replacement = `## [Unreleased]\n\n## [${version}] - ${date}`;
const updated = original.slice(0, unreleasedIdx) + replacement + original.slice(afterHeading);

fs.writeFileSync(changelogPath, updated);
console.error(`Promoted CHANGELOG.md [Unreleased] → [${version}] - ${date}`);

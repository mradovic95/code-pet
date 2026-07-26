'use strict';

const { setupMocks } = require('../../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileURLToPath } = require('url');

const PetCatalog = require('../../../src/app/pet/pet-catalog');

const REQUIRED_STATES = ['idle', 'waking_up', 'working', 'planning', 'waiting_for_action'];

function writePet(rootDir, id, overrides = {}) {
  const petDir = path.join(rootDir, id);
  fs.mkdirSync(petDir, { recursive: true });
  const sprites = {};
  for (const state of REQUIRED_STATES) {
    const file = `${state}.png`;
    sprites[state] = { file, frames: 4, duration: 1000, loop: true };
    fs.writeFileSync(path.join(petDir, file), 'fake-sprite');
  }
  const manifest = {
    id,
    name: id,
    description: `${id} test pet`,
    tier: 'free',
    sprites,
    ...overrides,
  };
  fs.writeFileSync(path.join(petDir, 'manifest.json'), JSON.stringify(manifest));
  return petDir;
}

describe('PetCatalog', () => {
  let tmpRoot;
  let rootA;
  let rootB;
  let sut;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-catalog-test-'));
    rootA = path.join(tmpRoot, 'a');
    rootB = path.join(tmpRoot, 'b');
    fs.mkdirSync(rootA);
    fs.mkdirSync(rootB);
    sut = new PetCatalog();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('scan', () => {
    it('loads pets from a single root', () => {
      // GIVEN a root with one pet
      writePet(rootA, 'dog');

      // WHEN scanning
      sut.scan(rootA);

      // THEN pet is loaded
      assert.equal(sut.has('dog'), true);
      assert.equal(sut.get('dog').id, 'dog');
    });

    it('composes pets across two roots', () => {
      // GIVEN two roots with distinct pets
      writePet(rootA, 'dog');
      writePet(rootB, 'panda');

      // WHEN scanning both
      sut.scan(rootA);
      sut.scan(rootB);

      // THEN both pets are loaded
      assert.equal(sut.has('dog'), true);
      assert.equal(sut.has('panda'), true);
    });

    it('later root overlays earlier on id collision', () => {
      // GIVEN two roots with a pet sharing the same id but different _dir
      writePet(rootA, 'dog', { name: 'ShippedDog' });
      writePet(rootB, 'dog', { name: 'MarketplaceDog' });

      // WHEN scanning both in order (shipped first, marketplace second)
      sut.scan(rootA);
      sut.scan(rootB);

      // THEN later root wins
      const dog = sut.get('dog');
      assert.equal(dog.name, 'MarketplaceDog');
      assert.equal(dog._dir, path.join(rootB, 'dog'));
    });

    it('stamps absolute _dir on the manifest', () => {
      // GIVEN a pet on disk
      writePet(rootA, 'cat');

      // WHEN scanning
      sut.scan(rootA);

      // THEN _dir is the pet's directory
      assert.equal(sut.get('cat')._dir, path.join(rootA, 'cat'));
    });

    it('stamps a platform-correct _dirUrl that round-trips to _dir', () => {
      // GIVEN a pet on disk
      writePet(rootA, 'cat');

      // WHEN scanning
      sut.scan(rootA);

      // THEN _dirUrl is a file:// URL that decodes back to _dir on every platform
      const cat = sut.get('cat');
      assert.ok(cat._dirUrl.startsWith('file://'), `expected file:// URL, got ${cat._dirUrl}`);
      assert.equal(fileURLToPath(cat._dirUrl), cat._dir);
    });

    it('exposes _dirUrl on list() output', () => {
      // GIVEN a pet on disk
      writePet(rootA, 'cat');
      sut.scan(rootA);

      // WHEN listing the catalog (what the renderer receives)
      const listed = sut.list();

      // THEN every entry carries _dirUrl
      assert.equal(listed.length, 1);
      assert.ok(listed[0]._dirUrl.startsWith('file://'));
      assert.equal(fileURLToPath(listed[0]._dirUrl), listed[0]._dir);
    });

    it('tolerates missing directories', () => {
      // GIVEN a root that does not exist
      const missingRoot = path.join(tmpRoot, 'does-not-exist');

      // WHEN scanning
      sut.scan(missingRoot);

      // THEN no error, no pets loaded
      assert.deepEqual(sut.list(), []);
    });
  });

  describe('rescan', () => {
    it('re-runs all previously scanned roots in order', () => {
      // GIVEN the catalog has scanned two roots
      writePet(rootA, 'dog');
      writePet(rootB, 'panda');
      sut.scan(rootA);
      sut.scan(rootB);

      // WHEN a new pet is added to rootB and rescan is called
      writePet(rootB, 'dolphin');
      sut.rescan();

      // THEN old pets are still present and the new pet appears
      assert.equal(sut.has('dog'), true);
      assert.equal(sut.has('panda'), true);
      assert.equal(sut.has('dolphin'), true);
    });

    it('clears pets that were removed from disk', () => {
      // GIVEN a catalog with a pet
      writePet(rootA, 'dog');
      sut.scan(rootA);
      assert.equal(sut.has('dog'), true);

      // WHEN the pet is deleted and rescan is called
      fs.rmSync(path.join(rootA, 'dog'), { recursive: true });
      sut.rescan();

      // THEN the pet is gone
      assert.equal(sut.has('dog'), false);
    });

    it('does not duplicate entries when scan is called twice on the same root', () => {
      // GIVEN two scans of the same root
      writePet(rootA, 'dog');
      sut.scan(rootA);
      sut.scan(rootA);

      // WHEN a new pet appears on disk and rescan runs
      writePet(rootA, 'cat');
      sut.rescan();

      // THEN both pets are present exactly once
      const ids = sut.list().map(p => p.id).sort();
      assert.deepEqual(ids, ['cat', 'dog']);
    });
  });
});

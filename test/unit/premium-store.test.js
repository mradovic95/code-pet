'use strict';

const { setupMocks } = require('../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PremiumStore = require('../../src/app/premium-store');

function makeFakeApi({ manifestSprites, withIcon = true } = {}) {
  const sprites = manifestSprites || {
    idle: { file: 'idle.png', frames: 4, duration: 1000, loop: true },
  };
  const manifest = { id: 'panda', name: 'Panda', sprites };
  if (withIcon) manifest.icon = 'icon.png';
  const assetsServed = [];
  return {
    assetsServed,
    downloadAsset: async (_productId, filename) => {
      assetsServed.push(filename);
      if (filename === 'manifest.json') {
        return Buffer.from(JSON.stringify(manifest), 'utf8');
      }
      if (!withIcon && filename === 'icon.png') {
        throw new Error('no icon');
      }
      return Buffer.from(`bytes:${filename}`, 'utf8');
    },
  };
}

describe('PremiumStore', () => {
  let tmpBase;
  let sut;

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'premium-store-test-'));
    sut = new PremiumStore(tmpBase);
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('throws when baseDir is missing', () => {
      // GIVEN no baseDir
      // WHEN constructing
      // THEN it throws
      assert.throws(() => new PremiumStore(), /requires a baseDir/);
    });

    it('creates the baseDir if it does not exist', () => {
      // GIVEN a baseDir path that does not exist
      const nested = path.join(tmpBase, 'nested', 'pets');

      // WHEN constructing
      new PremiumStore(nested);

      // THEN the directory is created
      assert.equal(fs.existsSync(nested), true);
    });
  });

  describe('download', () => {
    it('rejects without a real api + productId', async () => {
      // GIVEN no api
      // WHEN downloading
      // THEN it rejects
      await assert.rejects(
        () => sut.download('panda', 'key', null, null),
        /marketplace API and productId are required/,
      );
    });

    it('writes manifest + sprite files into baseDir/{petId}/', async () => {
      // GIVEN a fake api
      const api = makeFakeApi();

      // WHEN downloading
      await sut.download('panda', 'LIC-1', api, 10);

      // THEN the pet folder is under baseDir
      const petDir = path.join(tmpBase, 'panda');
      assert.equal(fs.existsSync(path.join(petDir, 'manifest.json')), true);
      assert.equal(fs.existsSync(path.join(petDir, 'idle.png')), true);
      assert.equal(fs.existsSync(path.join(petDir, 'icon.png')), true);
    });

    it('warns but succeeds when icon download fails', async () => {
      // GIVEN an api that 404s on icon
      const api = makeFakeApi({ withIcon: false });

      // WHEN downloading
      await sut.download('panda', 'LIC-1', api, 10);

      // THEN the pet folder has manifest and sprites but no icon
      const petDir = path.join(tmpBase, 'panda');
      assert.equal(fs.existsSync(path.join(petDir, 'manifest.json')), true);
      assert.equal(fs.existsSync(path.join(petDir, 'idle.png')), true);
      assert.equal(fs.existsSync(path.join(petDir, 'icon.png')), false);
    });
  });

  describe('isDownloaded', () => {
    it('returns true only when manifest.json exists under baseDir/{petId}/', () => {
      // GIVEN no pet on disk
      // THEN false
      assert.equal(sut.isDownloaded('panda'), false);

      // WHEN the manifest exists
      const petDir = path.join(tmpBase, 'panda');
      fs.mkdirSync(petDir);
      fs.writeFileSync(path.join(petDir, 'manifest.json'), '{}');

      // THEN true
      assert.equal(sut.isDownloaded('panda'), true);
    });
  });

  describe('remove', () => {
    it('deletes the pet folder under baseDir', () => {
      // GIVEN a pet on disk
      const petDir = path.join(tmpBase, 'panda');
      fs.mkdirSync(petDir);
      fs.writeFileSync(path.join(petDir, 'manifest.json'), '{}');

      // WHEN removing
      sut.remove('panda');

      // THEN the folder is gone
      assert.equal(fs.existsSync(petDir), false);
    });
  });

  describe('getBaseDir', () => {
    it('returns the configured base directory', () => {
      // GIVEN a store
      // WHEN asking for the base dir
      // THEN it matches what was passed in
      assert.equal(sut.getBaseDir(), tmpBase);
    });
  });
});

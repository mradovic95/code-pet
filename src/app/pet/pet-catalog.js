'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const logger = require('../core/logger');

const REQUIRED_STATES = ['idle', 'waking_up', 'working', 'planning', 'waiting_for_action'];

class PetCatalog {
  constructor() {
    this._pets = new Map();
    this._roots = [];
  }

  scan(petsDir) {
    if (!this._roots.includes(petsDir)) {
      this._roots.push(petsDir);
    }
    this._scanDir(petsDir);
  }

  rescan() {
    this._pets.clear();
    for (const root of this._roots) {
      this._scanDir(root);
    }
  }

  _scanDir(petsDir) {
    let entries;
    try {
      entries = fs.readdirSync(petsDir, { withFileTypes: true });
    } catch (err) {
      logger.warn(`Cannot read pets directory: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const petDir = path.join(petsDir, entry.name);
      const manifestPath = path.join(petDir, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        logger.warn(`Skipping pet "${entry.name}": no manifest.json`);
        continue;
      }

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        if (!manifest.id || !manifest.sprites) {
          logger.warn(`Skipping pet "${entry.name}": missing id or sprites`);
          continue;
        }

        const missing = REQUIRED_STATES.filter(s => !manifest.sprites[s]);
        if (missing.length > 0) {
          logger.warn(`Skipping pet "${entry.name}": missing states: ${missing.join(', ')}`);
          continue;
        }

        let filesValid = true;
        for (const state of REQUIRED_STATES) {
          const spriteFile = path.join(petDir, manifest.sprites[state].file);
          if (!fs.existsSync(spriteFile)) {
            logger.warn(`Skipping pet "${entry.name}": missing sprite file "${manifest.sprites[state].file}"`);
            filesValid = false;
            break;
          }
        }
        if (!filesValid) continue;

        manifest.tier = manifest.tier || 'free';
        manifest._dir = petDir;
        manifest._dirUrl = pathToFileURL(petDir).href;
        this._pets.set(manifest.id, manifest);
        logger.info(`Loaded pet: ${manifest.id} (${manifest.name}) [${manifest.tier}]`);
      } catch (err) {
        logger.warn(`Skipping pet "${entry.name}": ${err.message}`);
      }
    }
  }

  get(petId) {
    return this._pets.get(petId) || this._pets.get('dog');
  }

  has(petId) {
    return this._pets.has(petId);
  }

  list() {
    return Array.from(this._pets.values()).map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      tier: m.tier || 'free',
      icon: m.icon || 'icon.png',
      sprites: m.sprites,
      autoTransitions: m.autoTransitions || {},
      sounds: m.sounds || {},
      frameSize: m.frameSize || 64,
      _dir: m._dir,
      _dirUrl: m._dirUrl,
    }));
  }

  getDefault() {
    return 'dog';
  }
}

module.exports = PetCatalog;

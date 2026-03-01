'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const REQUIRED_STATES = ['idle', 'waking_up', 'working', 'planning', 'waiting_for_action'];

class PetCatalog {
  constructor() {
    this._pets = new Map();
  }

  scan(petsDir) {
    this._scanDir(petsDir, 'free');
  }

  scanPremium(premiumDir) {
    this._scanDir(premiumDir, 'premium', true);
  }

  _scanDir(dir, defaultTier, skipFileValidation) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      logger.warn(`Cannot read pets directory: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const petDir = path.join(dir, entry.name);
      const manifestPath = path.join(petDir, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        logger.warn(`Skipping pet "${entry.name}": no manifest.json`);
        continue;
      }

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        // Validate required fields
        if (!manifest.id || !manifest.sprites) {
          logger.warn(`Skipping pet "${entry.name}": missing id or sprites`);
          continue;
        }

        // Validate all required states present
        const missing = REQUIRED_STATES.filter(s => !manifest.sprites[s]);
        if (missing.length > 0) {
          logger.warn(`Skipping pet "${entry.name}": missing states: ${missing.join(', ')}`);
          continue;
        }

        // Skip file validation for premium pets (files are obfuscated on disk)
        if (!skipFileValidation) {
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
        }

        // Set tier from manifest or default
        manifest.tier = manifest.tier || defaultTier;
        // Store path for renderer reference
        manifest._dir = petDir;
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
      sprites: m.sprites,
      autoTransitions: m.autoTransitions || {},
      frameSize: m.frameSize || 64,
      _dir: m._dir,
    }));
  }

  getDefault() {
    return 'dog';
  }
}

module.exports = PetCatalog;

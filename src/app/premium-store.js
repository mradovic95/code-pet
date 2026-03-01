'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const logger = require('./logger');

const PREMIUM_DIR = path.join(os.homedir(), '.code-pet', 'premium-pets');
const DEV_ASSETS_DIR = path.join(__dirname, '..', '..', 'assets', 'pets-dev');

function deriveKey(licenseKey, petId) {
  return crypto.createHash('sha256').update(licenseKey + petId).digest();
}

function xorBuffer(data, key) {
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

class PremiumStore {
  constructor() {
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(PREMIUM_DIR)) {
        fs.mkdirSync(PREMIUM_DIR, { recursive: true });
      }
    } catch (err) {
      logger.warn(`Failed to create premium pets directory: ${err.message}`);
    }
  }

  /**
   * Download (mock: copy) premium pet sprites and obfuscate to disk.
   * Mock flow: copies from assets/pets-dev/{petId}/ to ~/.code-pet/premium-pets/{petId}/
   * SVG files are XOR-encrypted; manifest.json stored in plaintext.
   */
  async download(petId, licenseKey) {
    const sourceDir = path.join(DEV_ASSETS_DIR, petId);
    const destDir = path.join(PREMIUM_DIR, petId);

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Dev assets not found for pet "${petId}"`);
    }

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const key = deriveKey(licenseKey, petId);
    const files = fs.readdirSync(sourceDir);

    for (const file of files) {
      const srcPath = path.join(sourceDir, file);
      const destPath = path.join(destDir, file);

      if (file === 'manifest.json') {
        // Manifest stored in plaintext
        fs.copyFileSync(srcPath, destPath);
      } else if (file.endsWith('.svg')) {
        // XOR-encrypt SVG files
        const data = fs.readFileSync(srcPath);
        const encrypted = xorBuffer(data, key);
        fs.writeFileSync(destPath, encrypted);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }

    logger.info(`Downloaded premium pet "${petId}" to ${destDir}`);
  }

  /**
   * Load sprites from disk, XOR-decrypt, return as data: URIs.
   * Returns { idle: "data:image/svg+xml;base64,...", working: ..., ... }
   */
  loadSprites(petId, licenseKey) {
    const petDir = path.join(PREMIUM_DIR, petId);
    const manifestPath = path.join(petDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const key = deriveKey(licenseKey, petId);
    const sprites = {};

    for (const [state, sprite] of Object.entries(manifest.sprites)) {
      const filePath = path.join(petDir, sprite.file);
      if (!fs.existsSync(filePath)) {
        logger.warn(`Missing sprite file for ${petId}/${state}: ${sprite.file}`);
        continue;
      }

      const encrypted = fs.readFileSync(filePath);
      const decrypted = xorBuffer(encrypted, key);
      const base64 = decrypted.toString('base64');
      sprites[state] = `data:image/svg+xml;base64,${base64}`;
    }

    return sprites;
  }

  isDownloaded(petId) {
    const manifestPath = path.join(PREMIUM_DIR, petId, 'manifest.json');
    return fs.existsSync(manifestPath);
  }

  remove(petId) {
    const petDir = path.join(PREMIUM_DIR, petId);
    if (fs.existsSync(petDir)) {
      fs.rmSync(petDir, { recursive: true, force: true });
      logger.info(`Removed premium pet "${petId}"`);
    }
  }

  getPremiumDir() {
    return PREMIUM_DIR;
  }
}

module.exports = PremiumStore;

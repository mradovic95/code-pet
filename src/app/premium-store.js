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
   * Download premium pet sprites and obfuscate to disk.
   *
   * Remote flow (api + productId provided): fetch from marketplace API.
   * Dev flow (no api): copy from local assets/pets-dev/{petId}/.
   *
   * Binary asset files (SVG, PNG) are XOR-encrypted; manifest.json stored in plaintext.
   */
  async download(petId, licenseKey, api, productId) {
    const destDir = path.join(PREMIUM_DIR, petId);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const key = deriveKey(licenseKey, petId);

    if (api && productId) {
      // Remote: fetch from marketplace API
      await this._downloadRemote(petId, licenseKey, api, productId, destDir, key);
    } else {
      // Dev fallback: copy from local assets
      this._downloadLocal(petId, destDir, key);
    }

    logger.info(`Downloaded premium pet "${petId}" to ${destDir}`);
  }

  async _downloadRemote(petId, licenseKey, api, productId, destDir, key) {
    // Fetch manifest first to discover sprite files
    const manifestBuf = await api.downloadAsset(productId, 'manifest.json', licenseKey);
    const manifestPath = path.join(destDir, 'manifest.json');
    fs.writeFileSync(manifestPath, manifestBuf);

    const manifest = JSON.parse(manifestBuf.toString('utf8'));

    // Download each sprite file
    for (const [, sprite] of Object.entries(manifest.sprites || {})) {
      const filename = sprite.file;
      const data = await api.downloadAsset(productId, filename, licenseKey);
      const destPath = path.join(destDir, filename);

      if (this._shouldEncrypt(filename)) {
        fs.writeFileSync(destPath, xorBuffer(data, key));
      } else {
        fs.writeFileSync(destPath, data);
      }
    }
  }

  _downloadLocal(petId, destDir, key) {
    const sourceDir = path.join(DEV_ASSETS_DIR, petId);

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Dev assets not found for pet "${petId}"`);
    }

    const files = fs.readdirSync(sourceDir);

    for (const file of files) {
      const srcPath = path.join(sourceDir, file);
      const destPath = path.join(destDir, file);

      if (file === 'manifest.json') {
        fs.copyFileSync(srcPath, destPath);
      } else if (this._shouldEncrypt(file)) {
        const data = fs.readFileSync(srcPath);
        fs.writeFileSync(destPath, xorBuffer(data, key));
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  _shouldEncrypt(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.wav', '.mp3', '.ogg'].includes(ext);
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
      const mime = this._mimeForFile(sprite.file);
      sprites[state] = `data:${mime};base64,${base64}`;
    }

    return sprites;
  }

  _mimeForFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimes = {
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
    };
    return mimes[ext] || 'application/octet-stream';
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

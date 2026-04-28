'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class PremiumStore {
  constructor(baseDir) {
    if (!baseDir) {
      throw new Error('PremiumStore requires a baseDir');
    }
    this._baseDir = baseDir;
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this._baseDir)) {
        fs.mkdirSync(this._baseDir, { recursive: true });
      }
    } catch (err) {
      logger.warn(`Failed to create pets directory: ${err.message}`);
    }
  }

  /**
   * Download a premium pet from the marketplace API into `{baseDir}/{petId}/`.
   */
  async download(petId, licenseKey, api, productId) {
    if (!api || !productId) {
      throw new Error(`Cannot download premium pet "${petId}": marketplace API and productId are required`);
    }

    const destDir = path.join(this._baseDir, petId);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    await this._downloadRemote(petId, licenseKey, api, productId, destDir);
    logger.info(`Downloaded premium pet "${petId}" to ${destDir}`);
  }

  async _downloadRemote(petId, licenseKey, api, productId, destDir) {
    const manifestBuf = await api.downloadAsset(productId, 'manifest.json', licenseKey);
    fs.writeFileSync(path.join(destDir, 'manifest.json'), manifestBuf);

    const manifest = JSON.parse(manifestBuf.toString('utf8'));

    for (const [, sprite] of Object.entries(manifest.sprites || {})) {
      const filename = sprite.file;
      const data = await api.downloadAsset(productId, filename, licenseKey);
      fs.writeFileSync(path.join(destDir, filename), data);
    }

    const iconFile = manifest.icon || 'icon.png';
    try {
      const iconData = await api.downloadAsset(productId, iconFile, licenseKey);
      fs.writeFileSync(path.join(destDir, iconFile), iconData);
    } catch (err) {
      logger.warn(`No icon for premium pet "${petId}" (${iconFile}): ${err.message}`);
    }

    for (const [, soundFile] of Object.entries(manifest.sounds || {})) {
      if (!soundFile) continue;
      try {
        const data = await api.downloadAsset(productId, soundFile, licenseKey);
        fs.writeFileSync(path.join(destDir, soundFile), data);
      } catch (err) {
        logger.warn(`No sound asset "${soundFile}" for "${petId}": ${err.message}`);
      }
    }
  }

  isDownloaded(petId) {
    return fs.existsSync(path.join(this._baseDir, petId, 'manifest.json'));
  }

  remove(petId) {
    const petDir = path.join(this._baseDir, petId);
    if (fs.existsSync(petDir)) {
      fs.rmSync(petDir, { recursive: true, force: true });
      logger.info(`Removed premium pet "${petId}"`);
    }
  }

  getBaseDir() {
    return this._baseDir;
  }
}

module.exports = PremiumStore;

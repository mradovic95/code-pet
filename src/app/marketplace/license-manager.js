'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const logger = require('../core/logger');
const { MockLicenseAPI } = require('./license-api');

const CODE_PET_DIR = path.join(os.homedir(), '.code-pet');
const LICENSE_FILE = path.join(CODE_PET_DIR, 'license.json');
const REVALIDATION_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days
const OFFLINE_GRACE_PERIOD = 30 * 24 * 60 * 60 * 1000; // 30 days

const DEFAULT_LICENSE = {
  key: null,
  activationId: null,
  validatedAt: null,
  machineId: null,
  ownedPets: [],
};

class LicenseManager {
  constructor(api) {
    this._api = api || new MockLicenseAPI();
    this._license = { ...DEFAULT_LICENSE };
    this._machineId = null;
  }

  getMachineId() {
    if (this._machineId) return this._machineId;
    const raw = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.userInfo().username}`;
    this._machineId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
    return this._machineId;
  }

  load() {
    try {
      if (fs.existsSync(LICENSE_FILE)) {
        const data = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
        this._license = { ...DEFAULT_LICENSE, ...data };
      }
    } catch (err) {
      logger.warn(`Failed to load license: ${err.message}`);
      this._license = { ...DEFAULT_LICENSE };
    }
  }

  _save() {
    try {
      if (!fs.existsSync(CODE_PET_DIR)) {
        fs.mkdirSync(CODE_PET_DIR, { recursive: true });
      }
      fs.writeFileSync(LICENSE_FILE, JSON.stringify(this._license, null, 2));
    } catch (err) {
      logger.warn(`Failed to save license: ${err.message}`);
    }
  }

  getOwnedPets() {
    return this._license.ownedPets || [];
  }

  getLicenseKey() {
    return this._license.key;
  }

  isOwned(petId) {
    return (this._license.ownedPets || []).includes(petId);
  }

  needsRevalidation() {
    if (!this._license.key || !this._license.validatedAt) return false;
    const elapsed = Date.now() - this._license.validatedAt;
    return elapsed > REVALIDATION_INTERVAL;
  }

  isWithinGracePeriod() {
    if (!this._license.validatedAt) return false;
    const elapsed = Date.now() - this._license.validatedAt;
    return elapsed <= OFFLINE_GRACE_PERIOD;
  }

  async activate(key) {
    const machineId = this.getMachineId();
    const result = await this._api.activate(key, machineId);

    if (!result.success) {
      return { success: false, error: result.error || 'Activation failed' };
    }

    // Merge newly owned pets with existing ones
    const existing = new Set(this._license.ownedPets || []);
    for (const petId of result.ownedPets) {
      existing.add(petId);
    }

    this._license.key = key;
    this._license.activationId = result.activationId || key.slice(0, 16);
    this._license.validatedAt = Date.now();
    this._license.machineId = machineId;
    this._license.ownedPets = Array.from(existing);
    this._save();

    return { success: true, ownedPets: this._license.ownedPets };
  }

  async validate() {
    if (!this._license.key) return { valid: false };

    const machineId = this.getMachineId();
    try {
      const result = await this._api.validate(this._license.key, machineId);
      if (result.valid) {
        this._license.validatedAt = Date.now();
        // Merge owned pets
        const existing = new Set(this._license.ownedPets || []);
        for (const petId of result.ownedPets) {
          existing.add(petId);
        }
        this._license.ownedPets = Array.from(existing);
        this._save();
      }
      return result;
    } catch (err) {
      logger.warn(`License validation failed: ${err.message}`);
      // Allow offline grace period
      if (this.isWithinGracePeriod()) {
        return { valid: true, ownedPets: this._license.ownedPets, offline: true };
      }
      return { valid: false };
    }
  }

  getStatus() {
    return {
      hasLicense: !!this._license.key,
      ownedPets: this._license.ownedPets || [],
      validatedAt: this._license.validatedAt,
      needsRevalidation: this.needsRevalidation(),
    };
  }

  clear() {
    this._license = { ...DEFAULT_LICENSE };
    try {
      if (fs.existsSync(LICENSE_FILE)) fs.unlinkSync(LICENSE_FILE);
    } catch (err) {
      logger.warn(`Failed to clear license file: ${err.message}`);
    }
  }
}

module.exports = LicenseManager;

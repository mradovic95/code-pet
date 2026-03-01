'use strict';

const crypto = require('crypto');

/**
 * License API abstraction layer.
 * Interface:
 *   activate(key, machineId) -> { success, ownedPets[], activationId }
 *   validate(key, machineId) -> { valid, ownedPets[] }
 *   getCatalog()             -> [{ id, name, price, previewUrl, tier }]
 *   purchase(petId)          -> { success, licenseKey }
 */

class MockLicenseAPI {
  constructor() {
    // In-memory store of "purchased" keys for this session
    this._keys = new Map(); // key -> { petId, activationCount }
  }

  async activate(key, machineId) {
    // Extract petId from mock key format: MOCK-{petId}-{timestamp}
    const match = key.match(/^MOCK-(.+)-(\d+)$/);
    if (!match) {
      return { success: false, ownedPets: [], activationId: null, error: 'Invalid license key format' };
    }

    const petId = match[1];
    const activationId = crypto
      .createHash('sha256')
      .update(key + machineId)
      .digest('hex')
      .slice(0, 16);

    // Track activation
    if (!this._keys.has(key)) {
      this._keys.set(key, { petId, activationCount: 0 });
    }
    const entry = this._keys.get(key);
    entry.activationCount++;

    // Mock: max 3 activations per key
    if (entry.activationCount > 3) {
      return { success: false, ownedPets: [], activationId: null, error: 'Maximum activations reached (3)' };
    }

    return {
      success: true,
      ownedPets: [petId],
      activationId,
    };
  }

  async validate(key, machineId) {
    const match = key.match(/^MOCK-(.+)-(\d+)$/);
    if (!match) {
      return { valid: false, ownedPets: [] };
    }
    return { valid: true, ownedPets: [match[1]] };
  }

  async getCatalog() {
    return [
      {
        id: 'dragon',
        name: 'Dragon',
        description: 'A fiery coding dragon',
        price: '$2.99',
        tier: 'premium',
      },
      {
        id: 'panda',
        name: 'Panda',
        description: 'A zen coding panda',
        price: '$2.99',
        tier: 'premium',
      },
    ];
  }

  async purchase(petId) {
    const timestamp = Date.now();
    const key = `MOCK-${petId}-${timestamp}`;
    this._keys.set(key, { petId, activationCount: 0 });
    return { success: true, licenseKey: key };
  }
}

module.exports = { MockLicenseAPI };

'use strict';

const { MockLicenseAPI } = require('./license-api');

/**
 * Fetches the marketplace catalog of available premium pets.
 * Mock: returns hardcoded catalog from MockLicenseAPI.
 * Real: would fetch from a hosted JSON endpoint or provider API.
 */
class MarketplaceCatalog {
  constructor(api) {
    this._api = api || new MockLicenseAPI();
  }

  async getCatalog() {
    return this._api.getCatalog();
  }
}

module.exports = MarketplaceCatalog;

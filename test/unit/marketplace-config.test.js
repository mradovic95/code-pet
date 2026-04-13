'use strict';

const { setupMocks } = require('../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('marketplace-config', () => {
  const configDir = path.join(os.homedir(), '.code-pet');
  const configFile = path.join(configDir, 'marketplace.json');
  let originalContent;
  let configExisted;

  beforeEach(() => {
    // Preserve existing config
    configExisted = fs.existsSync(configFile);
    if (configExisted) {
      originalContent = fs.readFileSync(configFile, 'utf8');
    }
    // Clear require cache so each test gets a fresh module
    delete require.cache[require.resolve('../../src/app/marketplace-config')];
  });

  afterEach(() => {
    // Restore original config
    if (configExisted) {
      fs.writeFileSync(configFile, originalContent);
    } else if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }
    // Clean env vars
    delete process.env.MARKETPLACE_URL;
    delete process.env.MARKETPLACE_API_KEY;
    delete process.env.MARKETPLACE_ID;
  });

  it('returns defaults when no config file exists', () => {
    // GIVEN
    if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
    const sut = require('../../src/app/marketplace-config');

    // WHEN
    sut.load();

    // THEN
    assert.equal(sut.getBaseUrl(), 'https://2vyd33gumd.execute-api.us-east-2.amazonaws.com/stage');
    assert.equal(sut.getApiKey(), null);
    assert.equal(sut.isConfigured(), false);
  });

  it('reads config from file', () => {
    // GIVEN
    fs.writeFileSync(configFile, JSON.stringify({
      baseUrl: 'https://custom.api.com',
      apiKey: 'test-key-123',
      marketplaceId: 42,
    }));
    const sut = require('../../src/app/marketplace-config');

    // WHEN
    sut.load();

    // THEN
    assert.equal(sut.getBaseUrl(), 'https://custom.api.com');
    assert.equal(sut.getApiKey(), 'test-key-123');
    assert.equal(sut.getMarketplaceId(), 42);
    assert.equal(sut.isConfigured(), true);
  });

  it('env vars override file values', () => {
    // GIVEN
    fs.writeFileSync(configFile, JSON.stringify({
      baseUrl: 'https://from-file.com',
      apiKey: 'file-key',
    }));
    process.env.MARKETPLACE_URL = 'https://from-env.com';
    process.env.MARKETPLACE_API_KEY = 'env-key';
    process.env.MARKETPLACE_ID = '99';
    const sut = require('../../src/app/marketplace-config');

    // WHEN
    sut.load();

    // THEN
    assert.equal(sut.getBaseUrl(), 'https://from-env.com');
    assert.equal(sut.getApiKey(), 'env-key');
    assert.equal(sut.getMarketplaceId(), 99);
  });
});

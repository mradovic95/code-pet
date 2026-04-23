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
    configExisted = fs.existsSync(configFile);
    if (configExisted) {
      originalContent = fs.readFileSync(configFile, 'utf8');
    }
    delete require.cache[require.resolve('../../src/app/marketplace-config')];
  });

  afterEach(() => {
    if (configExisted) {
      fs.writeFileSync(configFile, originalContent);
    } else if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }
    delete process.env.MARKETPLACE_URL;
    delete process.env.MARKETPLACE_ID;
    delete process.env.MARKETPLACE_MOCK;
  });

  it('returns defaults when no config file exists', () => {
    // GIVEN
    if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
    const sut = require('../../src/app/marketplace-config');

    // WHEN
    sut.load();

    // THEN
    assert.equal(sut.getBaseUrl(), 'https://2vyd33gumd.execute-api.us-east-2.amazonaws.com/stage');
    assert.equal(sut.getMarketplaceId(), 1);
    assert.equal(sut.getJwtToken(), null);
    assert.equal(sut.isMockMode(), false);
  });

  it('reads config from file', () => {
    // GIVEN
    fs.writeFileSync(configFile, JSON.stringify({
      baseUrl: 'https://custom.api.com',
      marketplaceId: 42,
      jwtToken: 'jwt-xyz',
    }));
    const sut = require('../../src/app/marketplace-config');

    // WHEN
    sut.load();

    // THEN
    assert.equal(sut.getBaseUrl(), 'https://custom.api.com');
    assert.equal(sut.getMarketplaceId(), 42);
    assert.equal(sut.getJwtToken(), 'jwt-xyz');
  });

  it('env vars override file values', () => {
    // GIVEN
    fs.writeFileSync(configFile, JSON.stringify({
      baseUrl: 'https://from-file.com',
      marketplaceId: 7,
    }));
    process.env.MARKETPLACE_URL = 'https://from-env.com';
    process.env.MARKETPLACE_ID = '99';
    const sut = require('../../src/app/marketplace-config');

    // WHEN
    sut.load();

    // THEN
    assert.equal(sut.getBaseUrl(), 'https://from-env.com');
    assert.equal(sut.getMarketplaceId(), 99);
  });

  it('isMockMode returns true when MARKETPLACE_MOCK=true', () => {
    // GIVEN
    process.env.MARKETPLACE_MOCK = 'true';
    const sut = require('../../src/app/marketplace-config');

    // WHEN
    sut.load();

    // THEN
    assert.equal(sut.isMockMode(), true);
  });

  it('isMockMode returns false for other MARKETPLACE_MOCK values', () => {
    // GIVEN
    process.env.MARKETPLACE_MOCK = 'yes';
    const sut = require('../../src/app/marketplace-config');

    // WHEN
    sut.load();

    // THEN
    assert.equal(sut.isMockMode(), false);
  });
});

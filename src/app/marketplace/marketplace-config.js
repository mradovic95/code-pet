'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../core/logger');
const { DEFAULT_BASE_URL, DEFAULT_MARKETPLACE_ID } = require('./marketplace-constants');

const CONFIG_DIR = path.join(os.homedir(), '.code-pet');
const CONFIG_FILE = path.join(CONFIG_DIR, 'marketplace.json');

const DEFAULT_CONFIG = {
  baseUrl: DEFAULT_BASE_URL,
  marketplaceId: DEFAULT_MARKETPLACE_ID,
  jwtToken: null,
};

let config = { ...DEFAULT_CONFIG };

function load() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config = { ...DEFAULT_CONFIG, ...data };
    } else {
      config = { ...DEFAULT_CONFIG };
    }
  } catch (err) {
    logger.warn(`Failed to load marketplace config: ${err.message}`);
    config = { ...DEFAULT_CONFIG };
  }

  if (process.env.MARKETPLACE_URL) {
    config.baseUrl = process.env.MARKETPLACE_URL;
  }
  if (process.env.MARKETPLACE_ID) {
    config.marketplaceId = Number(process.env.MARKETPLACE_ID);
  }

  return config;
}

function get() {
  return config;
}

function getBaseUrl() {
  return (config.baseUrl || DEFAULT_CONFIG.baseUrl).replace(/\/+$/, '');
}

function getMarketplaceId() {
  return config.marketplaceId || DEFAULT_MARKETPLACE_ID;
}

function getJwtToken() {
  return config.jwtToken || null;
}

function isMockMode() {
  return process.env.MARKETPLACE_MOCK === 'true';
}

module.exports = { load, get, getBaseUrl, getMarketplaceId, getJwtToken, isMockMode };

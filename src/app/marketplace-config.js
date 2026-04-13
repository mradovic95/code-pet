'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

const CONFIG_DIR = path.join(os.homedir(), '.code-pet');
const CONFIG_FILE = path.join(CONFIG_DIR, 'marketplace.json');

const DEFAULT_CONFIG = {
  baseUrl: 'https://2vyd33gumd.execute-api.us-east-2.amazonaws.com/stage',
  apiKey: null,
  marketplaceId: null,
  jwtToken: null,
};

let config = { ...DEFAULT_CONFIG };

function load() {
  // File config
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config = { ...DEFAULT_CONFIG, ...data };
    }
  } catch (err) {
    logger.warn(`Failed to load marketplace config: ${err.message}`);
    config = { ...DEFAULT_CONFIG };
  }

  // Env var overrides
  if (process.env.MARKETPLACE_URL) {
    config.baseUrl = process.env.MARKETPLACE_URL;
  }
  if (process.env.MARKETPLACE_API_KEY) {
    config.apiKey = process.env.MARKETPLACE_API_KEY;
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

function getApiKey() {
  return config.apiKey || null;
}

function getMarketplaceId() {
  return config.marketplaceId || null;
}

function getJwtToken() {
  return config.jwtToken || null;
}

function isConfigured() {
  return !!config.apiKey;
}

module.exports = { load, get, getBaseUrl, getApiKey, getMarketplaceId, getJwtToken, isConfigured };

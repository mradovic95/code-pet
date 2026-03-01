'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

const SETTINGS_DIR = path.join(os.homedir(), '.code-pet');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  defaultPetType: 'dog',
  projectPets: {},
  licenseKey: null,
  activationId: null,
  soundEnabled: false,
};

let settings = { ...DEFAULT_SETTINGS };

function load() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      settings = { ...DEFAULT_SETTINGS, ...data };
    }
  } catch (err) {
    logger.warn(`Failed to load settings: ${err.message}`);
    settings = { ...DEFAULT_SETTINGS };
  }
}

function save() {
  try {
    if (!fs.existsSync(SETTINGS_DIR)) {
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {
    logger.warn(`Failed to save settings: ${err.message}`);
  }
}

function getDefaultPetType() {
  return settings.defaultPetType || 'dog';
}

function setDefaultPetType(petType) {
  settings.defaultPetType = petType;
  save();
}

function getPetTypeForProject(projectPath) {
  return settings.projectPets[projectPath] || settings.defaultPetType || 'dog';
}

function setPetTypeForProject(projectPath, petType) {
  settings.projectPets[projectPath] = petType;
  save();
}

function getLicenseKey() {
  return settings.licenseKey || null;
}

function setLicenseKey(key) {
  settings.licenseKey = key;
  save();
}

function getActivationId() {
  return settings.activationId || null;
}

function setActivationId(id) {
  settings.activationId = id;
  save();
}

function getSoundEnabled() {
  return !!settings.soundEnabled;
}

function setSoundEnabled(enabled) {
  settings.soundEnabled = !!enabled;
  save();
}

module.exports = {
  load,
  save,
  getDefaultPetType,
  setDefaultPetType,
  getPetTypeForProject,
  setPetTypeForProject,
  getLicenseKey,
  setLicenseKey,
  getActivationId,
  setActivationId,
  getSoundEnabled,
  setSoundEnabled,
};

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

const SETTINGS_DIR = path.join(os.homedir(), '.code-pet');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

const DEFAULT_SOUND_SETTINGS = { idle: false, waiting_for_action: false };

const DEFAULT_SETTINGS = {
  defaultPetType: 'dog',
  projectPets: {},
  licenseKey: null,
  activationId: null,
  soundEnabled: { ...DEFAULT_SOUND_SETTINGS },
  buyerEmail: null,
  animationPreviewCollapsed: false,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let settings = { ...DEFAULT_SETTINGS };

function load() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      settings = { ...DEFAULT_SETTINGS, ...data };
      // Migrate boolean soundEnabled to per-state object
      if (typeof settings.soundEnabled === 'boolean') {
        settings.soundEnabled = settings.soundEnabled
          ? { idle: false, waiting_for_action: true }
          : { ...DEFAULT_SOUND_SETTINGS };
        save();
      }
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
  return settings.soundEnabled && typeof settings.soundEnabled === 'object'
    ? settings.soundEnabled
    : { ...DEFAULT_SOUND_SETTINGS };
}

function setSoundEnabledForState(stateName, enabled) {
  if (!settings.soundEnabled || typeof settings.soundEnabled !== 'object') {
    settings.soundEnabled = { ...DEFAULT_SOUND_SETTINGS };
  }
  settings.soundEnabled[stateName] = !!enabled;
  save();
}

function getBuyerEmail() {
  return settings.buyerEmail || null;
}

function setBuyerEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed === '' || !EMAIL_REGEX.test(trimmed)) return false;
  settings.buyerEmail = trimmed;
  save();
  return true;
}

function getAnimationPreviewCollapsed() {
  return settings.animationPreviewCollapsed === true;
}

function setAnimationPreviewCollapsed(value) {
  settings.animationPreviewCollapsed = value === true;
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
  setSoundEnabledForState,
  getBuyerEmail,
  setBuyerEmail,
  getAnimationPreviewCollapsed,
  setAnimationPreviewCollapsed,
};

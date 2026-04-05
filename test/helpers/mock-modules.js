'use strict';

const Module = require('module');
const path = require('path');

const mockLogger = require('./mock-logger');

const originalResolve = Module._resolveFilename;

const MOCKS = {
  // Map resolved paths to mock objects
};

function setupMocks() {
  // Resolve real paths for modules we want to mock
  const loggerPath = require.resolve('../../src/app/logger');
  MOCKS[loggerPath] = mockLogger;

  // Clear any cached versions
  for (const mockPath of Object.keys(MOCKS)) {
    delete require.cache[mockPath];
    require.cache[mockPath] = {
      id: mockPath,
      filename: mockPath,
      loaded: true,
      exports: MOCKS[mockPath],
    };
  }
}

function mockSettingsStore() {
  const settingsPath = require.resolve('../../src/app/settings-store');
  delete require.cache[settingsPath];
  require.cache[settingsPath] = {
    id: settingsPath,
    filename: settingsPath,
    loaded: true,
    exports: {
      getPetTypeForProject: () => 'dog',
      getDefaultPetType: () => 'dog',
      load: () => {},
      save: () => {},
    },
  };
}

module.exports = { setupMocks, mockSettingsStore };

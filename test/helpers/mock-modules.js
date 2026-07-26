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
  const loggerPath = require.resolve('../../src/app/core/logger');
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

function mockSettingsStore(overrides = {}) {
  const settingsPath = require.resolve('../../src/app/core/settings-store');
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
      ...overrides,
    },
  };
}

module.exports = { setupMocks, mockSettingsStore };

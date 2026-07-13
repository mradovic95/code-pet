'use strict';

/**
 * Creates a mock PetContext for testing state classes in isolation.
 * Tracks changeState calls without actually creating new state instances.
 */
function createMockContext(overrides = {}) {
  return {
    projectName: 'test-project',
    lastActiveEvent: null,
    lastEventName: null,
    permissionMode: null,
    lastAgentId: null,
    changeState: function (stateName) {
      this._lastChangedTo = stateName;
    },
    _lastChangedTo: null,
    ...overrides,
  };
}

module.exports = { createMockContext };

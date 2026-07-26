'use strict';

const { STATES } = require('./events');

function createState(stateName, context) {
  switch (stateName) {
    case STATES.IDLE:               return new (require('./idle-state'))(context);
    case STATES.WORKING:            return new (require('./working-state'))(context);
    case STATES.PLANNING:           return new (require('./planning-state'))(context);
    case STATES.WAITING_FOR_ACTION: return new (require('./waiting-for-action-state'))(context);
    default: throw new Error(`Unknown state: ${stateName}`);
  }
}

module.exports = { createState };

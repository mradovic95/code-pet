'use strict';

const EVENTS = {
  AWAKEN:            'awaken',
  WORKING_STARTED:   'working_started',
  PLANNING_STARTED:  'planning_started',
  ACTION_REQUESTED:  'action_requested',
  WORK_FINISHED:     'work_finished',
  QUESTION_ANSWERED: 'question_answered',
  FALLING_ASLEEP:    'falling_asleep',
};

const { STATES } = require('./states');

const EVENT_TO_STATE = {
  [EVENTS.WORKING_STARTED]:  STATES.WORKING,
  [EVENTS.PLANNING_STARTED]: STATES.PLANNING,
  [EVENTS.ACTION_REQUESTED]: STATES.WAITING_FOR_ACTION,
  [EVENTS.WORK_FINISHED]:    STATES.IDLE,
};

const VALID_EVENTS = new Set(Object.values(EVENTS));

module.exports = { EVENTS, STATES, EVENT_TO_STATE, VALID_EVENTS };

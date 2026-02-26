'use strict';

const EVENT_TO_STATE_RENDERER = {
  awaken:           'waking_up',
  working_started:  'working',
  planning_started: 'planning',
  action_requested: 'waiting_for_action',
  work_finished:    'idle',
};

window.codePet.onPetEvent(({ project, state, projectName }) => {
  petManager.updatePet(project, state, projectName);
});

window.codePet.onPetRemove(({ project }) => {
  petManager.removePet(project);
});

window.codePet.onPetInit((snapshot) => {
  for (const [project, data] of Object.entries(snapshot)) {
    const state = EVENT_TO_STATE_RENDERER[data.lastEventName] || 'idle';
    petManager.updatePet(project, state, data.projectName);
  }
});

window.codePet.signalReady();

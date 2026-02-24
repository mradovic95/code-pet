'use strict';

const EVENT_TO_STATE_RENDERER = {
  awaken:           'waking_up',
  working_started:  'working',
  planning_started: 'planning',
  action_requested: 'waiting_for_action',
  work_finished:    'idle',
};

window.assistantDog.onPetEvent(({ project, state, projectName }) => {
  petManager.updatePet(project, state, projectName);
});

window.assistantDog.onPetRemove(({ project }) => {
  petManager.removePet(project);
});

window.assistantDog.onPetInit((snapshot) => {
  for (const [project, data] of Object.entries(snapshot)) {
    const state = EVENT_TO_STATE_RENDERER[data.lastEventName] || 'idle';
    petManager.updatePet(project, state, data.projectName);
  }
});

window.assistantDog.signalReady();

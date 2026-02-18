'use strict';

window.assistantDog.onEvent((eventName) => {
  dogStateMachine.setState(eventName);
});

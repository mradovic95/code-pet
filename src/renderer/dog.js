'use strict';

const SPRITES = {
  idle:     { frames: 4, duration: 1600, loop: true },
  wake:     { frames: 4, duration: 800,  loop: false },
  sleep:    { frames: 4, duration: 2400, loop: true },
  thinking: { frames: 4, duration: 1200, loop: true },
  questioning: { frames: 4, duration: 1200, loop: true },
};

// Auto-transition targets for non-looping or transient states
const AUTO_TRANSITIONS = {
  wake:    { next: 'idle', delay: 800 },
};

// Persistent states auto-return to idle after inactivity
const PERSISTENT_STATES = new Set(['thinking', 'questioning']);
const INACTIVITY_TIMEOUT = 10000; // 10 seconds

const DEBOUNCE_MS = 300;

const dogStateMachine = (() => {
  const el = document.getElementById('dog');
  let currentState = 'idle';
  let autoTransitionTimer = null;
  let inactivityTimer = null;
  let debounceTimer = null;
  let lastChangeTime = 0;
  let queuedEvent = null;

  function clearTimers() {
    if (autoTransitionTimer) {
      clearTimeout(autoTransitionTimer);
      autoTransitionTimer = null;
    }
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }

  function applyState(state) {
    if (!SPRITES[state]) return;

    // For persistent states, reset inactivity timer even if state unchanged
    if (state === currentState && PERSISTENT_STATES.has(state)) {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
      inactivityTimer = setTimeout(() => applyState('idle'), INACTIVITY_TIMEOUT);
      return;
    }

    if (state === currentState) return;

    clearTimers();

    // Transition animation
    el.classList.add('transitioning');

    // Remove all state classes
    Object.keys(SPRITES).forEach((s) => el.classList.remove(s));

    // Force animation restart by triggering reflow
    void el.offsetWidth;

    // Apply new state class
    el.classList.add(state);
    currentState = state;
    lastChangeTime = Date.now();

    // Remove transition class after brief fade
    setTimeout(() => el.classList.remove('transitioning'), 100);

    // Set up auto-transition for non-looping states
    if (AUTO_TRANSITIONS[state]) {
      const { next, delay } = AUTO_TRANSITIONS[state];
      autoTransitionTimer = setTimeout(() => applyState(next), delay);
    }

    // Set up inactivity timeout for persistent states
    if (PERSISTENT_STATES.has(state)) {
      inactivityTimer = setTimeout(() => applyState('idle'), INACTIVITY_TIMEOUT);
    }
  }

  function setState(event) {
    const now = Date.now();
    const elapsed = now - lastChangeTime;

    if (elapsed < DEBOUNCE_MS) {
      // Queue this event; only the latest queued event fires
      queuedEvent = event;
      if (!debounceTimer) {
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          const pending = queuedEvent;
          queuedEvent = null;
          if (pending) applyState(pending);
        }, DEBOUNCE_MS - elapsed);
      }
      return;
    }

    queuedEvent = null;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    applyState(event);
  }

  function getState() {
    return currentState;
  }

  return { setState, getState };
})();

'use strict';

const SPRITES = {
  idle:               { frames: 4, duration: 1600, loop: true },
  waking_up:          { frames: 20, duration: 4000, loop: false },
  working:            { frames: 4, duration: 1200, loop: true },
  planning:           { frames: 4, duration: 1200, loop: true },
  waiting_for_action: { frames: 4, duration: 1600, loop: true },
};

// Auto-transition targets for non-looping states
const AUTO_TRANSITIONS = {
  waking_up: { next: 'idle', delay: 4000 },
};

const DEBOUNCE_MS = 300;

const dogStateMachine = (() => {
  const el = document.getElementById('dog');
  let currentState = 'idle';
  let autoTransitionTimer = null;
  let debounceTimer = null;
  let lastChangeTime = 0;
  let queuedEvent = null;

  function clearTimers() {
    if (autoTransitionTimer) {
      clearTimeout(autoTransitionTimer);
      autoTransitionTimer = null;
    }
  }

  function applyState(state) {
    if (!SPRITES[state]) return;

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

  // Click-through toggle: enable clicks when hovering over the dog
  el.addEventListener('mouseenter', () => {
    window.assistantDog.setIgnoreMouseEvents(false);
  });

  el.addEventListener('mouseleave', () => {
    window.assistantDog.setIgnoreMouseEvents(true);
  });

  // Open settings on double-click
  el.addEventListener('dblclick', () => {
    window.assistantDog.openSettings();
  });

  return { setState, getState };
})();

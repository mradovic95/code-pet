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

class Pet {
  constructor(el, project) {
    this.el = el;
    this.project = project;
    this.currentState = 'idle';
    this.autoTransitionTimer = null;
    this.debounceTimer = null;
    this.clickTimer = null;
    this.lastChangeTime = 0;
    this.queuedEvent = null;
    this._setupInteraction();
  }

  _setupInteraction() {
    this.el.addEventListener('mouseenter', () =>
      window.codePet.setIgnoreMouseEvents(false));
    this.el.addEventListener('mouseleave', () =>
      window.codePet.setIgnoreMouseEvents(true));
    this.el.addEventListener('click', () => {
      if (this.clickTimer) return; // already waiting for double-click disambiguation
      this.clickTimer = setTimeout(() => {
        this.clickTimer = null;
        window.codePet.focusTerminal(this.project);
        this.el.classList.add('clicked');
        setTimeout(() => this.el.classList.remove('clicked'), 200);
      }, 250);
    });
    this.el.addEventListener('dblclick', () => {
      if (this.clickTimer) {
        clearTimeout(this.clickTimer);
        this.clickTimer = null;
      }
      window.codePet.openSettings(this.project);
    });
  }

  clearTimers() {
    if (this.autoTransitionTimer) {
      clearTimeout(this.autoTransitionTimer);
      this.autoTransitionTimer = null;
    }
  }

  applyState(state) {
    if (!SPRITES[state]) return;

    if (state === this.currentState) return;

    this.clearTimers();

    // Transition animation
    this.el.classList.add('transitioning');

    // Remove all state classes
    Object.keys(SPRITES).forEach((s) => this.el.classList.remove(s));

    // Force animation restart by triggering reflow
    void this.el.offsetWidth;

    // Apply new state class
    this.el.classList.add(state);
    this.currentState = state;
    this.lastChangeTime = Date.now();

    // Remove transition class after brief fade
    setTimeout(() => this.el.classList.remove('transitioning'), 100);

    // Set up auto-transition for non-looping states
    if (AUTO_TRANSITIONS[state]) {
      const { next, delay } = AUTO_TRANSITIONS[state];
      this.autoTransitionTimer = setTimeout(() => this.applyState(next), delay);
    }
  }

  setState(event) {
    const now = Date.now();
    const elapsed = now - this.lastChangeTime;

    if (elapsed < DEBOUNCE_MS) {
      // Queue this event; only the latest queued event fires
      this.queuedEvent = event;
      if (!this.debounceTimer) {
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          const pending = this.queuedEvent;
          this.queuedEvent = null;
          if (pending) this.applyState(pending);
        }, DEBOUNCE_MS - elapsed);
      }
      return;
    }

    this.queuedEvent = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.applyState(event);
  }

  getState() {
    return this.currentState;
  }

  destroy() {
    this.clearTimers();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null;
    }
  }
}

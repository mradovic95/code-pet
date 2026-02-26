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

class DogStateMachine {
  constructor(el) {
    this.el = el;
    this.currentState = 'idle';
    this.autoTransitionTimer = null;
    this.debounceTimer = null;
    this.lastChangeTime = 0;
    this.queuedEvent = null;
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
  }
}

class PetManager {
  constructor(container) {
    this.container = container;
    this.pets = new Map(); // project path → { slot, dogEl, labelEl, stateMachine }
  }

  updatePet(project, state, projectName) {
    if (!this.pets.has(project)) {
      this._addPet(project, projectName);
    }
    this.pets.get(project).stateMachine.setState(state);
  }

  _addPet(project, projectName) {
    const slot = document.createElement('div');
    slot.className = 'pet-slot';
    slot.dataset.project = project;

    const dogEl = document.createElement('div');
    dogEl.className = 'dog idle';

    const labelEl = document.createElement('div');
    labelEl.className = 'pet-label';
    labelEl.textContent = projectName || 'unknown';

    slot.appendChild(dogEl);
    slot.appendChild(labelEl);
    this.container.appendChild(slot);

    const stateMachine = new DogStateMachine(dogEl);

    // Per-pet mouse interaction
    let clickTimer = null;
    dogEl.addEventListener('mouseenter', () =>
      window.assistantDog.setIgnoreMouseEvents(false));
    dogEl.addEventListener('mouseleave', () =>
      window.assistantDog.setIgnoreMouseEvents(true));
    dogEl.addEventListener('click', () => {
      if (clickTimer) return; // already waiting for double-click disambiguation
      clickTimer = setTimeout(() => {
        clickTimer = null;
        // Single click: focus the Claude Code terminal
        window.assistantDog.focusTerminal(project);
        dogEl.classList.add('clicked');
        setTimeout(() => dogEl.classList.remove('clicked'), 200);
      }, 250);
    });
    dogEl.addEventListener('dblclick', () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      window.assistantDog.openSettings();
    });

    this.pets.set(project, { slot, dogEl, labelEl, stateMachine });
  }

  removePet(project) {
    const pet = this.pets.get(project);
    if (!pet) return;
    pet.stateMachine.destroy();
    pet.slot.classList.add('removing');
    setTimeout(() => {
      pet.slot.remove();
      this.pets.delete(project);
    }, 300);
  }
}

const petManager = new PetManager(document.getElementById('pets-container'));

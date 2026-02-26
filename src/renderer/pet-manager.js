'use strict';

class PetManager {
  constructor(container) {
    this.container = container;
    this.pets = new Map(); // project path → { slot, petEl, labelEl, stateMachine }
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

    const petEl = document.createElement('div');
    petEl.className = 'pet idle';

    const labelEl = document.createElement('div');
    labelEl.className = 'pet-label';
    labelEl.textContent = projectName || 'unknown';

    slot.appendChild(petEl);
    slot.appendChild(labelEl);
    this.container.appendChild(slot);

    const stateMachine = new Pet(petEl, project);

    this.pets.set(project, { slot, petEl, labelEl, stateMachine });
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

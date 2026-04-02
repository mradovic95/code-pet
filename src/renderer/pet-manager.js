'use strict';

let _petCatalog = [];
let _premiumSprites = {}; // petId -> { idle: "data:...", working: "data:...", ... }
let _soundSettings = { idle: false, waiting_for_action: false };

function setPetCatalog(catalog) {
  _petCatalog = catalog;
  // Pre-inject CSS for all known pet types
  for (const manifest of _petCatalog) {
    const dataUris = _premiumSprites[manifest.id] || null;
    injectPetStyles(manifest.id, manifest, dataUris);
  }
}

function setPremiumSprites(petId, sprites) {
  _premiumSprites[petId] = sprites;
  // Re-inject styles with data URIs if catalog is already loaded
  const manifest = _petCatalog.find(m => m.id === petId);
  if (manifest) {
    injectPetStyles(petId, manifest, sprites);
  }
}

function getManifestForType(petType) {
  return _petCatalog.find(m => m.id === petType) || _petCatalog[0] || null;
}

class PetManager {
  constructor(container) {
    this.container = container;
    this.pets = new Map(); // project path -> { slot, petEl, labelEl, stateMachine, petType }
  }

  updatePet(project, state, projectName, petType) {
    if (!this.pets.has(project)) {
      this._addPet(project, projectName, petType);
    }
    const entry = this.pets.get(project);
    // Detect pet type change
    if (petType && entry.petType !== petType) {
      this.changePetType(project, petType);
    }
    entry.stateMachine.setState(state);
  }

  _addPet(project, projectName, petType) {
    const type = petType || 'dog';
    const manifest = getManifestForType(type);

    // Inject CSS if not already done
    if (manifest) {
      const dataUris = _premiumSprites[type] || null;
      injectPetStyles(type, manifest, dataUris);
    }

    const slot = document.createElement('div');
    slot.className = 'pet-slot';
    slot.dataset.project = project;

    const petEl = document.createElement('div');
    petEl.className = 'pet idle';
    petEl.dataset.petType = type;

    const labelEl = document.createElement('div');
    labelEl.className = 'pet-label';
    labelEl.textContent = projectName || 'unknown';

    slot.appendChild(petEl);
    slot.appendChild(labelEl);
    this.container.appendChild(slot);

    const stateMachine = new Pet(petEl, project, type, manifest);

    this.pets.set(project, { slot, petEl, labelEl, stateMachine, petType: type });
  }

  changePetType(project, petType) {
    const entry = this.pets.get(project);
    if (!entry) return;

    const manifest = getManifestForType(petType);
    if (manifest) {
      const dataUris = _premiumSprites[petType] || null;
      injectPetStyles(petType, manifest, dataUris);
    }

    entry.petType = petType;
    entry.stateMachine.changePetType(petType, manifest);
  }

  updateLabel(project, projectName) {
    const entry = this.pets.get(project);
    if (entry) entry.labelEl.textContent = projectName;
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

function isSoundEnabledForState(state) {
  return !!(_soundSettings && _soundSettings[state]);
}

const petManager = new PetManager(document.getElementById('pets-container'));

'use strict';

const PetContext = require('./state-machine/pet-context');
const settingsStore = require('./settings-store');

class PetRegistry {
  constructor() {
    this._projects = new Map();   // Map<projectPath, PetContext>
    this._cleanupTimer = null;

    // Callback hooks — wired by event-server.js
    this.onProjectAdded = null;   // (projectPath, pet, count) => void
    this.onProjectRemoved = null; // (projectPath, count) => void
    this.onEmpty = null;          // () => void
  }

  getOrCreate(projectPath, projectName) {
    if (this._projects.has(projectPath)) {
      const pet = this._projects.get(projectPath);
      if (projectName) pet.projectName = projectName;
      return pet;
    }
    const petType = settingsStore.getPetTypeForProject(projectPath);
    const pet = new PetContext(projectName, petType);
    this._projects.set(projectPath, pet);
    if (this.onProjectAdded) {
      this.onProjectAdded(projectPath, pet, this._projects.size);
    }
    return pet;
  }

  get(projectPath) {
    return this._projects.get(projectPath);
  }

  has(projectPath) {
    return this._projects.has(projectPath);
  }

  remove(projectPath) {
    if (!this._projects.has(projectPath)) return;
    this._projects.delete(projectPath);
    if (this.onProjectRemoved) {
      this.onProjectRemoved(projectPath, this._projects.size);
    }
    if (this._projects.size === 0 && this.onEmpty) {
      this.onEmpty();
    }
  }

  get size() {
    return this._projects.size;
  }

  getSnapshot() {
    const snapshot = {};
    for (const [path, pet] of this._projects) {
      snapshot[path] = pet.getSnapshot();
    }
    return snapshot;
  }

  getClaudePid(projectPath) {
    const pet = this._projects.get(projectPath);
    return pet ? pet.claudePid : null;
  }

  getTty(projectPath) {
    const pet = this._projects.get(projectPath);
    return pet ? pet.tty : null;
  }

  startCleanup() {
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [path, pet] of this._projects) {
        if (now - pet.lastEventTime > 30 * 60 * 1000) {
          this.remove(path);
        }
      }
    }, 60000);
  }

  stopCleanup() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }
}

module.exports = PetRegistry;

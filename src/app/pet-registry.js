'use strict';

const PetContext = require('./state-machine/pet-context');
const settingsStore = require('./settings-store');

class PetRegistry {
  constructor() {
    this._projects = new Map();          // Map<sessionKey, PetContext>
    this._projectSessions = new Map();   // Map<projectPath, Set<sessionKey>>
    this._cleanupTimer = null;

    // Callback hooks — wired by event-server.js
    this.onProjectAdded = null;   // (sessionKey, pet, count) => void
    this.onProjectRemoved = null; // (sessionKey, count) => void
    this.onLabelChanged = null;   // (sessionKey, newLabel) => void
    this.onEmpty = null;          // () => void
  }

  static makeSessionKey(projectPath, claudePid) {
    if (!claudePid) return projectPath;
    return `${projectPath}::${claudePid}`;
  }

  static parseSessionKey(sessionKey) {
    const idx = sessionKey.lastIndexOf('::');
    if (idx === -1) return { projectPath: sessionKey, claudePid: null };
    const projectPath = sessionKey.substring(0, idx);
    const claudePid = sessionKey.substring(idx + 2);
    return { projectPath, claudePid };
  }

  getOrCreate(sessionKey, projectPath, projectName) {
    if (this._projects.has(sessionKey)) {
      const pet = this._projects.get(sessionKey);
      if (projectName) pet.projectName = projectName;
      return pet;
    }
    const petType = settingsStore.getPetTypeForProject(projectPath);
    const pet = new PetContext(projectName, petType);
    pet.projectPath = projectPath;
    this._projects.set(sessionKey, pet);

    // Maintain secondary index
    if (!this._projectSessions.has(projectPath)) {
      this._projectSessions.set(projectPath, new Set());
    }
    this._projectSessions.get(projectPath).add(sessionKey);

    // Recompute labels for all sessions of this project
    this._recomputeLabels(projectPath);

    if (this.onProjectAdded) {
      this.onProjectAdded(sessionKey, pet, this._projects.size);
    }
    return pet;
  }

  get(sessionKey) {
    return this._projects.get(sessionKey);
  }

  has(sessionKey) {
    return this._projects.has(sessionKey);
  }

  remove(sessionKey) {
    if (!this._projects.has(sessionKey)) return;
    const { projectPath } = PetRegistry.parseSessionKey(sessionKey);
    this._projects.delete(sessionKey);

    // Update secondary index
    const sessions = this._projectSessions.get(projectPath);
    if (sessions) {
      sessions.delete(sessionKey);
      if (sessions.size === 0) {
        this._projectSessions.delete(projectPath);
      } else {
        // Recompute labels for remaining sessions
        this._recomputeLabels(projectPath);
      }
    }

    if (this.onProjectRemoved) {
      this.onProjectRemoved(sessionKey, this._projects.size);
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
    for (const [sessionKey, pet] of this._projects) {
      snapshot[sessionKey] = pet.getSnapshot();
    }
    return snapshot;
  }

  getClaudePid(sessionKey) {
    const pet = this._projects.get(sessionKey);
    return pet ? pet.claudePid : null;
  }

  getTty(sessionKey) {
    const pet = this._projects.get(sessionKey);
    return pet ? pet.tty : null;
  }

  getSessionsForProject(projectPath) {
    return this._projectSessions.get(projectPath) || new Set();
  }

  _recomputeLabels(projectPath) {
    const sessions = this._projectSessions.get(projectPath);
    if (!sessions || sessions.size === 0) return;

    // Sort by createdAt for stable ordering
    const sorted = [...sessions].sort((a, b) => {
      const petA = this._projects.get(a);
      const petB = this._projects.get(b);
      if (!petA || !petB) return 0;
      return petA.createdAt - petB.createdAt;
    });

    for (let i = 0; i < sorted.length; i++) {
      const pet = this._projects.get(sorted[i]);
      if (!pet) continue;
      const oldLabel = pet.displayName;
      if (sorted.length === 1) {
        pet.displayName = pet.projectName;
      } else {
        pet.displayName = i === 0
          ? pet.projectName
          : `${pet.projectName} (${i + 1})`;
      }
      if (oldLabel !== pet.displayName && this.onLabelChanged) {
        this.onLabelChanged(sorted[i], pet.displayName);
      }
    }
  }

  startCleanup() {
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [sessionKey, pet] of this._projects) {
        if (now - pet.lastEventTime > 3 * 60 * 60 * 1000) {
          this.remove(sessionKey);
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

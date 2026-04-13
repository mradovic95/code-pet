'use strict';

const { setupMocks, mockSettingsStore } = require('../helpers/mock-modules');
setupMocks();
mockSettingsStore();

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const PetRegistry = require('../../src/app/pet-registry');

describe('PetRegistry', () => {
  let sut;

  beforeEach(() => {
    sut = new PetRegistry();
  });

  describe('makeSessionKey / parseSessionKey', () => {
    it('creates key with pid when provided', () => {
      // GIVEN
      const projectPath = '/home/user/project';
      const pid = 12345;

      // WHEN
      const key = PetRegistry.makeSessionKey(projectPath, pid);

      // THEN
      assert.equal(key, '/home/user/project::12345');
    });

    it('uses path only when pid is null', () => {
      // GIVEN
      const projectPath = '/home/user/project';

      // WHEN
      const key = PetRegistry.makeSessionKey(projectPath, null);

      // THEN
      assert.equal(key, '/home/user/project');
    });

    it('roundtrips through parseSessionKey with pid', () => {
      // GIVEN
      const original = { projectPath: '/home/user/project', claudePid: '12345' };
      const key = PetRegistry.makeSessionKey(original.projectPath, original.claudePid);

      // WHEN
      const parsed = PetRegistry.parseSessionKey(key);

      // THEN
      assert.equal(parsed.projectPath, original.projectPath);
      assert.equal(parsed.claudePid, original.claudePid);
    });

    it('roundtrips through parseSessionKey without pid', () => {
      // GIVEN
      const key = '/home/user/project';

      // WHEN
      const parsed = PetRegistry.parseSessionKey(key);

      // THEN
      assert.equal(parsed.projectPath, '/home/user/project');
      assert.equal(parsed.claudePid, null);
    });
  });

  describe('getOrCreate', () => {
    it('creates new PetContext on first call', () => {
      // GIVEN
      const key = 'proj::123';

      // WHEN
      const pet = sut.getOrCreate(key, 'proj', 'My Project');

      // THEN
      assert.ok(pet);
      assert.equal(pet.projectName, 'My Project');
      assert.equal(sut.size, 1);
    });

    it('returns existing PetContext on second call', () => {
      // GIVEN
      const key = 'proj::123';
      const first = sut.getOrCreate(key, 'proj', 'My Project');

      // WHEN
      const second = sut.getOrCreate(key, 'proj', 'My Project');

      // THEN
      assert.equal(first, second);
      assert.equal(sut.size, 1);
    });

    it('updates projectName on second call with different name', () => {
      // GIVEN
      const key = 'proj::123';
      sut.getOrCreate(key, 'proj', 'Old Name');

      // WHEN
      const pet = sut.getOrCreate(key, 'proj', 'New Name');

      // THEN
      assert.equal(pet.projectName, 'New Name');
    });

    it('fires onProjectAdded callback', () => {
      // GIVEN
      const calls = [];
      sut.onProjectAdded = (sk, pet, count) => calls.push({ sk, count });

      // WHEN
      sut.getOrCreate('proj::1', 'proj', 'Project');

      // THEN
      assert.equal(calls.length, 1);
      assert.equal(calls[0].sk, 'proj::1');
      assert.equal(calls[0].count, 1);
    });
  });

  describe('get / has', () => {
    it('returns PetContext for existing session key', () => {
      // GIVEN
      const pet = sut.getOrCreate('proj::1', 'proj', 'Project');

      // WHEN
      const result = sut.get('proj::1');

      // THEN
      assert.equal(result, pet);
    });

    it('returns undefined for unknown session key', () => {
      // GIVEN / WHEN
      const result = sut.get('nonexistent');

      // THEN
      assert.equal(result, undefined);
    });

    it('has returns true for existing session key', () => {
      // GIVEN
      sut.getOrCreate('proj::1', 'proj', 'Project');

      // WHEN / THEN
      assert.equal(sut.has('proj::1'), true);
    });

    it('has returns false for unknown session key', () => {
      // GIVEN / WHEN / THEN
      assert.equal(sut.has('nonexistent'), false);
    });
  });

  describe('getClaudePid / getTty', () => {
    it('returns claudePid from PetContext', () => {
      // GIVEN
      const pet = sut.getOrCreate('proj::1', 'proj', 'Project');
      pet.claudePid = 42;

      // WHEN
      const pid = sut.getClaudePid('proj::1');

      // THEN
      assert.equal(pid, 42);
    });

    it('returns null for unknown session key', () => {
      // GIVEN / WHEN
      const pid = sut.getClaudePid('nonexistent');

      // THEN
      assert.equal(pid, null);
    });

    it('returns tty from PetContext', () => {
      // GIVEN
      const pet = sut.getOrCreate('proj::1', 'proj', 'Project');
      pet.tty = '/dev/ttys003';

      // WHEN
      const tty = sut.getTty('proj::1');

      // THEN
      assert.equal(tty, '/dev/ttys003');
    });

    it('returns null tty for unknown session key', () => {
      // GIVEN / WHEN
      const tty = sut.getTty('nonexistent');

      // THEN
      assert.equal(tty, null);
    });
  });

  describe('remove', () => {
    it('removes project and fires onProjectRemoved', () => {
      // GIVEN
      sut.getOrCreate('proj::1', 'proj', 'Project');
      const calls = [];
      sut.onProjectRemoved = (sk, count) => calls.push({ sk, count });

      // WHEN
      sut.remove('proj::1');

      // THEN
      assert.equal(sut.size, 0);
      assert.equal(sut.has('proj::1'), false);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].count, 0);
    });

    it('fires onEmpty when last project removed', () => {
      // GIVEN
      sut.getOrCreate('proj::1', 'proj', 'Project');
      let emptyCalled = false;
      sut.onEmpty = () => { emptyCalled = true; };
      sut.onProjectRemoved = () => {};

      // WHEN
      sut.remove('proj::1');

      // THEN
      assert.equal(emptyCalled, true);
    });

    it('does not fire onEmpty when projects remain', () => {
      // GIVEN
      sut.getOrCreate('proj::1', 'proj', 'Project');
      sut.getOrCreate('proj::2', 'proj', 'Project');
      let emptyCalled = false;
      sut.onEmpty = () => { emptyCalled = true; };
      sut.onProjectRemoved = () => {};

      // WHEN
      sut.remove('proj::1');

      // THEN
      assert.equal(emptyCalled, false);
      assert.equal(sut.size, 1);
    });

    it('is a no-op for unknown session key', () => {
      // GIVEN
      // empty registry

      // WHEN
      sut.remove('nonexistent');

      // THEN
      assert.equal(sut.size, 0);
    });

    it('cleans up secondary index after removal', () => {
      // GIVEN
      sut.getOrCreate('proj::1', 'proj', 'Project');
      sut.onProjectRemoved = () => {};

      // WHEN
      sut.remove('proj::1');

      // THEN
      const sessions = sut.getSessionsForProject('proj');
      assert.equal(sessions.size, 0);
    });
  });

  describe('label numbering', () => {
    it('assigns numbered labels for multiple sessions on same project', () => {
      // GIVEN
      const pet1 = sut.getOrCreate('proj::1', 'proj', 'Project');
      pet1.createdAt = 1000;

      // WHEN
      const pet2 = sut.getOrCreate('proj::2', 'proj', 'Project');
      pet2.createdAt = 2000;

      // THEN
      assert.equal(pet1.displayName, 'Project');
      assert.equal(pet2.displayName, 'Project (2)');
    });

    it('removes numbering when only one session remains', () => {
      // GIVEN
      const pet1 = sut.getOrCreate('proj::1', 'proj', 'Project');
      pet1.createdAt = 1000;
      const pet2 = sut.getOrCreate('proj::2', 'proj', 'Project');
      pet2.createdAt = 2000;
      sut.onProjectRemoved = () => {};

      // WHEN
      sut.remove('proj::2');

      // THEN
      assert.equal(pet1.displayName, 'Project');
    });

    it('assigns sequential numbers for 3+ sessions on same project', () => {
      // GIVEN
      const pet1 = sut.getOrCreate('proj::1', 'proj', 'Project');
      pet1.createdAt = 1000;
      const pet2 = sut.getOrCreate('proj::2', 'proj', 'Project');
      pet2.createdAt = 2000;

      // WHEN
      const pet3 = sut.getOrCreate('proj::3', 'proj', 'Project');
      pet3.createdAt = 3000;

      // THEN
      assert.equal(pet1.displayName, 'Project');
      assert.equal(pet2.displayName, 'Project (2)');
      assert.equal(pet3.displayName, 'Project (3)');
    });

    it('fires onLabelChanged callback when labels are recomputed', () => {
      // GIVEN
      const calls = [];
      sut.onLabelChanged = (sk, newLabel) => calls.push({ sk, newLabel });
      sut.getOrCreate('proj::1', 'proj', 'Project');

      // WHEN — adding second session triggers recompute
      sut.getOrCreate('proj::2', 'proj', 'Project');

      // THEN
      assert.ok(calls.length > 0);
      const labelCall = calls.find((c) => c.newLabel === 'Project (2)');
      assert.ok(labelCall, 'expected onLabelChanged with "Project (2)"');
    });
  });

  describe('getSessionsForProject', () => {
    it('returns set of session keys for a project path', () => {
      // GIVEN
      sut.getOrCreate('proj::1', 'proj', 'Project');
      sut.getOrCreate('proj::2', 'proj', 'Project');

      // WHEN
      const sessions = sut.getSessionsForProject('proj');

      // THEN
      assert.equal(sessions.size, 2);
      assert.ok(sessions.has('proj::1'));
      assert.ok(sessions.has('proj::2'));
    });

    it('returns empty set for unknown project', () => {
      // GIVEN / WHEN
      const sessions = sut.getSessionsForProject('unknown');

      // THEN
      assert.equal(sessions.size, 0);
    });
  });

  describe('getSnapshot', () => {
    it('returns snapshot for all projects', () => {
      // GIVEN
      sut.getOrCreate('proj1::1', 'proj1', 'Project 1');
      sut.getOrCreate('proj2::2', 'proj2', 'Project 2');

      // WHEN
      const snap = sut.getSnapshot();

      // THEN
      assert.ok(snap['proj1::1']);
      assert.ok(snap['proj2::2']);
      assert.equal(snap['proj1::1'].projectName, 'Project 1');
      assert.equal(snap['proj2::2'].projectName, 'Project 2');
    });
  });
});

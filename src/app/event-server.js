'use strict';

const http = require('http');
const url = require('url');
const { app } = require('electron');
const logger = require('./logger');
const { sendToRenderer, isRendererReady, resizeForPetCount } = require('./window-manager');
const PetRegistry = require('./pet-registry');
const { healthCheck, readPid, killProcess, removePid } = require('./process-manager');

const PORT = parseInt(process.env.CODE_PET_PORT, 10) || 31425;
const IDLE_CLEANUP_ENABLED = process.env.CODE_PET_IDLE_CLEANUP === 'true';

let server = null;
let shutdownTimer = null;

const registry = new PetRegistry();

registry.onProjectAdded = (sessionKey, pet) => {
  logger.info(`New session registered: ${sessionKey} (${pet.displayName})`);
  resizeForPetCount(registry.size);
};

registry.onProjectRemoved = (sessionKey, count) => {
  logger.info(`Session removed: ${sessionKey} (${count} remaining)`);
  sendToRenderer('pet-remove', { project: sessionKey });
  resizeForPetCount(registry.size);
};

registry.onLabelChanged = (sessionKey, newLabel) => {
  sendToRenderer('pet-label-changed', { project: sessionKey, projectName: newLabel });
};

registry.onEmpty = () => {
  if (shutdownTimer) return;
  logger.info('No projects remaining — scheduling shutdown in 5s');
  shutdownTimer = setTimeout(() => {
    if (registry.size === 0) {
      logger.info('Shutdown timer fired — no projects, quitting');
      app.quit();
    }
  }, 5000);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX_BODY = 1024 * 1024; // 1MB
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        const err = new Error('Request body too large');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function dispatchEvent(sessionKey, projectPath, projectName, eventName) {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
    logger.info('Cancelled shutdown timer — event arrived');
  }

  const pet = registry.getOrCreate(sessionKey, projectPath, projectName);
  const result = pet.handleEvent(eventName);

  logger.info(`[${pet.displayName}] ${eventName} → ${JSON.stringify(result.response)}`);

  if (result.rendererState) {
    sendToRenderer('pet-event', {
      project: sessionKey,
      state: result.rendererState,
      projectName: pet.displayName,
      petType: pet.petType,
    });
  }

  if (result.action === 'remove_project') {
    registry.remove(sessionKey);
  }

  return result;
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      try {
        if (req.method === 'GET' && req.url === '/health') {
          if (!isRendererReady()) {
            sendJson(res, 503, { status: 'waiting', reason: 'renderer not ready' });
            return;
          }
          sendJson(res, 200, { status: 'ok' });
          return;
        }

        if (req.method === 'GET' && req.url.startsWith('/last-event')) {
          const parsed = url.parse(req.url, true);
          const sessionParam = parsed.query.session;
          const projectParam = parsed.query.project;
          if (sessionParam && registry.has(sessionParam)) {
            const pet = registry.get(sessionParam);
            const snap = pet.getSnapshot();
            sendJson(res, 200, {
              event: snap.lastEventName,
              timestamp: snap.lastEventTime,
              activeEvent: snap.lastActiveEvent,
            });
          } else if (projectParam) {
            // Return all sessions for a project
            const sessions = registry.getSessionsForProject(projectParam);
            const result = {};
            for (const sk of sessions) {
              const pet = registry.get(sk);
              if (pet) result[sk] = pet.getSnapshot();
            }
            sendJson(res, 200, { sessions: result });
          } else {
            // Return all projects state for debugging
            sendJson(res, 200, { projects: registry.getSnapshot() });
          }
          return;
        }

        if (req.method === 'POST' && req.url === '/event') {
          const body = await readBody(req);
          const eventName = body.event;
          const projectPath = body.project || 'unknown';
          const projectName = body.projectName || 'unknown';
          const sessionKey = PetRegistry.makeSessionKey(projectPath, body.claudePid);

          const pet = registry.getOrCreate(sessionKey, projectPath, projectName);
          pet.updateProcessInfo(body.claudePid, body.tty);
          if (body.permissionMode) pet.permissionMode = body.permissionMode;
          if (body.toolName) pet.recordToolUsage(body.toolName, body.toolInput);

          const result = dispatchEvent(sessionKey, projectPath, projectName, eventName);

          sendJson(res, result.statusCode, result.response);
          return;
        }

        if (req.method === 'POST' && req.url === '/shutdown') {
          sendJson(res, 200, { status: 'shutting-down' });
          logger.info('Shutdown requested via HTTP');
          setTimeout(() => app.quit(), 100);
          return;
        }

        sendJson(res, 404, { error: 'Not found' });
      } catch (err) {
        logger.error(`Server error: ${err.message}`);
        const status = err.statusCode || 500;
        sendJson(res, status, { error: err.message || 'Internal server error' });
      }
    });

    if (IDLE_CLEANUP_ENABLED) {
      registry.startCleanup();
      logger.info('Idle-session cleanup enabled (CODE_PET_IDLE_CLEANUP=true)');
    } else {
      logger.info('Idle-session cleanup disabled (default). Set CODE_PET_IDLE_CLEANUP=true to enable.');
    }

    server.listen(PORT, '127.0.0.1', () => {
      logger.info(`Event server listening on 127.0.0.1:${PORT}`);
      resolve(server);
    });

    server.on('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${PORT} in use, checking for stale process...`);
        const healthy = await healthCheck();
        if (healthy) {
          reject(new Error('Another Code Pet instance is already running'));
          return;
        }
        // Stale server — kill and retry once
        const pid = readPid();
        if (pid) killProcess(pid);
        removePid();
        setTimeout(() => {
          server.listen(PORT, '127.0.0.1', () => {
            logger.info(`Event server listening on 127.0.0.1:${PORT} (after retry)`);
            resolve(server);
          });
          server.once('error', (retryErr) => {
            logger.error(`Event server retry failed: ${retryErr.message}`);
            reject(retryErr);
          });
        }, 500);
      } else {
        logger.error(`Event server error: ${err.message}`);
        reject(err);
      }
    });
  });
}

function stopServer() {
  if (IDLE_CLEANUP_ENABLED) registry.stopCleanup();
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        logger.info('Event server closed');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function setUsageStore(store) {
  registry.setStore(store);
}

function setPetTypeForProject(projectPath, petType) {
  const sessions = registry.getSessionsForProject(projectPath);
  for (const sessionKey of sessions) {
    const pet = registry.get(sessionKey);
    if (pet) pet.petType = petType;
  }
}

function getSessionsForProject(projectPath) {
  return registry.getSessionsForProject(projectPath);
}

module.exports = {
  startServer,
  stopServer,
  dispatchEvent,
  setUsageStore,
  setPetTypeForProject,
  getSessionsForProject,
  getProjectsSnapshot: () => registry.getSnapshot(),
  getClaudePidForSession: (sk) => registry.getClaudePid(sk),
  getTtyForSession: (sk) => registry.getTty(sk),
  getToolUsageForSession: (sk) => {
    const pet = registry.get(sk);
    return pet ? pet.getUsageSnapshot() : { mcp: {}, skills: {} };
  },
  getToolEventsForSession: (sk) => {
    const pet = registry.get(sk);
    return pet ? pet.getUsageEvents() : [];
  },
  getAllPersistedEvents: async () => {
    const store = registry._store;
    if (!store || typeof store.readAll !== 'function') return [];
    try {
      return await store.readAll();
    } catch (err) {
      logger.warn(`getAllPersistedEvents failed: ${err.message}`);
      return [];
    }
  },
};

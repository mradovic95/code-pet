'use strict';

const http = require('http');
const url = require('url');
const { app } = require('electron');
const logger = require('./logger');
const { sendToRenderer, isRendererReady, resizeForPetCount } = require('./window-manager');
const PetRegistry = require('./pet-registry');

const PORT = parseInt(process.env.CODE_PET_PORT, 10) || 31425;

let server = null;
let shutdownTimer = null;

const registry = new PetRegistry();

registry.onProjectAdded = (projectPath, pet) => {
  logger.info(`New project registered: ${projectPath} (${pet.projectName})`);
  resizeForPetCount(registry.size);
};

registry.onProjectRemoved = (projectPath, count) => {
  logger.info(`Project removed: ${projectPath} (${count} remaining)`);
  sendToRenderer('pet-remove', { project: projectPath });
  resizeForPetCount(registry.size);
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
    req.on('data', (chunk) => chunks.push(chunk));
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

function dispatchEvent(projectPath, projectName, eventName) {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
    logger.info('Cancelled shutdown timer — event arrived');
  }

  const pet = registry.getOrCreate(projectPath, projectName);
  const result = pet.handleEvent(eventName);

  logger.info(`[${projectName}] ${eventName} → ${JSON.stringify(result.response)}`);

  if (result.rendererState) {
    sendToRenderer('pet-event', { project: projectPath, state: result.rendererState, projectName });
  }

  if (result.action === 'remove_project') {
    registry.remove(projectPath);
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
          const projectParam = parsed.query.project;
          if (projectParam && registry.has(projectParam)) {
            const pet = registry.get(projectParam);
            const snap = pet.getSnapshot();
            sendJson(res, 200, {
              event: snap.lastEventName,
              timestamp: snap.lastEventTime,
              activeEvent: snap.lastActiveEvent,
            });
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

          const pet = registry.getOrCreate(projectPath, projectName);
          pet.updateProcessInfo(body.claudePid, body.tty);

          const result = dispatchEvent(projectPath, projectName, eventName);

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
        sendJson(res, 500, { error: 'Internal server error' });
      }
    });

    registry.startCleanup();

    server.listen(PORT, '127.0.0.1', () => {
      logger.info(`Event server listening on 127.0.0.1:${PORT}`);
      resolve(server);
    });

    server.on('error', (err) => {
      logger.error(`Event server error: ${err.message}`);
      reject(err);
    });
  });
}

function stopServer() {
  registry.stopCleanup();
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

module.exports = {
  startServer,
  stopServer,
  dispatchEvent,
  getProjectsSnapshot: () => registry.getSnapshot(),
  getClaudePidForProject: (p) => registry.getClaudePid(p),
  getTtyForProject: (p) => registry.getTty(p),
};

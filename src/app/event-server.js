'use strict';

const http = require('http');
const url = require('url');
const { app } = require('electron');
const logger = require('./logger');
const { getWindow, sendToRenderer, isRendererReady, resizeForPetCount } = require('./window-manager');

const EVENT_TO_STATE = {
  awaken:           'waking_up',
  working_started:  'working',
  planning_started: 'planning',
  action_requested: 'waiting_for_action',
  work_finished:    'idle',
};
const PORT = parseInt(process.env.CODE_PET_PORT, 10) || 31425;

let server = null;

// Per-project state: Map<projectPath, { lastEventName, lastActiveEvent, lastEventTime, projectName }>
const projects = new Map();
let shutdownTimer = null;

function getOrCreateProject(projectPath, projectName) {
  if (projects.has(projectPath)) {
    const proj = projects.get(projectPath);
    // Cancel pending shutdown if a new event arrives
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
      logger.info('Cancelled shutdown timer — new event arrived');
    }
    // Update projectName if provided
    if (projectName) proj.projectName = projectName;
    return proj;
  }
  const proj = {
    lastEventName: null,
    lastActiveEvent: null,
    lastEventTime: 0,
    projectName: projectName || 'unknown',
    claudePid: null,
    tty: null,
  };
  projects.set(projectPath, proj);
  // Cancel pending shutdown
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
    logger.info('Cancelled shutdown timer — new project registered');
  }
  logger.info(`New project registered: ${projectPath} (${proj.projectName})`);
  resizeForPetCount(projects.size);
  return proj;
}

function removeProject(projectPath) {
  if (!projects.has(projectPath)) return;
  projects.delete(projectPath);
  logger.info(`Project removed: ${projectPath} (${projects.size} remaining)`);
  sendToRenderer('pet-remove', { project: projectPath });
  resizeForPetCount(projects.size);
  scheduleShutdownIfEmpty();
}

function scheduleShutdownIfEmpty() {
  if (projects.size > 0) return;
  if (shutdownTimer) return;
  logger.info('No projects remaining — scheduling shutdown in 5s');
  shutdownTimer = setTimeout(() => {
    if (projects.size === 0) {
      logger.info('Shutdown timer fired — no projects, quitting');
      app.quit();
    }
  }, 5000);
}

function getProjectsSnapshot() {
  const snapshot = {};
  for (const [path, state] of projects) {
    snapshot[path] = {
      lastEventName: state.lastEventName,
      lastActiveEvent: state.lastActiveEvent,
      lastEventTime: state.lastEventTime,
      projectName: state.projectName,
      claudePid: state.claudePid,
      tty: state.tty,
    };
  }
  return snapshot;
}

// Stale project cleanup: remove projects with no activity for 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [path, state] of projects) {
    if (now - state.lastEventTime > 30 * 60 * 1000) {
      logger.info(`Removing stale project: ${path} (last activity ${Math.round((now - state.lastEventTime) / 60000)}min ago)`);
      removeProject(path);
    }
  }
}, 60000);

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
          if (projectParam && projects.has(projectParam)) {
            const proj = projects.get(projectParam);
            sendJson(res, 200, {
              event: proj.lastEventName,
              timestamp: proj.lastEventTime,
              activeEvent: proj.lastActiveEvent,
            });
          } else {
            // Return all projects state for debugging
            sendJson(res, 200, { projects: getProjectsSnapshot() });
          }
          return;
        }

        if (req.method === 'POST' && req.url === '/event') {
          const body = await readBody(req);
          const eventName = body.event;
          const projectPath = body.project || 'unknown';
          const projectName = body.projectName || 'unknown';

          // Get or create per-project state
          const proj = getOrCreateProject(projectPath, projectName);

          // Update claudePid and tty on every event to keep them fresh
          if (body.claudePid) {
            proj.claudePid = body.claudePid;
          }
          if (body.tty) {
            proj.tty = body.tty;
          }

          // Handle question_answered: restore to previous active state
          if (eventName === 'question_answered') {
            if (proj.lastActiveEvent === 'working_started' || proj.lastActiveEvent === 'planning_started') {
              const restoredState = EVENT_TO_STATE[proj.lastActiveEvent];
              logger.info(`[${projectName}] question_answered → restoring to ${restoredState} (from ${proj.lastActiveEvent})`);
              proj.lastEventName = proj.lastActiveEvent;
              proj.lastEventTime = Date.now();
              sendToRenderer('pet-event', { project: projectPath, state: restoredState, projectName });
              sendJson(res, 200, { received: eventName, state: restoredState, restored: true });
            } else {
              logger.info(`[${projectName}] question_answered → no active state to restore, ignoring`);
              sendJson(res, 200, { received: eventName, ignored: true });
            }
            return;
          }

          // Handle falling_asleep: restore from waiting_for_action, suppress during active work, or remove project
          if (eventName === 'falling_asleep') {
            if (proj.lastEventName === 'action_requested' && proj.lastActiveEvent) {
              // Case 1: Pet is waiting for action with prior work state — restore to working/planning
              const restoredState = EVENT_TO_STATE[proj.lastActiveEvent];
              logger.info(`[${projectName}] falling_asleep during waiting_for_action → restoring to ${restoredState}`);
              proj.lastEventName = proj.lastActiveEvent;
              proj.lastEventTime = Date.now();
              sendToRenderer('pet-event', { project: projectPath, state: restoredState, projectName });
              sendJson(res, 200, { received: eventName, state: restoredState, restored: true });
            } else if (proj.lastActiveEvent) {
              // Case 2: Pet is actively working/planning — suppress (spurious SessionEnd)
              logger.info(`[${projectName}] Suppressing falling_asleep — active state (lastActive=${proj.lastActiveEvent})`);
              sendJson(res, 200, { received: eventName, suppressed: true });
            } else {
              // Case 3: No active state — remove this project's pet
              logger.info(`[${projectName}] falling_asleep → removing project (no active state)`);
              removeProject(projectPath);
              sendJson(res, 200, { received: eventName, removed: true });
            }
            return;
          }

          const state = EVENT_TO_STATE[eventName];
          if (!state) {
            sendJson(res, 400, {
              error: 'Invalid event',
              valid: [...Object.keys(EVENT_TO_STATE), 'question_answered', 'falling_asleep'],
            });
            return;
          }

          // Handle awaken: suppress if project already has active state or waiting_for_action
          if (eventName === 'awaken') {
            if (proj.lastActiveEvent !== null || proj.lastEventName === 'action_requested') {
              logger.info(`[${projectName}] Suppressing awaken — non-zero state (lastActive=${proj.lastActiveEvent}, lastEvent=${proj.lastEventName})`);
              sendJson(res, 200, { received: eventName, state, suppressed: true });
              return;
            }
          }

          proj.lastEventName = eventName;
          proj.lastEventTime = Date.now();

          // Track last active work event for state restoration
          if (eventName === 'working_started' || eventName === 'planning_started') {
            proj.lastActiveEvent = eventName;
          }
          // Reset on terminal event
          if (eventName === 'work_finished') {
            proj.lastActiveEvent = null;
          }

          logger.info(`[${projectName}] Received event: ${eventName} → state: ${state}`);

          sendToRenderer('pet-event', { project: projectPath, state, projectName });

          sendJson(res, 200, { received: eventName, state });
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

function getClaudePidForProject(projectPath) {
  const proj = projects.get(projectPath);
  return proj ? proj.claudePid : null;
}

function getTtyForProject(projectPath) {
  const proj = projects.get(projectPath);
  return proj ? proj.tty : null;
}

module.exports = { startServer, stopServer, getProjectsSnapshot, getClaudePidForProject, getTtyForProject };

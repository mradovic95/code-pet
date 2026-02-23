'use strict';

const http = require('http');
const { app } = require('electron');
const logger = require('./logger');
const { getWindow, sendToRenderer, isRendererReady } = require('./window-manager');

const EVENT_TO_STATE = {
  awaken:           'waking_up',
  working_started:  'working',
  planning_started: 'planning',
  action_requested: 'waiting_for_action',
  work_finished:    'idle',
};
const PORT = parseInt(process.env.CODE_PET_PORT, 10) || 31425;

let server = null;
let lastEventName = null;
let lastEventTime = 0;
let lastActiveEvent = null;

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

        if (req.method === 'GET' && req.url === '/last-event') {
          sendJson(res, 200, { event: lastEventName, timestamp: lastEventTime, activeEvent: lastActiveEvent });
          return;
        }

        if (req.method === 'POST' && req.url === '/event') {
          const body = await readBody(req);
          const eventName = body.event;

          // Handle question_answered: restore to previous active state
          if (eventName === 'question_answered') {
            if (lastActiveEvent === 'working_started' || lastActiveEvent === 'planning_started') {
              const restoredState = EVENT_TO_STATE[lastActiveEvent];
              logger.info(`question_answered → restoring to ${restoredState} (from ${lastActiveEvent})`);
              lastEventName = lastActiveEvent;
              lastEventTime = Date.now();
              sendToRenderer('dog-event', restoredState);
              sendJson(res, 200, { received: eventName, state: restoredState, restored: true });
            } else {
              logger.info(`question_answered → no active state to restore, ignoring`);
              sendJson(res, 200, { received: eventName, ignored: true });
            }
            return;
          }

          // Handle falling_asleep: restore from waiting_for_action, suppress during active work, or track for shutdown
          if (eventName === 'falling_asleep') {
            if (lastEventName === 'action_requested' && lastActiveEvent) {
              // Case 1: Pet is waiting for action with prior work state — restore to working/planning
              const restoredState = EVENT_TO_STATE[lastActiveEvent];
              logger.info(`falling_asleep during waiting_for_action → restoring to ${restoredState} (from ${lastActiveEvent})`);
              lastEventName = lastActiveEvent;
              lastEventTime = Date.now();
              sendToRenderer('dog-event', restoredState);
              sendJson(res, 200, { received: eventName, state: restoredState, restored: true });
            } else if (lastActiveEvent) {
              // Case 2: Pet is actively working/planning — suppress (spurious SessionEnd after AskQuestion/permission answer)
              logger.info(`Suppressing falling_asleep — active state (lastActive=${lastActiveEvent}, lastEvent=${lastEventName})`);
              sendJson(res, 200, { received: eventName, suppressed: true });
            } else {
              // Case 3: No active state — track for shutdown (on-session-end.js will check /last-event)
              logger.info(`falling_asleep → tracked for shutdown (no active state)`);
              lastEventName = 'falling_asleep';
              lastEventTime = Date.now();
              sendJson(res, 200, { received: eventName, tracked: true });
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

          // Handle awaken: suppress if any active state or waiting_for_action
          if (eventName === 'awaken') {
            if (lastActiveEvent !== null || lastEventName === 'action_requested') {
              logger.info(`Suppressing awaken — non-zero state (lastActive=${lastActiveEvent}, lastEvent=${lastEventName})`);
              sendJson(res, 200, { received: eventName, state, suppressed: true });
              return;
            }
          }

          lastEventName = eventName;
          lastEventTime = Date.now();

          // Track last active work event for state restoration
          if (eventName === 'working_started' || eventName === 'planning_started') {
            lastActiveEvent = eventName;
          }
          // Reset on terminal event
          if (eventName === 'work_finished') {
            lastActiveEvent = null;
          }

          logger.info(`Received event: ${eventName} → state: ${state}`);

          sendToRenderer('dog-event', state);

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

module.exports = { startServer, stopServer };

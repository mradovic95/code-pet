'use strict';

const http = require('http');
const { app } = require('electron');
const logger = require('./logger');
const { getWindow, sendToRenderer, isRendererReady } = require('./window-manager');

const EVENT_TO_STATE = {
  awaken:           'waking_up',
  falling_asleep:   'going_to_sleep',
  working_started:  'working',
  planning_started: 'planning',
  action_requested: 'waiting_for_action',
  work_finished:    'idle',
};
const PORT = parseInt(process.env.CODE_PET_PORT, 10) || 31425;
const SLEEP_GRACE_MS = 2000;

let server = null;
let sleepGraceTimer = null;
let sleepGracePending = false;
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

function cancelSleepGrace() {
  if (sleepGraceTimer) {
    clearTimeout(sleepGraceTimer);
    sleepGraceTimer = null;
  }
  sleepGracePending = false;
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

          const state = EVENT_TO_STATE[eventName];
          if (!state) {
            sendJson(res, 400, {
              error: 'Invalid event',
              valid: Object.keys(EVENT_TO_STATE),
            });
            return;
          }

          lastEventName = eventName;
          lastEventTime = Date.now();

          // Track last active work event for state restoration
          if (eventName === 'working_started' || eventName === 'planning_started') {
            lastActiveEvent = eventName;
          }
          // Reset on lifecycle/terminal events
          if (eventName === 'work_finished' || eventName === 'falling_asleep' || eventName === 'awaken') {
            lastActiveEvent = null;
          }

          logger.info(`Received event: ${eventName} → state: ${state}`);

          if (eventName === 'falling_asleep') {
            // Start grace period — don't forward yet
            cancelSleepGrace();
            sleepGracePending = true;
            sleepGraceTimer = setTimeout(() => {
              sleepGracePending = false;
              sleepGraceTimer = null;
              logger.info('Sleep grace expired → forwarding going_to_sleep');
              sendToRenderer('dog-event', 'going_to_sleep');
            }, SLEEP_GRACE_MS);
            sendJson(res, 200, { received: eventName, state, grace: true });
            return;
          }

          if (eventName === 'awaken' && sleepGracePending) {
            // Awaken during grace — cancel sleep, don't forward either event
            cancelSleepGrace();
            logger.info('Awaken during sleep grace — cancelled sleep, skipping waking_up');
            sendJson(res, 200, { received: eventName, state, graceCancelled: true });
            return;
          }

          // Any other event cancels a pending sleep grace
          if (sleepGracePending) {
            cancelSleepGrace();
            logger.info(`Event ${eventName} cancelled pending sleep grace`);
          }

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

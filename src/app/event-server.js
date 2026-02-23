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

let server = null;

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

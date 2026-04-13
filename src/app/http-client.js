'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const logger = require('./logger');

const DEFAULT_TIMEOUT = 15000;
const MAX_REDIRECTS = 5;

/**
 * Low-level request. Returns { statusCode, headers, body }.
 * body is a Buffer when binary=true, otherwise a string.
 */
function request({ url, method = 'GET', headers = {}, body, timeout = DEFAULT_TIMEOUT, binary = false, _redirectCount = 0 }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...headers },
      timeout,
    };

    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      const json = JSON.stringify(body);
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(json);
      body = json;
    }

    const req = transport.request(opts, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (_redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects (${MAX_REDIRECTS})`));
          return;
        }
        const redirectUrl = new URL(res.headers.location, url).href;
        // 303 always becomes GET; others preserve method
        const redirectMethod = res.statusCode === 303 ? 'GET' : method;
        resolve(request({
          url: redirectUrl,
          method: redirectMethod,
          headers,
          body: redirectMethod === 'GET' ? undefined : body,
          timeout,
          binary,
          _redirectCount: _redirectCount + 1,
        }));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: binary ? raw : raw.toString('utf8'),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms: ${method} ${url}`));
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function getJson(url, headers = {}) {
  headers['Accept'] = headers['Accept'] || 'application/json';
  const res = await request({ url, method: 'GET', headers });
  if (res.statusCode >= 400) {
    const err = new Error(`HTTP ${res.statusCode}: ${res.body.slice(0, 200)}`);
    err.statusCode = res.statusCode;
    err.body = res.body;
    throw err;
  }
  return JSON.parse(res.body);
}

async function postJson(url, body, headers = {}) {
  headers['Accept'] = headers['Accept'] || 'application/json';
  const res = await request({ url, method: 'POST', headers, body });
  if (res.statusCode >= 400) {
    const err = new Error(`HTTP ${res.statusCode}: ${res.body.slice(0, 200)}`);
    err.statusCode = res.statusCode;
    err.body = res.body;
    throw err;
  }
  return JSON.parse(res.body);
}

async function getBinary(url, headers = {}) {
  const res = await request({ url, method: 'GET', headers, binary: true });
  if (res.statusCode >= 400) {
    const err = new Error(`HTTP ${res.statusCode} downloading ${url}`);
    err.statusCode = res.statusCode;
    throw err;
  }
  return res.body; // Buffer
}

module.exports = { request, getJson, postJson, getBinary };

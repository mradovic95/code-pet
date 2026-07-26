'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { getJson, postJson, getBinary } = require('../../../src/app/marketplace/http-client');

describe('http-client', () => {
  let server;
  let port;
  let handler;

  beforeEach(async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    };
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        req._body = body;
        handler(req, res);
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  describe('getJson', () => {
    it('parses JSON response', async () => {
      // GIVEN
      handler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: 'test' }));
      };

      // WHEN
      const sut = await getJson(`http://127.0.0.1:${port}/api/test`);

      // THEN
      assert.deepEqual(sut, { name: 'test' });
    });

    it('throws on 4xx status', async () => {
      // GIVEN
      handler = (_req, res) => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"error":"not found"}');
      };

      // WHEN / THEN
      await assert.rejects(
        () => getJson(`http://127.0.0.1:${port}/missing`),
        (err) => {
          assert.equal(err.statusCode, 404);
          return true;
        }
      );
    });
  });

  describe('postJson', () => {
    it('sends JSON body and parses response', async () => {
      // GIVEN
      let receivedBody;
      handler = (req, res) => {
        receivedBody = JSON.parse(req._body);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      };

      // WHEN
      const sut = await postJson(`http://127.0.0.1:${port}/api/create`, { machineId: 'abc123' });

      // THEN
      assert.deepEqual(sut, { success: true });
      assert.deepEqual(receivedBody, { machineId: 'abc123' });
    });
  });

  describe('getBinary', () => {
    it('returns Buffer for binary content', async () => {
      // GIVEN
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      handler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(binaryData);
      };

      // WHEN
      const sut = await getBinary(`http://127.0.0.1:${port}/asset.png`);

      // THEN
      assert.ok(Buffer.isBuffer(sut));
      assert.deepEqual(sut, binaryData);
    });
  });

  describe('redirects', () => {
    it('follows 302 redirect', async () => {
      // GIVEN
      let requestCount = 0;
      handler = (_req, res) => {
        requestCount++;
        if (requestCount === 1) {
          res.writeHead(302, { Location: `http://127.0.0.1:${port}/final` });
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ redirected: true }));
        }
      };

      // WHEN
      const sut = await getJson(`http://127.0.0.1:${port}/start`);

      // THEN
      assert.deepEqual(sut, { redirected: true });
      assert.equal(requestCount, 2);
    });
  });
});

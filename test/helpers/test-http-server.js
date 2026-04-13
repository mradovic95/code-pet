'use strict';

const http = require('http');

class TestHttpServer {
  constructor() {
    this._requests = [];
    this._server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        this._requests.push({
          method: req.method,
          url: req.url,
          body: parsed,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
  }

  async start() {
    await new Promise((resolve) =>
      this._server.listen(0, '127.0.0.1', resolve)
    );
    return this._server.address().port;
  }

  getRequests() {
    return this._requests.slice();
  }

  reset() {
    this._requests = [];
  }

  async close() {
    await new Promise((resolve) => this._server.close(resolve));
  }
}

module.exports = TestHttpServer;

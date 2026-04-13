'use strict';

const { setupMocks } = require('../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PRODUCT_MAP_FILE = path.join(os.homedir(), '.code-pet', 'product-map.json');

describe('MarketplaceAPI', () => {
  let server;
  let port;
  let routes;
  let originalProductMap;
  let productMapExisted;

  beforeEach(async () => {
    routes = {};
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        const key = `${req.method} ${req.url.split('?')[0]}`;
        const handler = routes[key];
        if (handler) {
          handler(req, res, body);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    // Preserve existing product map
    productMapExisted = fs.existsSync(PRODUCT_MAP_FILE);
    if (productMapExisted) {
      originalProductMap = fs.readFileSync(PRODUCT_MAP_FILE, 'utf8');
    }

    // Clear require cache
    delete require.cache[require.resolve('../../src/app/marketplace-api')];
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    // Restore product map
    if (productMapExisted) {
      fs.writeFileSync(PRODUCT_MAP_FILE, originalProductMap);
    } else if (fs.existsSync(PRODUCT_MAP_FILE)) {
      fs.unlinkSync(PRODUCT_MAP_FILE);
    }
  });

  function createSut() {
    const { MarketplaceAPI } = require('../../src/app/marketplace-api');
    return new MarketplaceAPI({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: 'test-api-key',
      marketplaceId: 1,
    });
  }

  describe('getCatalog', () => {
    it('fetches products and maps to pet catalog format', async () => {
      // GIVEN
      routes['GET /api/v1/products'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          { id: 10, name: 'Dragon', description: 'A fiery pet', tier: 'PREMIUM', priceCents: 299, status: 'ACTIVE' },
          { id: 20, name: 'Cat', description: 'A free cat', tier: 'FREE', priceCents: 0, status: 'ACTIVE' },
        ]));
      };
      const sut = createSut();

      // WHEN
      const catalog = await sut.getCatalog();

      // THEN
      assert.equal(catalog.length, 2);
      assert.equal(catalog[0].id, 'dragon');
      assert.equal(catalog[0].name, 'Dragon');
      assert.equal(catalog[0].price, '$2.99');
      assert.equal(catalog[0].tier, 'premium');
      assert.equal(catalog[0].productId, 10);
      assert.equal(catalog[1].id, 'cat');
      assert.equal(catalog[1].price, 'Free');
      assert.equal(catalog[1].tier, 'free');
    });

    it('builds product ID to pet ID map', async () => {
      // GIVEN
      routes['GET /api/v1/products'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          { id: 10, name: 'Dragon', description: '', tier: 'PREMIUM', priceCents: 299 },
        ]));
      };
      const sut = createSut();

      // WHEN
      await sut.getCatalog();

      // THEN
      assert.equal(sut.getProductIdForPet('dragon'), 10);
    });
  });

  describe('activate', () => {
    it('calls activation endpoint and resolves product IDs to pet IDs', async () => {
      // GIVEN
      routes['GET /api/v1/products'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          { id: 10, name: 'Dragon', description: '', tier: 'PREMIUM', priceCents: 299 },
        ]));
      };
      let activationBody;
      routes['POST /api/v1/licenses/TEST-KEY/activations'] = (req, res, body) => {
        activationBody = JSON.parse(body);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ownedProductIds: [10] }));
      };
      const sut = createSut();

      // WHEN
      const result = await sut.activate('TEST-KEY', 'machine-abc');

      // THEN
      assert.equal(result.success, true);
      assert.deepEqual(result.ownedPets, ['dragon']);
      assert.deepEqual(activationBody, { machineId: 'machine-abc' });
    });
  });

  describe('validate', () => {
    it('calls validation endpoint and resolves product IDs', async () => {
      // GIVEN
      routes['GET /api/v1/products'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          { id: 10, name: 'Dragon', description: '', tier: 'PREMIUM', priceCents: 299 },
        ]));
      };
      routes['POST /api/v1/licenses/TEST-KEY/validations'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: true, ownedProductIds: [10] }));
      };
      const sut = createSut();

      // WHEN
      const result = await sut.validate('TEST-KEY', 'machine-abc');

      // THEN
      assert.equal(result.valid, true);
      assert.deepEqual(result.ownedPets, ['dragon']);
    });
  });

  describe('purchase', () => {
    it('returns license key for free product', async () => {
      // GIVEN
      routes['GET /api/v1/products'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          { id: 20, name: 'Cat', description: '', tier: 'FREE', priceCents: 0 },
        ]));
      };
      routes['POST /api/v1/products/20/purchases'] = (_req, res) => {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ purchaseId: 1, licenseKey: 'ABCD-EFGH-IJKL-MNOP', paymentUrl: null }));
      };
      const sut = createSut();
      await sut.getCatalog();

      // WHEN
      const result = await sut.purchase('cat');

      // THEN
      assert.equal(result.success, true);
      assert.equal(result.licenseKey, 'ABCD-EFGH-IJKL-MNOP');
    });

    it('returns payment URL for premium product', async () => {
      // GIVEN
      routes['GET /api/v1/products'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          { id: 10, name: 'Dragon', description: '', tier: 'PREMIUM', priceCents: 299 },
        ]));
      };
      routes['POST /api/v1/products/10/purchases'] = (_req, res) => {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          purchaseId: 2,
          licenseKey: null,
          paymentUrl: 'https://paypal.com/checkout?token=PAY-TOKEN-123',
        }));
      };
      const sut = createSut();
      await sut.getCatalog();

      // WHEN
      const result = await sut.purchase('dragon');

      // THEN
      assert.equal(result.success, true);
      assert.equal(result.licenseKey, null);
      assert.equal(result.paymentPending, undefined); // that's added by window-manager
      assert.equal(result.paymentToken, 'PAY-TOKEN-123');
      assert.ok(result.paymentUrl.includes('paypal.com'));
    });
  });

  describe('checkPaymentStatus', () => {
    it('returns completed with license key on success', async () => {
      // GIVEN
      routes['GET /api/v1/purchases/payment-success'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ purchaseId: 2, licenseKey: 'WXYZ-1234', productId: 10 }));
      };
      const sut = createSut();

      // WHEN
      const result = await sut.checkPaymentStatus('PAY-TOKEN-123');

      // THEN
      assert.equal(result.completed, true);
      assert.equal(result.licenseKey, 'WXYZ-1234');
    });
  });

  describe('downloadAsset', () => {
    it('returns binary buffer from asset endpoint', async () => {
      // GIVEN
      const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      routes['GET /api/v1/products/10/assets/idle.png'] = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(pngData);
      };
      const sut = createSut();

      // WHEN
      const result = await sut.downloadAsset(10, 'idle.png', 'LICENSE-KEY');

      // THEN
      assert.ok(Buffer.isBuffer(result));
      assert.deepEqual(result, pngData);
    });
  });
});

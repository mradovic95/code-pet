'use strict';

const { setupMocks } = require('../helpers/mock-modules');
setupMocks();

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CODE_PET_DIR = path.join(os.homedir(), '.code-pet');
const LICENSE_FILE = path.join(CODE_PET_DIR, 'license.json');
const PRODUCT_MAP_FILE = path.join(CODE_PET_DIR, 'product-map.json');
const TEST_PETS_DIR = path.join(os.tmpdir(), 'code-pet-test-pets');

describe('marketplace end-to-end flow', () => {
  let server;
  let port;
  let routes;
  let receivedHeaders;
  const backups = {};

  beforeEach(async () => {
    routes = {};
    receivedHeaders = {};
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        const key = `${req.method} ${req.url.split('?')[0]}`;
        receivedHeaders[key] = req.headers;
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

    backups.license = fs.existsSync(LICENSE_FILE) ? fs.readFileSync(LICENSE_FILE, 'utf8') : null;
    backups.productMap = fs.existsSync(PRODUCT_MAP_FILE) ? fs.readFileSync(PRODUCT_MAP_FILE, 'utf8') : null;
    if (fs.existsSync(LICENSE_FILE)) fs.unlinkSync(LICENSE_FILE);
    if (fs.existsSync(PRODUCT_MAP_FILE)) fs.unlinkSync(PRODUCT_MAP_FILE);
    if (fs.existsSync(TEST_PETS_DIR)) {
      fs.rmSync(TEST_PETS_DIR, { recursive: true, force: true });
    }

    delete require.cache[require.resolve('../../src/app/marketplace/marketplace-api')];
    delete require.cache[require.resolve('../../src/app/marketplace/license-manager')];
    delete require.cache[require.resolve('../../src/app/marketplace/premium-store')];
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (backups.license) fs.writeFileSync(LICENSE_FILE, backups.license);
    else if (fs.existsSync(LICENSE_FILE)) fs.unlinkSync(LICENSE_FILE);
    if (backups.productMap) fs.writeFileSync(PRODUCT_MAP_FILE, backups.productMap);
    else if (fs.existsSync(PRODUCT_MAP_FILE)) fs.unlinkSync(PRODUCT_MAP_FILE);
    if (fs.existsSync(TEST_PETS_DIR)) {
      fs.rmSync(TEST_PETS_DIR, { recursive: true, force: true });
    }
  });

  it('wires browse → purchase → activate → download against a deployed-like API', async () => {
    // GIVEN a marketplace with one FREE product (Cat, id 20)
    routes['GET /api/v1/products'] = (req, res) => {
      assert.ok(req.url.includes('marketplaceId=1'), `expected marketplaceId=1 in ${req.url}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { id: 20, name: 'Cat', description: 'free cat', tier: 'FREE', priceCents: 0, status: 'ACTIVE' },
      ]));
    };
    let purchaseBody;
    routes['POST /api/v1/products/20/purchases'] = (_req, res, body) => {
      purchaseBody = JSON.parse(body);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ purchaseId: 1, licenseKey: 'LICENSE-FOR-CAT', paymentUrl: null }));
    };
    let activationBody;
    routes['POST /api/v1/licenses/LICENSE-FOR-CAT/activations'] = (_req, res, body) => {
      activationBody = JSON.parse(body);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ownedProductIds: [20] }));
    };
    routes['GET /api/v1/products/20/assets/manifest.json'] = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        icon: 'icon.png',
        sprites: { idle: { file: 'idle.svg', width: 64, height: 64 } },
      }));
    };
    const spriteBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    routes['GET /api/v1/products/20/assets/idle.svg'] = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(spriteBytes);
    };
    const iconBytes = Buffer.from('PNG-fake-bytes');
    routes['GET /api/v1/products/20/assets/icon.png'] = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(iconBytes);
    };

    const { MarketplaceAPI } = require('../../src/app/marketplace/marketplace-api');
    const LicenseManager = require('../../src/app/marketplace/license-manager');
    const PremiumStore = require('../../src/app/marketplace/premium-store');

    const api = new MarketplaceAPI({
      baseUrl: `http://127.0.0.1:${port}`,
      marketplaceId: 1,
    });
    const licenseManager = new LicenseManager(api);
    licenseManager.load();
    const premiumStore = new PremiumStore(TEST_PETS_DIR);

    // WHEN the user browses the catalog
    const catalog = await api.getCatalog();
    const cat = catalog.find(p => p.id === 'cat');

    // THEN the catalog is mapped correctly and the product-id map is primed
    assert.equal(cat.name, 'Cat');
    assert.equal(cat.tier, 'free');
    assert.equal(api.getProductIdForPet('cat'), 20);

    // WHEN the user purchases with an email
    const purchaseResult = await api.purchase('cat', 'buyer@example.com');

    // THEN the buyer email is forwarded to the marketplace
    assert.equal(purchaseResult.success, true);
    assert.equal(purchaseResult.licenseKey, 'LICENSE-FOR-CAT');
    assert.deepEqual(purchaseBody, { buyerEmail: 'buyer@example.com' });

    // WHEN the user activates the license
    const activationResult = await licenseManager.activate(purchaseResult.licenseKey);

    // THEN the license is persisted and owned pets include the purchased one
    assert.equal(activationResult.success, true);
    assert.deepEqual(activationResult.ownedPets, ['cat']);
    assert.deepEqual(activationBody, { machineId: licenseManager.getMachineId() });
    assert.equal(licenseManager.isOwned('cat'), true);
    assert.ok(fs.existsSync(LICENSE_FILE));

    // WHEN sprites are downloaded
    await premiumStore.download('cat', purchaseResult.licenseKey, api, 20);

    // THEN the download used X-License-Key for auth and wrote the pet into the shared pets folder
    assert.equal(
      receivedHeaders['GET /api/v1/products/20/assets/idle.svg']['x-license-key'],
      purchaseResult.licenseKey,
    );
    assert.equal(premiumStore.isDownloaded('cat'), true);
    const petDir = path.join(TEST_PETS_DIR, 'cat');
    assert.ok(fs.existsSync(path.join(petDir, 'manifest.json')), 'manifest.json should be on disk');
    const diskSprite = fs.readFileSync(path.join(petDir, 'idle.svg'));
    assert.deepEqual(diskSprite, spriteBytes, 'sprite on disk should match bytes served by the API');
    const diskIcon = fs.readFileSync(path.join(petDir, 'icon.png'));
    assert.deepEqual(diskIcon, iconBytes, 'icon.png should be downloaded alongside sprites');
  });
});

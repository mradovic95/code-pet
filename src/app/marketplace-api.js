'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const { getJson, postJson, getBinary } = require('./http-client');
const logger = require('./logger');

const PRODUCT_MAP_FILE = path.join(os.homedir(), '.code-pet', 'product-map.json');

/**
 * Real marketplace API client.
 * Same interface as MockLicenseAPI: activate, validate, getCatalog, purchase.
 */
class MarketplaceAPI {
  constructor(config) {
    this._baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
    this._marketplaceId = config.marketplaceId || null;
    this._jwtToken = config.jwtToken || null;

    // Bidirectional product ID <-> pet ID map
    this._productToPet = new Map(); // productId (number) -> petId (string)
    this._petToProduct = new Map(); // petId (string) -> productId (number)

    this._loadProductMap();
  }

  // --- Public interface (matches MockLicenseAPI) ---

  async activate(key, machineId) {
    await this.getCatalog();

    try {
      const url = `${this._baseUrl}/api/v1/licenses/${encodeURIComponent(key)}/activations`;
      const result = await postJson(url, { machineId });

      const ownedPets = this._resolveProductIds(result.ownedProductIds || []);
      return {
        success: result.success !== false,
        ownedPets,
        activationId: key.slice(0, 16),
      };
    } catch (err) {
      logger.warn(`Marketplace activate failed: ${err.message}`);
      return { success: false, ownedPets: [], activationId: null, error: err.message };
    }
  }

  async validate(key, machineId) {
    await this.getCatalog();

    try {
      const url = `${this._baseUrl}/api/v1/licenses/${encodeURIComponent(key)}/validations`;
      const result = await postJson(url, { machineId });

      const ownedPets = this._resolveProductIds(result.ownedProductIds || []);
      return { valid: result.valid !== false, ownedPets };
    } catch (err) {
      logger.warn(`Marketplace validate failed: ${err.message}`);
      throw err; // Let LicenseManager handle offline grace period
    }
  }

  async getCatalog() {
    try {
      let url = `${this._baseUrl}/api/v1/products?status=ACTIVE`;
      if (this._marketplaceId) {
        url += `&marketplaceId=${this._marketplaceId}`;
      }

      const products = await getJson(url);
      this._buildProductMap(products);

      return products.map(p => ({
        id: this._derivePetId(p),
        name: p.name,
        description: p.description,
        price: this._formatPrice(p.priceCents),
        tier: (p.tier || 'free').toLowerCase(),
        previewUrl: this._toAbsolute(p.previewUrl),
        thumbnailUrl: this._toAbsolute(p.thumbnailUrl),
        productId: p.id,
      }));
    } catch (err) {
      logger.warn(`Marketplace getCatalog failed: ${err.message}`);
      return [];
    }
  }

  async purchase(petId, buyerEmail) {
    if (typeof buyerEmail !== 'string' || buyerEmail.trim() === '') {
      return { success: false, error: 'buyerEmail required' };
    }

    const productId = this._petToProduct.get(petId);
    if (!productId) {
      return { success: false, error: `Unknown pet "${petId}"` };
    }

    try {
      const url = `${this._baseUrl}/api/v1/products/${productId}/purchases`;
      const result = await postJson(url, { buyerEmail: buyerEmail.trim() }, this._bearerHeaders());

      if (result.licenseKey) {
        // Free product — license returned immediately
        return { success: true, licenseKey: result.licenseKey };
      }

      if (result.paymentUrl) {
        // Paid product — PayPal redirect needed
        const token = this._extractToken(result.paymentUrl);
        return {
          success: true,
          licenseKey: null,
          paymentUrl: result.paymentUrl,
          paymentToken: token,
          purchaseId: result.purchaseId,
        };
      }

      return { success: false, error: 'Unexpected purchase response' };
    } catch (err) {
      logger.warn(`Marketplace purchase failed for "${petId}": ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // --- Additional methods (not on MockLicenseAPI) ---

  async downloadAsset(productId, filename, licenseKey) {
    const url = `${this._baseUrl}/api/v1/products/${productId}/assets/${encodeURIComponent(filename)}`;
    return getBinary(url, { 'X-License-Key': licenseKey });
  }

  async checkPaymentStatus(token) {
    try {
      const url = `${this._baseUrl}/api/v1/purchases/payment-success?token=${encodeURIComponent(token)}`;
      const result = await getJson(url);

      if (result.licenseKey) {
        return { completed: true, licenseKey: result.licenseKey, productId: result.productId };
      }
      return { completed: false };
    } catch (err) {
      logger.warn(`Payment status check failed: ${err.message}`);
      return { completed: false };
    }
  }

  getProductIdForPet(petId) {
    return this._petToProduct.get(petId) || null;
  }

  // --- Private helpers ---

  _bearerHeaders() {
    const h = {};
    if (this._jwtToken) h['Authorization'] = `Bearer ${this._jwtToken}`;
    return h;
  }

  _derivePetId(product) {
    // Convention: product name lowercased, spaces to hyphens
    return (product.name || 'unknown').toLowerCase().replace(/\s+/g, '-');
  }

  _formatPrice(priceCents) {
    if (!priceCents || priceCents === 0) return 'Free';
    return `$${(priceCents / 100).toFixed(2)}`;
  }

  _toAbsolute(url) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return `${this._baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  _extractToken(paymentUrl) {
    try {
      const url = new URL(paymentUrl);
      return url.searchParams.get('token') || null;
    } catch {
      return null;
    }
  }

  _buildProductMap(products) {
    for (const p of products) {
      const petId = this._derivePetId(p);
      this._productToPet.set(p.id, petId);
      this._petToProduct.set(petId, p.id);
    }
    this._persistProductMap();
  }

  _resolveProductIds(productIds) {
    return productIds
      .map(id => this._productToPet.get(id))
      .filter(Boolean);
  }

  _loadProductMap() {
    try {
      if (fs.existsSync(PRODUCT_MAP_FILE)) {
        const data = JSON.parse(fs.readFileSync(PRODUCT_MAP_FILE, 'utf8'));
        for (const [productId, petId] of Object.entries(data)) {
          this._productToPet.set(Number(productId), petId);
          this._petToProduct.set(petId, Number(productId));
        }
      }
    } catch (err) {
      logger.warn(`Failed to load product map: ${err.message}`);
    }
  }

  _persistProductMap() {
    try {
      const dir = path.dirname(PRODUCT_MAP_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const obj = {};
      for (const [k, v] of this._productToPet.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(PRODUCT_MAP_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
      logger.warn(`Failed to persist product map: ${err.message}`);
    }
  }
}

module.exports = { MarketplaceAPI };

'use strict';

const path = require('path');
const { app } = require('electron');
const { createOverlayWindow, closeSettingsWindow, setProjectsSnapshotFn, setClaudePidFn, setTtyFn, setDispatchEventFn, setCatalogFn, setUpdatePetTypeFn, setCatalogObj, setLicenseManagerFn, setPremiumStoreFn, setMarketplaceCatalogFn, setLicenseApiFn, setToolUsageFn, setToolEventsFn, setAllUsageEventsFn, setSessionsForProjectFn, sendToRenderer } = require('./window-manager');
const { startServer, stopServer, dispatchEvent, setUsageStore, setPetTypeForProject, getSessionsForProject, getProjectsSnapshot, getClaudePidForSession, getTtyForSession, getToolUsageForSession, getToolEventsForSession, getAllPersistedEvents } = require('./event-server');
const { writePid, removePid } = require('./process-manager');
const PetCatalog = require('./pet-catalog');
const settingsStore = require('./settings-store');
const LicenseManager = require('./license-manager');
const PremiumStore = require('./premium-store');
const MarketplaceCatalog = require('./marketplace-catalog');
const { MockLicenseAPI } = require('./license-api');
const { MarketplaceAPI } = require('./marketplace-api');
const marketplaceConfig = require('./marketplace-config');
const { createStore } = require('../tracking');
const logger = require('./logger');

// Persistent usage store — `USAGE_STORE_TYPE=memory` disables persistence.
const usageStore = createStore({ type: process.env.USAGE_STORE_TYPE || 'filesystem' });

// Linux transparency support
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.commandLine.appendSwitch('disable-gpu');
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn('Another instance is already running, quitting');
  app.quit();
} else {
  app.on('ready', async () => {
    logger.info('App ready, starting up...');

    settingsStore.load();
    setUsageStore(usageStore);

    // Initialize license system — use real API if configured, else mock
    const mpConfig = marketplaceConfig.load();
    const licenseApi = marketplaceConfig.isConfigured()
      ? new MarketplaceAPI(mpConfig)
      : new MockLicenseAPI();
    logger.info(`License API: ${marketplaceConfig.isConfigured() ? 'MarketplaceAPI' : 'MockLicenseAPI'}`);
    const licenseManager = new LicenseManager(licenseApi);
    licenseManager.load();
    const premiumStore = new PremiumStore();
    const marketplaceCatalog = new MarketplaceCatalog(licenseApi);

    const catalog = new PetCatalog();
    catalog.scan(path.join(__dirname, '..', '..', 'assets', 'pets'));

    // Scan premium pets if any are downloaded
    catalog.scanPremium(premiumStore.getPremiumDir());

    writePid(process.pid);

    try {
      await startServer();
    } catch (err) {
      logger.error(`Failed to start event server: ${err.message}`);
      app.quit();
      return;
    }

    setProjectsSnapshotFn(getProjectsSnapshot);
    setClaudePidFn(getClaudePidForSession);
    setTtyFn(getTtyForSession);
    setDispatchEventFn(dispatchEvent);
    setCatalogFn(() => catalog.list());
    setCatalogObj(catalog);
    setUpdatePetTypeFn(setPetTypeForProject);
    setToolUsageFn(getToolUsageForSession);
    setToolEventsFn(getToolEventsForSession);
    setAllUsageEventsFn(getAllPersistedEvents);
    setSessionsForProjectFn(getSessionsForProject);
    setLicenseManagerFn(licenseManager);
    setPremiumStoreFn(premiumStore);
    setMarketplaceCatalogFn(marketplaceCatalog);
    setLicenseApiFn(licenseApi);
    createOverlayWindow();

    // Prime product catalog if using real API (populates productId <-> petId map)
    if (marketplaceConfig.isConfigured()) {
      licenseApi.getCatalog().catch(err => {
        logger.warn(`Failed to prime marketplace catalog: ${err.message}`);
      });
    }

    // Validate license if stale
    if (licenseManager.needsRevalidation()) {
      licenseManager.validate().then(result => {
        logger.info(`License revalidation: ${result.valid ? 'valid' : 'invalid'}`);
      }).catch(err => {
        logger.warn(`License revalidation failed: ${err.message}`);
      });
    }

    // Send premium sprites to renderer after it's ready
    const ownedPets = licenseManager.getOwnedPets();
    const licenseKey = licenseManager.getLicenseKey();
    if (ownedPets.length > 0 && licenseKey) {
      // Defer until renderer is ready (window-manager handles the queue)
      for (const petId of ownedPets) {
        if (premiumStore.isDownloaded(petId)) {
          const sprites = premiumStore.loadSprites(petId, licenseKey);
          if (sprites) {
            sendToRenderer('premium-sprites', { petId, sprites });
          }
        }
      }
    }

    logger.info('Code Pet is running');
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', async () => {
    logger.info('Shutting down...');
    closeSettingsWindow();
    await stopServer();
    try {
      await usageStore.flush();
      await usageStore.close();
    } catch (err) {
      logger.warn(`Usage store shutdown failed: ${err.message}`);
    }
    removePid();
  });
}

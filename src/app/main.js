'use strict';

const path = require('path');
const os = require('os');
const { app } = require('electron');
const { createOverlayWindow, closeSettingsWindow, setProjectsSnapshotFn, setClaudePidFn, setTtyFn, setDispatchEventFn, setCatalogFn, setUpdatePetTypeFn, setCatalogObj, setLicenseManagerFn, setPremiumStoreFn, setMarketplaceCatalogFn, setLicenseApiFn, setToolUsageFn, setToolEventsFn, setAllUsageEventsFn, setSessionsForProjectFn } = require('./windows/window-manager');
const { startServer, stopServer, dispatchEvent, setUsageStore, setPetTypeForProject, getSessionsForProject, getProjectsSnapshot, getClaudePidForSession, getTtyForSession, getToolUsageForSession, getToolEventsForSession, getAllPersistedEvents } = require('./server/event-server');
require('./windows/report-window'); // registers the usage-report preview IPC handlers
const { writePid, removePid } = require('./core/process-manager');
const PetCatalog = require('./pet/pet-catalog');
const settingsStore = require('./core/settings-store');
const LicenseManager = require('./marketplace/license-manager');
const PremiumStore = require('./marketplace/premium-store');
const MarketplaceCatalog = require('./marketplace/marketplace-catalog');
const { MockLicenseAPI } = require('./marketplace/license-api');
const { MarketplaceAPI } = require('./marketplace/marketplace-api');
const marketplaceConfig = require('./marketplace/marketplace-config');
const { createStore } = require('../tracking');
const logger = require('./core/logger');

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
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      logger.info(`Received ${sig} — quitting`);
      app.quit();
    });
  }

  app.on('ready', async () => {
    logger.info('App ready, starting up...');

    settingsStore.load();
    setUsageStore(usageStore);

    // Initialize license system — real API by default, mock via MARKETPLACE_MOCK=true
    const mpConfig = marketplaceConfig.load();
    const mockMode = marketplaceConfig.isMockMode();
    const licenseApi = mockMode
      ? new MockLicenseAPI()
      : new MarketplaceAPI(mpConfig);
    logger.info(`License API: ${mockMode ? 'MockLicenseAPI (MARKETPLACE_MOCK=true)' : 'MarketplaceAPI'}`);
    const licenseManager = new LicenseManager(licenseApi);
    licenseManager.load();

    // Clear stale mock license keys left over from prior dev runs
    if (!mockMode && licenseManager.getLicenseKey() && licenseManager.getLicenseKey().startsWith('MOCK-')) {
      logger.warn(`Clearing stale mock license key from ~/.code-pet/license.json`);
      licenseManager.clear();
    }
    const pluginPetsDir = path.join(__dirname, '..', '..', 'assets', 'pets');
    const userPetsDir = path.join(os.homedir(), '.code-pet', 'pets');
    const premiumStore = new PremiumStore(userPetsDir);
    const marketplaceCatalog = new MarketplaceCatalog(licenseApi);
    const catalog = new PetCatalog();

    writePid(process.pid);

    try {
      await startServer();
    } catch (err) {
      logger.error(`Failed to start event server: ${err.message}`);
      app.quit();
      return;
    }

    // Recovery: re-download any owned pet missing from disk (e.g. after plugin reinstall).
    // Product map is loaded from ~/.code-pet/product-map.json in the MarketplaceAPI
    // constructor; if a petId doesn't resolve (fresh machine with restored license.json
    // but no cached map), lazy-prime via getCatalog() on first miss.
    const ownedPets = licenseManager.getOwnedPets();
    const licenseKey = licenseManager.getLicenseKey();
    if (ownedPets.length > 0 && licenseKey) {
      let mapPrimed = false;
      for (const petId of ownedPets) {
        if (premiumStore.isDownloaded(petId)) continue;
        let productId = licenseApi.getProductIdForPet ? licenseApi.getProductIdForPet(petId) : null;
        if (!productId && !mapPrimed && !mockMode) {
          try {
            await licenseApi.getCatalog();
            mapPrimed = true;
            productId = licenseApi.getProductIdForPet(petId);
          } catch (err) {
            logger.warn(`Recovery: failed to prime catalog: ${err.message}`);
          }
        }
        if (!productId) {
          logger.warn(`Recovery: no productId for owned pet "${petId}" — skipping`);
          continue;
        }
        try {
          await premiumStore.download(petId, licenseKey, licenseApi, productId);
          logger.info(`Recovery: redownloaded owned pet "${petId}"`);
        } catch (err) {
          logger.warn(`Recovery redownload failed for "${petId}": ${err.message}`);
        }
      }
    }

    catalog.scan(pluginPetsDir);
    catalog.scan(userPetsDir);

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

    // Validate license if stale
    if (licenseManager.needsRevalidation()) {
      licenseManager.validate().then(result => {
        logger.info(`License revalidation: ${result.valid ? 'valid' : 'invalid'}`);
      }).catch(err => {
        logger.warn(`License revalidation failed: ${err.message}`);
      });
    }

    logger.info('Code Pet is running');
  });

  app.on('window-all-closed', () => {
    logger.info('window-all-closed fired — quitting');
    app.quit();
  });

  app.on('before-quit', async () => {
    logger.info('Shutting down...');
    closeSettingsWindow();
    require('./windows/report-window').closeReportWindow();
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

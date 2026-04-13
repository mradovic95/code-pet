'use strict';

// Feature flags — hardcoded, flip to false to disable
const FEATURE_FLAGS = {
  STORE_TAB: true,
  USAGE_TAB: true,
};

// --- Load tab HTML partials ---

async function loadTab(containerId, file) {
  const res = await fetch(`tabs/${file}`);
  document.getElementById(containerId).innerHTML = await res.text();
}

async function init() {
  // Load all tab partials
  const tabs = [
    loadTab('tab-general', 'general.html'),
  ];
  if (FEATURE_FLAGS.STORE_TAB) {
    tabs.push(loadTab('tab-store', 'store.html'));
  }
  if (FEATURE_FLAGS.USAGE_TAB) {
    tabs.push(loadTab('tab-usage', 'usage.html'));
  }
  await Promise.all(tabs);

  // --- Close / Dismiss ---

  document.getElementById('close-btn').addEventListener('click', () => {
    window.codePetSettings.close();
  });

  document.getElementById('dismiss-btn').addEventListener('click', () => {
    window.codePetSettings.dismissProject();
  });

  // --- Sound toggles ---

  const soundSettings = window.codePetSettings.getSoundEnabled();
  const soundToggleIdle = document.getElementById('sound-toggle-idle');
  const soundToggleWaiting = document.getElementById('sound-toggle-waiting');
  soundToggleIdle.checked = !!(soundSettings && soundSettings.idle);
  soundToggleWaiting.checked = !!(soundSettings && soundSettings.waiting_for_action);
  soundToggleIdle.addEventListener('change', () => {
    window.codePetSettings.setSoundEnabledForState('idle', soundToggleIdle.checked);
  });
  soundToggleWaiting.addEventListener('change', () => {
    window.codePetSettings.setSoundEnabledForState('waiting_for_action', soundToggleWaiting.checked);
  });

  // --- Store tab feature flag ---

  if (FEATURE_FLAGS.STORE_TAB) {
    document.getElementById('tab-btn-store').style.display = '';
    initLicenseActivation();
  }

  if (FEATURE_FLAGS.USAGE_TAB) {
    document.getElementById('tab-btn-usage').style.display = '';
  }

  // --- Tabs ---

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById('tab-general').style.display = target === 'general' ? '' : 'none';
      document.getElementById('tab-store').style.display = target === 'store' ? '' : 'none';
      document.getElementById('tab-usage').style.display = target === 'usage' ? '' : 'none';
      if (target === 'usage') renderUsageTab();
      if (target === 'store') renderMarketplace();
    });
  });

  // --- Render initial tab ---

  renderPetSelector();
}

// --- Pet Selector (free + owned premium) ---

function renderPetSelector() {
  const container = document.getElementById('pet-selector');
  const catalog = window.codePetSettings.getPetCatalog();
  const currentType = window.codePetSettings.getCurrentPetType();

  container.innerHTML = '';

  // Show free pets + owned premium pets
  for (const pet of catalog) {
    const card = document.createElement('div');
    card.className = 'pet-card' + (pet.id === currentType ? ' selected' : '');
    card.dataset.petId = pet.id;

    const preview = document.createElement('div');
    preview.className = 'pet-card-preview';
    const previewSize = 36;
    preview.style.backgroundImage = `url('../../assets/pets/${pet.id}/${pet.icon || 'icon.png'}')`;
    preview.style.backgroundSize = `${previewSize}px ${previewSize}px`;
    preview.style.width = `${previewSize}px`;
    preview.style.height = `${previewSize}px`;

    const info = document.createElement('div');
    info.className = 'pet-card-info';

    const name = document.createElement('div');
    name.className = 'pet-card-name';
    name.textContent = pet.name;

    const desc = document.createElement('div');
    desc.className = 'pet-card-desc';
    desc.textContent = pet.description || '';

    info.appendChild(name);
    info.appendChild(desc);
    card.appendChild(preview);
    card.appendChild(info);

    card.addEventListener('click', () => {
      window.codePetSettings.setPetType(pet.id);
      container.querySelectorAll('.pet-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });

    container.appendChild(card);
  }
}

// --- Marketplace ---

async function renderMarketplace() {
  const section = document.getElementById('marketplace-section');
  const grid = document.getElementById('marketplace-grid');

  let catalog, licenseStatus;
  try {
    [catalog, licenseStatus] = await Promise.all([
      window.codePetSettings.getMarketplaceCatalog(),
      window.codePetSettings.getLicenseStatus(),
    ]);
  } catch {
    return;
  }

  const ownedPets = new Set(licenseStatus.ownedPets || []);

  // Filter to only show premium pets not yet owned
  const available = catalog.filter(p => p.tier === 'premium' && !ownedPets.has(p.id));

  if (available.length === 0 && ownedPets.size === 0) {
    // No premium pets at all — hide section
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  grid.innerHTML = '';

  for (const pet of catalog.filter(p => p.tier === 'premium')) {
    const owned = ownedPets.has(pet.id);
    const card = document.createElement('div');
    card.className = 'marketplace-card' + (owned ? ' owned' : '');

    const preview = document.createElement('div');
    preview.className = 'marketplace-preview';

    const lockBadge = document.createElement('div');
    lockBadge.className = owned ? 'badge-owned' : 'badge-locked';
    lockBadge.textContent = owned ? '\u2713' : '\uD83D\uDD12';

    const nameEl = document.createElement('div');
    nameEl.className = 'marketplace-name';
    nameEl.textContent = pet.name;

    const priceEl = document.createElement('div');
    priceEl.className = 'marketplace-price';
    priceEl.textContent = owned ? 'Owned' : pet.price;

    card.appendChild(preview);
    card.appendChild(lockBadge);
    card.appendChild(nameEl);
    card.appendChild(priceEl);

    if (!owned) {
      const buyBtn = document.createElement('button');
      buyBtn.className = 'marketplace-buy-btn';
      buyBtn.textContent = 'Buy';
      buyBtn.addEventListener('click', async () => {
        // If waiting for payment completion, check status
        if (buyBtn._pendingPayment && buyBtn._paymentToken) {
          buyBtn.disabled = true;
          buyBtn.textContent = '...';
          try {
            const payResult = await window.codePetSettings.pollPaymentStatus(buyBtn._paymentToken);
            if (payResult.completed && payResult.licenseKey) {
              document.getElementById('license-input').value = payResult.licenseKey;
              showLicenseStatus('Payment complete! Click Activate to enable.', 'success');
              buyBtn._pendingPayment = false;
              buyBtn.textContent = 'Buy';
            } else {
              showLicenseStatus('Payment not yet completed. Try again in a moment.', 'info');
            }
          } catch {
            showLicenseStatus('Failed to check payment status.', 'error');
          }
          buyBtn.disabled = false;
          if (buyBtn._pendingPayment) buyBtn.textContent = 'Check Payment';
          return;
        }

        buyBtn.disabled = true;
        buyBtn.textContent = '...';
        try {
          const result = await window.codePetSettings.purchasePet(pet.id);
          if (result.paymentPending) {
            // Paid pet: PayPal opened in browser
            showLicenseStatus('Payment opened in browser. Complete payment, then click Check Payment.', 'info');
            buyBtn.textContent = 'Check Payment';
            buyBtn._paymentToken = result.paymentToken;
            buyBtn._pendingPayment = true;
            buyBtn.disabled = false;
            return;
          }
          if (result.success && result.licenseKey) {
            // Free pet or mock: license key returned directly
            document.getElementById('license-input').value = result.licenseKey;
            showLicenseStatus('Key generated! Click Activate to enable.', 'info');
          } else {
            showLicenseStatus(result.error || 'Purchase failed', 'error');
          }
        } catch {
          showLicenseStatus('Purchase failed', 'error');
        }
        buyBtn.disabled = false;
        buyBtn.textContent = 'Buy';
      });
      card.appendChild(buyBtn);
    }

    grid.appendChild(card);
  }
}

// --- License Activation ---

function showLicenseStatus(message, type) {
  const el = document.getElementById('license-status');
  el.textContent = message;
  el.className = 'license-status ' + (type || '');
}

function initLicenseActivation() {
  document.getElementById('license-btn').addEventListener('click', async () => {
    const input = document.getElementById('license-input');
    const key = input.value.trim();
    if (!key) {
      showLicenseStatus('Please enter a license key', 'error');
      return;
    }

    const btn = document.getElementById('license-btn');
    btn.disabled = true;
    btn.textContent = '...';

    try {
      const result = await window.codePetSettings.activateLicense(key);
      if (result.success) {
        showLicenseStatus('Activated! Pets unlocked: ' + result.ownedPets.join(', '), 'success');
        input.value = '';
        // Refresh both the pet selector and marketplace
        renderPetSelector();
        await renderMarketplace();
      } else {
        showLicenseStatus(result.error || 'Activation failed', 'error');
      }
    } catch {
      showLicenseStatus('Activation failed', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Activate';
  });
}

// --- Usage Tab ---

function renderUsageTab() {
  const usage = window.codePetSettings.getToolUsage();
  renderUsageList('mcp-usage-list', usage.mcp, 'No MCP tool usage yet');
  renderUsageList('skill-usage-list', usage.skills, 'No skill usage yet');
  renderEventLog();
}

function renderEventLog() {
  const container = document.getElementById('event-log');
  const events = window.codePetSettings.getToolEvents();

  if (!events || events.length === 0) {
    container.innerHTML = '<div class="usage-empty">No events yet</div>';
    return;
  }

  container.innerHTML = '';
  // Newest first
  const sorted = events.slice().sort((a, b) => b.timestamp - a.timestamp);

  for (const evt of sorted) {
    const row = document.createElement('div');
    row.className = 'event-row';

    const timeEl = document.createElement('span');
    timeEl.className = 'event-timestamp';
    const d = new Date(evt.timestamp);
    timeEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const badge = document.createElement('span');
    badge.className = 'event-type-badge ' + (evt.type === 'mcp_tool' ? 'badge-mcp' : 'badge-skill');
    badge.textContent = evt.type === 'mcp_tool' ? 'MCP' : 'Skill';

    const nameEl = document.createElement('span');
    nameEl.className = 'event-name';
    nameEl.textContent = evt.name;
    nameEl.title = evt.name;

    row.appendChild(timeEl);
    row.appendChild(badge);
    row.appendChild(nameEl);
    container.appendChild(row);
  }
}

function renderUsageList(containerId, data, emptyMsg) {
  const container = document.getElementById(containerId);
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    container.innerHTML = `<div class="usage-empty">${emptyMsg}</div>`;
    return;
  }

  container.innerHTML = '';
  for (const [name, count] of entries) {
    const row = document.createElement('div');
    row.className = 'usage-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'usage-name';
    nameEl.textContent = name;
    nameEl.title = name;

    const countEl = document.createElement('span');
    countEl.className = 'usage-count';
    countEl.textContent = count;

    row.appendChild(nameEl);
    row.appendChild(countEl);
    container.appendChild(row);
  }
}

// --- Bootstrap ---

init();

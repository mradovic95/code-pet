'use strict';

document.getElementById('close-btn').addEventListener('click', () => {
  window.codePetSettings.close();
});

document.getElementById('dismiss-btn').addEventListener('click', () => {
  window.codePetSettings.dismissProject();
});

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
    const idleSprite = pet.sprites.idle;
    const previewSize = 36;
    preview.style.backgroundImage = `url('../../assets/pets/${pet.id}/${idleSprite.file}')`;
    preview.style.backgroundSize = `${previewSize * idleSprite.frames}px ${previewSize}px`;
    preview.style.backgroundPosition = '0 0';
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
        buyBtn.disabled = true;
        buyBtn.textContent = '...';
        try {
          const result = await window.codePetSettings.purchasePet(pet.id);
          if (result.success) {
            // Show the generated license key
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

// --- Tabs ---

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.getElementById('tab-general').style.display = target === 'general' ? '' : 'none';
    document.getElementById('tab-usage').style.display = target === 'usage' ? '' : 'none';
    if (target === 'usage') renderUsageTab();
  });
});

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

// --- Init ---

renderPetSelector();
renderMarketplace();


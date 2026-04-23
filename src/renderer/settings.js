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

  const dismissBtn = document.getElementById('dismiss-btn');
  const dismissConfirm = document.getElementById('dismiss-confirm');
  dismissBtn.addEventListener('click', () => {
    dismissBtn.style.display = 'none';
    dismissConfirm.style.display = '';
  });
  document.getElementById('dismiss-yes').addEventListener('click', () => {
    window.codePetSettings.dismissProject();
  });
  document.getElementById('dismiss-no').addEventListener('click', () => {
    dismissConfirm.style.display = 'none';
    dismissBtn.style.display = '';
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

  // --- Sound preview buttons ---

  wireSoundPreview('preview-idle', 'idle');
  wireSoundPreview('preview-waiting', 'waiting_for_action');

  // --- Store tab feature flag ---

  if (FEATURE_FLAGS.STORE_TAB) {
    document.getElementById('tab-btn-store').style.display = '';
    initLicenseActivation();
  }

  if (FEATURE_FLAGS.USAGE_TAB) {
    document.getElementById('tab-btn-usage').style.display = '';
  }

  // --- Tabs (with fade transition) ---

  const TAB_IDS = ['tab-general', 'tab-store', 'tab-usage'];
  let _activeTabId = 'tab-general';
  let _tabTransitioning = false;

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = 'tab-' + tab.dataset.tab;
      if (target === _activeTabId || _tabTransitioning) return;
      _tabTransitioning = true;

      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const oldEl = document.getElementById(_activeTabId);
      const newEl = document.getElementById(target);

      // Fade out current tab
      oldEl.classList.add('fading');
      setTimeout(() => {
        oldEl.style.display = 'none';
        oldEl.classList.remove('fading');

        // Show new tab (start invisible, then fade in)
        newEl.style.display = '';
        newEl.classList.add('fading');
        _activeTabId = target;

        // Trigger lazy loads before fade-in
        if (tab.dataset.tab === 'usage') renderUsageTab();
        if (tab.dataset.tab === 'store') renderMarketplace();

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            newEl.classList.remove('fading');
            _tabTransitioning = false;
          });
        });
      }, 120);
    });
  });

  // --- Footer ---

  document.getElementById('version-text').textContent = `v${window.codePetSettings.getVersion()}`;
  document.getElementById('github-link').addEventListener('click', () => {
    window.codePetSettings.openExternal('https://github.com/mradovic95/code-pet');
  });

  // --- Render initial tab ---

  renderPetSelector();
}

// --- Sound Preview ---

function wireSoundPreview(buttonId, soundState) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const petType = window.codePetSettings.getCurrentPetType();
    const catalog = window.codePetSettings.getPetCatalog();
    const pet = catalog.find(p => p.id === petType);
    if (!pet || !pet.sounds || !pet.sounds[soundState]) return;
    const audio = new Audio(`../../assets/pets/${petType}/${pet.sounds[soundState]}`);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  });
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
      container.querySelectorAll('.pet-card').forEach(c => {
        c.classList.remove('selected', 'just-selected');
      });
      card.classList.add('selected', 'just-selected');
      setTimeout(() => card.classList.remove('just-selected'), 400);
    });

    container.appendChild(card);
  }
}

// --- Marketplace ---

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function renderEmailBanner(section) {
  let banner = section.querySelector('.buyer-email-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'buyer-email-banner';
    const title = section.querySelector('.section-title');
    if (title && title.nextSibling) {
      section.insertBefore(banner, title.nextSibling);
    } else {
      section.insertBefore(banner, section.firstChild);
    }
  }
  const email = window.codePetSettings.getBuyerEmail();
  banner.innerHTML = '';
  const label = document.createElement('span');
  label.className = 'buyer-email-label';
  label.textContent = email
    ? `License key will be emailed to ${email}`
    : 'We will email the license key — click to set address.';
  const link = document.createElement('a');
  link.href = '#';
  link.className = 'buyer-email-change';
  link.textContent = email ? 'Change' : 'Set email';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    promptForBannerEmail(banner, email);
  });
  banner.appendChild(label);
  banner.appendChild(link);
}

function promptForBannerEmail(banner, currentEmail) {
  banner.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'email';
  input.className = 'buyer-email-input';
  input.placeholder = 'you@example.com';
  input.value = currentEmail || '';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'buyer-email-save';
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'buyer-email-cancel';
  cancelBtn.textContent = 'Cancel';
  const finish = () => {
    const section = banner.parentElement;
    if (section) renderEmailBanner(section);
  };
  saveBtn.addEventListener('click', async () => {
    const value = input.value.trim();
    if (!EMAIL_REGEX.test(value)) {
      input.classList.add('invalid');
      return;
    }
    await window.codePetSettings.setBuyerEmail(value);
    finish();
  });
  cancelBtn.addEventListener('click', finish);
  banner.appendChild(input);
  banner.appendChild(saveBtn);
  banner.appendChild(cancelBtn);
  input.focus();
}

async function ensureBuyerEmail(buyBtn) {
  const existing = window.codePetSettings.getBuyerEmail();
  if (existing && EMAIL_REGEX.test(existing)) return existing;

  return new Promise((resolve) => {
    const actionsEl = buyBtn.parentElement;
    const card = actionsEl.closest('.marketplace-card') || actionsEl;
    buyBtn.style.display = 'none';
    const row = document.createElement('div');
    row.className = 'buyer-email-inline';
    const input = document.createElement('input');
    input.type = 'email';
    input.className = 'buyer-email-input';
    input.placeholder = 'email for license';
    const confirm = document.createElement('button');
    confirm.className = 'buyer-email-save';
    confirm.textContent = 'OK';
    const cancel = document.createElement('button');
    cancel.className = 'buyer-email-cancel';
    cancel.textContent = 'x';
    const cleanup = (email) => {
      row.remove();
      buyBtn.style.display = '';
      resolve(email);
    };
    confirm.addEventListener('click', async () => {
      const value = input.value.trim();
      if (!EMAIL_REGEX.test(value)) {
        input.classList.add('invalid');
        return;
      }
      await window.codePetSettings.setBuyerEmail(value);
      const section = document.getElementById('marketplace-section');
      if (section) renderEmailBanner(section);
      cleanup(value);
    });
    cancel.addEventListener('click', () => cleanup(null));
    row.appendChild(input);
    row.appendChild(confirm);
    row.appendChild(cancel);
    card.appendChild(row);
    input.focus();
  });
}

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

  const available = catalog.filter(p => !ownedPets.has(p.id));

  if (available.length === 0 && ownedPets.size === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  renderEmailBanner(section);
  grid.innerHTML = '';

  for (const pet of catalog) {
    const buyLabel = pet.tier === 'free' ? 'Claim' : 'Buy';
    const owned = ownedPets.has(pet.id);
    const card = document.createElement('div');
    card.className = 'marketplace-card' + (owned ? ' owned' : '');

    const preview = document.createElement('div');
    preview.className = 'marketplace-preview';
    if (pet.thumbnailUrl) {
      const img = document.createElement('img');
      img.className = 'marketplace-thumb';
      img.alt = pet.name;
      img.src = pet.thumbnailUrl;
      img.addEventListener('error', () => img.remove());
      preview.appendChild(img);
    }

    const lockBadge = document.createElement('div');
    lockBadge.className = owned ? 'badge-owned' : 'badge-locked';
    lockBadge.textContent = owned ? '\u2713' : '\uD83D\uDD12';

    const body = document.createElement('div');
    body.className = 'marketplace-body';

    const nameEl = document.createElement('div');
    nameEl.className = 'marketplace-name';
    nameEl.textContent = pet.name;
    body.appendChild(nameEl);

    if (pet.description) {
      const descEl = document.createElement('div');
      descEl.className = 'marketplace-description';
      descEl.textContent = pet.description;
      body.appendChild(descEl);
    }

    const priceEl = document.createElement('div');
    priceEl.className = 'marketplace-price';
    priceEl.textContent = owned ? 'Owned' : (pet.tier === 'free' ? 'Free' : pet.price);
    body.appendChild(priceEl);

    card.appendChild(preview);
    card.appendChild(lockBadge);
    card.appendChild(body);

    if (!owned) {
      const actions = document.createElement('div');
      actions.className = 'marketplace-actions';
      const buyBtn = document.createElement('button');
      buyBtn.className = 'marketplace-buy-btn';
      buyBtn.textContent = buyLabel;
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
              buyBtn.textContent = buyLabel;
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

        const email = await ensureBuyerEmail(buyBtn);
        if (!email) return;

        buyBtn.disabled = true;
        buyBtn.textContent = '...';
        try {
          const result = await window.codePetSettings.purchasePet(pet.id, email);
          if (result.paymentPending) {
            showLicenseStatus('Payment opened in browser. Complete payment, then click Check Payment.', 'info');
            buyBtn.textContent = 'Check Payment';
            buyBtn._paymentToken = result.paymentToken;
            buyBtn._pendingPayment = true;
            buyBtn.disabled = false;
            return;
          }
          if (result.success && result.licenseKey) {
            document.getElementById('license-input').value = result.licenseKey;
            showLicenseStatus(`License key ready (also emailed to ${email}). Click Activate.`, 'info');
          } else {
            showLicenseStatus(result.error || 'Purchase failed', 'error');
          }
        } catch {
          showLicenseStatus('Purchase failed', 'error');
        }
        buyBtn.disabled = false;
        buyBtn.textContent = buyLabel;
      });
      actions.appendChild(buyBtn);
      card.appendChild(actions);
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

let _allEvents = [];              // full event list read from usage.log
let _filteredEvents = [];         // last filtered result (for CSV export)
let _filtersWired = false;        // event listeners attached once
let _lastProjectFilter = '';      // track project changes to reset session dropdown
let _eventPage = 0;               // current page in event log
const EVENT_PAGE_SIZE = 50;

function basename(p) {
  if (!p) return '(unknown)';
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function renderUsageTab() {
  try {
    _allEvents = await window.codePetSettings.getAllUsageEvents();
  } catch {
    _allEvents = [];
  }
  if (!Array.isArray(_allEvents)) _allEvents = [];

  populateProjectOptions();
  populateSessionOptions('');
  _lastProjectFilter = '';

  if (!_filtersWired) {
    document.getElementById('filter-date-range').addEventListener('change', applyFilters);
    document.getElementById('filter-project').addEventListener('change', applyFilters);
    document.getElementById('filter-session').addEventListener('change', applyFilters);
    document.getElementById('export-csv-btn').addEventListener('click', exportCsv);
    document.getElementById('page-prev').addEventListener('click', () => {
      if (_eventPage > 0) { _eventPage--; renderEventLog(_filteredEvents); }
    });
    document.getElementById('page-next').addEventListener('click', () => {
      _eventPage++;
      renderEventLog(_filteredEvents);
    });
    _filtersWired = true;
  }

  applyFilters();
}

function populateProjectOptions() {
  const select = document.getElementById('filter-project');
  // Keep "All projects" (first option); rebuild the rest.
  const seen = new Set();
  const entries = [];
  for (const evt of _allEvents) {
    const p = evt.projectPath || '';
    if (!p || seen.has(p)) continue;
    seen.add(p);
    entries.push({ path: p, label: basename(p) });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));

  // Preserve current selection if still present after rebuild.
  const currentVal = select.value;
  select.innerHTML = '<option value="">All projects</option>';
  for (const e of entries) {
    const opt = document.createElement('option');
    opt.value = e.path;
    opt.textContent = e.label;
    select.appendChild(opt);
  }
  if (currentVal && entries.some(e => e.path === currentVal)) {
    select.value = currentVal;
  }
}

function populateSessionOptions(projectFilter) {
  const select = document.getElementById('filter-session');
  // Deduplicate sessions; compute earliest timestamp per session.
  const sessionMap = new Map();
  for (const evt of _allEvents) {
    if (!evt.sessionId) continue;
    if (projectFilter && evt.projectPath !== projectFilter) continue;
    const existing = sessionMap.get(evt.sessionId);
    if (!existing) {
      sessionMap.set(evt.sessionId, {
        sessionId: evt.sessionId,
        projectPath: evt.projectPath || '',
        firstTs: evt.timestamp,
      });
    } else if (evt.timestamp < existing.firstTs) {
      existing.firstTs = evt.timestamp;
    }
  }

  const sessions = [...sessionMap.values()].sort((a, b) => b.firstTs - a.firstTs);

  const currentVal = select.value;
  select.innerHTML = '<option value="">All sessions</option>';
  for (const s of sessions) {
    const opt = document.createElement('option');
    opt.value = s.sessionId;
    opt.textContent = `${basename(s.projectPath)} — ${formatTime(s.firstTs)}`;
    select.appendChild(opt);
  }
  // Only keep prior session selection if it still exists under the new project filter.
  if (currentVal && sessions.some(s => s.sessionId === currentVal)) {
    select.value = currentVal;
  } else {
    select.value = '';
  }
}

function getMinTimestamp(rangeValue) {
  if (!rangeValue) return 0;
  if (rangeValue === 'today') return new Date().setHours(0, 0, 0, 0);
  if (rangeValue === '7d') return Date.now() - 7 * 86400000;
  if (rangeValue === '30d') return Date.now() - 30 * 86400000;
  return 0;
}

function exportCsv() {
  const rows = [['timestamp', 'type', 'name', 'project', 'session']];
  const sorted = _filteredEvents.slice().sort((a, b) => b.timestamp - a.timestamp);
  for (const e of sorted) {
    rows.push([
      new Date(e.timestamp).toISOString(),
      e.type || '',
      e.name || '',
      basename(e.projectPath),
      e.sessionId || '',
    ]);
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  const btn = document.getElementById('export-csv-btn');
  navigator.clipboard.writeText(csv).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy CSV'; }, 1500);
  }).catch(() => {
    btn.textContent = 'Failed';
    setTimeout(() => { btn.textContent = 'Copy CSV'; }, 1500);
  });
}

function applyFilters() {
  const dateRangeVal = document.getElementById('filter-date-range').value;
  const projectVal = document.getElementById('filter-project').value;
  const sessionVal = document.getElementById('filter-session').value;

  // If project changed, rebuild session dropdown (narrowed to that project).
  if (projectVal !== _lastProjectFilter) {
    populateSessionOptions(projectVal);
    _lastProjectFilter = projectVal;
  }

  const sessionAfter = document.getElementById('filter-session').value;
  const minTs = getMinTimestamp(dateRangeVal);

  const filtered = _allEvents.filter((e) => {
    if (minTs && e.timestamp < minTs) return false;
    if (projectVal && e.projectPath !== projectVal) return false;
    if (sessionAfter && e.sessionId !== sessionAfter) return false;
    return true;
  });

  const mcpCounts = {};
  const skillCounts = {};
  for (const e of filtered) {
    if (e.type === 'mcp_tool') {
      mcpCounts[e.name] = (mcpCounts[e.name] || 0) + 1;
    } else if (e.type === 'skill') {
      skillCounts[e.name] = (skillCounts[e.name] || 0) + 1;
    }
  }

  const hasAnyFilter = Boolean(dateRangeVal || projectVal || sessionAfter);
  const emptyEventsMsg = hasAnyFilter ? 'No events match current filters' : 'No events yet';
  const emptyMcpMsg = hasAnyFilter ? 'No MCP tool usage for this filter' : 'No MCP tool usage yet';
  const emptySkillsMsg = hasAnyFilter ? 'No skill usage for this filter' : 'No skill usage yet';

  _filteredEvents = filtered;
  _eventPage = 0;

  renderEventLog(filtered, emptyEventsMsg);
  renderUsageList('mcp-usage-list', mcpCounts, emptyMcpMsg);
  renderUsageList('skill-usage-list', skillCounts, emptySkillsMsg);
}

function renderEventLog(events, emptyMsg) {
  const container = document.getElementById('event-log');
  const paginationEl = document.getElementById('event-pagination');

  if (!events || events.length === 0) {
    container.innerHTML = `<div class="usage-empty">${emptyMsg || 'No events yet'}</div>`;
    if (paginationEl) paginationEl.style.display = 'none';
    return;
  }

  // Newest first
  const sorted = events.slice().sort((a, b) => b.timestamp - a.timestamp);
  const totalPages = Math.ceil(sorted.length / EVENT_PAGE_SIZE);
  if (_eventPage >= totalPages) _eventPage = totalPages - 1;
  const start = _eventPage * EVENT_PAGE_SIZE;
  const page = sorted.slice(start, start + EVENT_PAGE_SIZE);

  container.innerHTML = '';
  for (const evt of page) {
    const row = document.createElement('div');
    row.className = 'event-row';

    const timeEl = document.createElement('span');
    timeEl.className = 'event-timestamp';
    const d = new Date(evt.timestamp);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(2);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeEl.textContent = `${dd}.${mm}.${yy} ${time}`;

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

  // Pagination controls
  if (paginationEl) {
    if (totalPages <= 1) {
      paginationEl.style.display = 'none';
    } else {
      paginationEl.style.display = '';
      document.getElementById('page-prev').disabled = _eventPage === 0;
      document.getElementById('page-next').disabled = _eventPage >= totalPages - 1;
      document.getElementById('page-info').textContent = `${_eventPage + 1} / ${totalPages}`;
    }
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

/* global EventSource */

// ── State ──────────────────────────────────────────────────────────────────
let scanResults = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const btnScan = document.getElementById('btn-scan');
const optNoCache = document.getElementById('opt-nocache');
const optChangelogs = document.getElementById('opt-changelogs');
const optLimit = document.getElementById('opt-limit');
const progressContainer = document.getElementById('progress-container');
const progressText = document.getElementById('progress-text');
const progressCount = document.getElementById('progress-count');
const progressFill = document.getElementById('progress-fill');
const resultsDiv = document.getElementById('results');
const statsDiv = document.getElementById('stats');
const instanceMeta = document.getElementById('instance-meta');

const profileSelect = document.getElementById('profile-select');

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  // Load available profiles
  try {
    const resp = await fetch('/api/instances');
    const data = await resp.json();
    profileSelect.innerHTML = '';
    for (const inst of data.instances) {
      const opt = document.createElement('option');
      opt.value = inst.name;
      opt.textContent = inst.name;
      if (inst.name === data.selected) opt.selected = true;
      profileSelect.appendChild(opt);
    }
  } catch {
    profileSelect.innerHTML = '<option>Failed to load</option>';
  }

  // Load current instance info
  await loadInstanceInfo();
}

async function loadInstanceInfo() {
  try {
    const resp = await fetch('/api/instance');
    const data = await resp.json();
    instanceMeta.innerHTML = `<strong>${esc(data.instanceName)}</strong><br>Minecraft ${esc(data.mcVersion)} &middot; ${esc(data.loaderName)} &middot; ${data.modCount} mods`;
  } catch {
    instanceMeta.textContent = 'Failed to load instance data';
  }
}

// ── Profile switch ─────────────────────────────────────────────────────────
profileSelect.addEventListener('change', async () => {
  const name = profileSelect.value;
  profileSelect.disabled = true;
  instanceMeta.textContent = 'Switching profile...';
  resultsDiv.innerHTML = '';
  statsDiv.style.display = 'none';
  scanResults = null;

  try {
    const resp = await fetch('/api/instance/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await resp.json();
    if (data.error) {
      instanceMeta.textContent = `Error: ${data.error}`;
    } else {
      instanceMeta.innerHTML = `<strong>${esc(data.instanceName)}</strong><br>Minecraft ${esc(data.mcVersion)} &middot; ${esc(data.loaderName)} &middot; ${data.modCount} mods`;
    }
  } catch {
    instanceMeta.textContent = 'Failed to switch profile';
  } finally {
    profileSelect.disabled = false;
  }
});

init();

// ── Scan ───────────────────────────────────────────────────────────────────
btnScan.addEventListener('click', startScan);

function startScan() {
  btnScan.disabled = true;
  resultsDiv.innerHTML = '';
  statsDiv.style.display = 'none';
  progressContainer.classList.add('active');
  progressFill.style.width = '0%';
  progressText.textContent = 'Starting scan...';
  progressCount.textContent = '';

  const params = new URLSearchParams();
  if (optNoCache.checked) params.set('noCache', 'true');
  if (optChangelogs.checked) params.set('checkChangelogs', 'true');
  const limit = parseInt(optLimit.value) || 0;
  if (limit > 0) params.set('limit', String(limit));

  const es = new EventSource(`/api/scan/stream?${params}`);

  es.addEventListener('progress', (e) => {
    const d = JSON.parse(e.data);
    const pct = Math.floor((d.current / d.total) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = `${d.modName} (${d.source})`;
    progressCount.textContent = `${d.current} / ${d.total}`;
  });

  es.addEventListener('status', (e) => {
    const d = JSON.parse(e.data);
    progressText.textContent = d.message;
  });

  es.addEventListener('done', (e) => {
    es.close();
    scanResults = JSON.parse(e.data);
    progressContainer.classList.remove('active');
    btnScan.disabled = false;
    renderResults(scanResults);
  });

  es.addEventListener('error', (e) => {
    // SSE connection closed (could be normal end or actual error)
    es.close();
    progressContainer.classList.remove('active');
    btnScan.disabled = false;
    // If we already got results via 'done', this is just the connection closing
    if (!scanResults) {
      progressText.textContent = 'Scan failed or connection lost';
    }
  });
}

// ── Render ──────────────────────────────────────────────────────────────────
function renderResults(data) {
  const { metadata, breaking, safeToUpdate, updates, upToDate, errors } = data;

  // Update stats
  document.getElementById('stat-breaking').textContent = breaking.length;
  document.getElementById('stat-safe').textContent = safeToUpdate.length;
  document.getElementById('stat-update').textContent = updates.length;
  document.getElementById('stat-ok').textContent = upToDate.length;
  statsDiv.style.display = 'flex';

  let html = '';

  if (breaking.length > 0) {
    html += renderSection('Breaking Changes', 'breaking', breaking, true);
  }
  if (safeToUpdate.length > 0) {
    html += renderSection('Safe to Update', 'safe', safeToUpdate, true);
  }
  if (updates.length > 0) {
    html += renderSection('Updates Available', 'update', updates, true);
  }
  if (upToDate.length > 0) {
    html += renderSection('Up to Date', 'ok', upToDate, false);
  }
  if (errors.length > 0) {
    html += `<div class="errors"><h3>API Errors (${errors.length})</h3><ul>`;
    for (const err of errors) {
      html += `<li><strong>${esc(err.name)}</strong> (ID ${err.addonID}): ${esc(err.error)}</li>`;
    }
    html += '</ul></div>';
  }

  resultsDiv.innerHTML = html;
}

function renderSection(title, cssClass, items, showActions) {
  const hasUpdates = showActions && items.some(i => i.hasUpdate && i.latestFile);
  let html = `<div class="section section-${cssClass}">`;
  html += `<h2><span>${title} (${items.length})</span>`;
  if (hasUpdates) {
    html += ` <button class="btn btn-download btn-bulk" onclick="downloadAll('${cssClass}')">Download All</button>`;
    html += ` <button class="btn btn-apply btn-bulk" onclick="applyAll('${cssClass}')">Apply All</button>`;
  }
  html += `</h2>`;
  html += '<table><thead><tr><th>Mod</th><th>Installed</th><th>Available</th><th>Config Refs</th><th>Quest Refs</th><th>Status</th>';
  if (showActions) html += '<th>Actions</th>';
  html += '</tr></thead><tbody>';

  for (const item of items) {
    html += renderRow(item, cssClass, showActions);
  }

  html += '</tbody></table></div>';
  return html;
}

function renderRow(item, cssClass, showActions) {
  const name = item.url
    ? `<a href="${esc(item.url)}" target="_blank">${esc(item.name)}</a>`
    : esc(item.name);
  const installed = esc(item.installedFile || '-');
  const latest = esc(item.latestFile || '-');
  const change = item.breakingReason
    ? esc(item.breakingReason)
    : item.hasUpdate ? 'Update available' : 'Up to date';

  const refsHtml = item.configRefs > 0
    ? `<span class="config-ref-link" onclick="showConfigRefs(${item.addonID}, '${esc(item.name)}')">${item.configRefs}</span>`
    : '0';

  const questRefsHtml = item.questRefs > 0
    ? `<span class="quest-ref-link" onclick="showQuestRefs(${item.addonID}, '${esc(item.name)}')">${item.questRefs}</span>`
    : '0';

  let actionsHtml = '';
  if (showActions && item.hasUpdate && item.latestFile) {
    const dlUrl = item.downloadUrl ? esc(item.downloadUrl) : '';
    actionsHtml = `<td class="actions" id="actions-${item.addonID}">`;
    if (dlUrl) {
      actionsHtml += `<button class="btn btn-download" onclick="downloadOne(${item.addonID}, '${dlUrl}', '${esc(item.latestFile)}')">Download</button>`;
      actionsHtml += `<button class="btn btn-apply" style="display:none" onclick="applyOne(${item.addonID}, '${esc(item.installedFile)}', '${esc(item.latestFile)}')">Apply</button>`;
    } else {
      actionsHtml += `<span class="status-badge badge-error">No URL</span>`;
    }
    actionsHtml += '</td>';
  } else if (showActions) {
    actionsHtml = '<td></td>';
  }

  return `<tr class="row-${cssClass}" data-addon="${item.addonID}"><td>${name}</td><td>${installed}</td><td>${latest}</td><td>${refsHtml}</td><td>${questRefsHtml}</td><td>${change}</td>${actionsHtml}</tr>`;
}

// ── Config Refs Modal ──────────────────────────────────────────────────────
async function showConfigRefs(addonId, modName) {
  const modal = document.getElementById('config-modal');
  const title = document.getElementById('config-modal-title');
  const body = document.getElementById('config-modal-body');

  title.textContent = `Config References: ${modName}`;
  body.innerHTML = '<p style="color:var(--muted)">Loading...</p>';
  modal.classList.add('active');

  try {
    const resp = await fetch(`/api/config-refs/${addonId}`);
    const data = await resp.json();
    if (data.files.length === 0) {
      body.innerHTML = '<p style="color:var(--muted)">No config references found.</p>';
    } else {
      body.innerHTML = '<ul>' + data.files.map(f => `<li>${esc(f)}</li>`).join('') + '</ul>';
    }
  } catch {
    body.innerHTML = '<p style="color:var(--red)">Failed to load config references.</p>';
  }
}
window.showConfigRefs = showConfigRefs;

// ── Quest Refs Modal ────────────────────────────────────────────────────────
async function showQuestRefs(addonId, modName) {
  const modal = document.getElementById('quest-modal');
  const title = document.getElementById('quest-modal-title');
  const body = document.getElementById('quest-modal-body');

  title.textContent = `Quest References: ${modName}`;
  body.innerHTML = '<p style="color:var(--muted)">Loading...</p>';
  modal.classList.add('active');

  try {
    const resp = await fetch(`/api/quest-refs/${addonId}`);
    const data = await resp.json();
    if (data.files.length === 0) {
      body.innerHTML = '<p style="color:var(--muted)">No quest references found.</p>';
    } else {
      body.innerHTML = '<p style="color:var(--yellow);margin-bottom:0.8rem;font-size:0.85rem">This mod is referenced in quest files. Updating may affect quest rewards, tasks, or icons.</p>'
        + '<ul>' + data.files.map(f => `<li>${esc(f)}</li>`).join('') + '</ul>';
    }
  } catch {
    body.innerHTML = '<p style="color:var(--red)">Failed to load quest references.</p>';
  }
}
window.showQuestRefs = showQuestRefs;

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}
window.closeModal = closeModal;

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// ── Download One ───────────────────────────────────────────────────────────
async function downloadOne(addonId, downloadUrl, fileName) {
  const actionsEl = document.getElementById(`actions-${addonId}`);
  if (!actionsEl) return;

  const dlBtn = actionsEl.querySelector('.btn-download');
  if (dlBtn) {
    dlBtn.disabled = true;
    dlBtn.textContent = 'Downloading...';
  }

  try {
    const resp = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addonId, downloadUrl, fileName }),
    });
    const data = await resp.json();
    if (data.success) {
      if (dlBtn) {
        dlBtn.textContent = 'Downloaded';
        dlBtn.classList.remove('btn-download');
        dlBtn.classList.add('badge-downloaded', 'status-badge');
      }
      // Show apply button
      const applyBtn = actionsEl.querySelector('.btn-apply');
      if (applyBtn) applyBtn.style.display = '';
    } else {
      throw new Error(data.error || 'Download failed');
    }
  } catch (err) {
    if (dlBtn) {
      dlBtn.textContent = 'Failed';
      dlBtn.disabled = false;
    }
  }
}
window.downloadOne = downloadOne;

// ── Apply One ──────────────────────────────────────────────────────────────
async function applyOne(addonId, oldFileName, newFileName) {
  const modal = document.getElementById('apply-modal');
  const title = document.getElementById('apply-modal-title');
  const body = document.getElementById('apply-modal-body');
  const confirmBtn = document.getElementById('apply-modal-confirm');

  title.textContent = 'Confirm Apply';
  body.innerHTML = `<p>Replace <strong>${esc(oldFileName)}</strong> with <strong>${esc(newFileName)}</strong>?</p>
    <p style="color:var(--muted);margin-top:0.5rem;font-size:0.85rem">The old jar will be backed up and can be rolled back.</p>`;
  modal.classList.add('active');

  confirmBtn.onclick = async () => {
    modal.classList.remove('active');
    const actionsEl = document.getElementById(`actions-${addonId}`);
    const applyBtn = actionsEl?.querySelector('.btn-apply');
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying...';
    }

    try {
      const resp = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonId, oldFileName, newFileName }),
      });
      const data = await resp.json();
      if (data.success) {
        if (actionsEl) {
          actionsEl.innerHTML = `<span class="status-badge badge-applied">Applied</span> <button class="btn btn-rollback" onclick="rollbackOne(${addonId}, '${esc(oldFileName)}', '${esc(newFileName)}')">Rollback</button>`;
        }
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      if (applyBtn) {
        applyBtn.textContent = 'Failed';
        applyBtn.disabled = false;
      }
    }
  };
}
window.applyOne = applyOne;

// ── Rollback One ────────────────────────────────────────────────────────────
async function rollbackOne(addonId, oldFileName, newFileName) {
  const modal = document.getElementById('apply-modal');
  const title = document.getElementById('apply-modal-title');
  const body = document.getElementById('apply-modal-body');
  const confirmBtn = document.getElementById('apply-modal-confirm');

  title.textContent = 'Confirm Rollback';
  body.innerHTML = `<p>Restore <strong>${esc(oldFileName)}</strong> and remove <strong>${esc(newFileName)}</strong>?</p>
    <p style="color:var(--muted);margin-top:0.5rem;font-size:0.85rem">The backup will be copied back to the mods folder.</p>`;
  modal.classList.add('active');

  confirmBtn.onclick = async () => {
    modal.classList.remove('active');
    const actionsEl = document.getElementById(`actions-${addonId}`);
    const rbBtn = actionsEl?.querySelector('.btn-rollback');
    if (rbBtn) {
      rbBtn.disabled = true;
      rbBtn.textContent = 'Rolling back...';
    }

    try {
      const resp = await fetch('/api/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonId, oldFileName, newFileName }),
      });
      const data = await resp.json();
      if (data.success) {
        if (actionsEl) {
          actionsEl.innerHTML = '<span class="status-badge badge-rolledback">Rolled back</span>';
        }
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      if (rbBtn) {
        rbBtn.textContent = 'Failed';
        rbBtn.disabled = false;
      }
    }
  };
}
window.rollbackOne = rollbackOne;

// ── Download All ───────────────────────────────────────────────────────────
async function downloadAll(sectionClass) {
  if (!scanResults) return;

  // Gather all mods from the relevant section that have download URLs
  let items;
  if (sectionClass === 'breaking') items = scanResults.breaking;
  else if (sectionClass === 'safe') items = scanResults.safeToUpdate;
  else if (sectionClass === 'update') items = scanResults.updates;
  else return;

  const mods = items
    .filter(i => i.hasUpdate && i.downloadUrl && i.latestFile)
    .map(i => ({ addonId: i.addonID, downloadUrl: i.downloadUrl, fileName: i.latestFile }));

  if (mods.length === 0) return;

  // Disable all download buttons in this section
  for (const mod of mods) {
    const actionsEl = document.getElementById(`actions-${mod.addonId}`);
    const dlBtn = actionsEl?.querySelector('.btn-download');
    if (dlBtn) {
      dlBtn.disabled = true;
      dlBtn.textContent = 'Queued...';
    }
  }

  try {
    const resp = await fetch('/api/download/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mods }),
    });
    const results = await resp.json();

    for (const result of results) {
      const actionsEl = document.getElementById(`actions-${result.addonId}`);
      if (!actionsEl) continue;
      const dlBtn = actionsEl.querySelector('.btn-download, .status-badge');
      if (result.success) {
        if (dlBtn) {
          dlBtn.textContent = 'Downloaded';
          dlBtn.className = 'status-badge badge-downloaded';
          dlBtn.disabled = true;
        }
        const applyBtn = actionsEl.querySelector('.btn-apply');
        if (applyBtn) applyBtn.style.display = '';
      } else {
        if (dlBtn) {
          dlBtn.textContent = 'Failed';
          dlBtn.disabled = false;
        }
      }
    }
  } catch {
    // Re-enable buttons on error
    for (const mod of mods) {
      const actionsEl = document.getElementById(`actions-${mod.addonId}`);
      const dlBtn = actionsEl?.querySelector('.btn-download');
      if (dlBtn) {
        dlBtn.textContent = 'Download';
        dlBtn.disabled = false;
      }
    }
  }
}
window.downloadAll = downloadAll;

// ── Apply All ──────────────────────────────────────────────────────────────
async function applyAll(sectionClass) {
  if (!scanResults) return;

  let items;
  if (sectionClass === 'breaking') items = scanResults.breaking;
  else if (sectionClass === 'safe') items = scanResults.safeToUpdate;
  else if (sectionClass === 'update') items = scanResults.updates;
  else return;

  // Only include mods that have been downloaded (check download state)
  let stateResp;
  try {
    stateResp = await fetch('/api/download-state');
  } catch { return; }
  const state = await stateResp.json();

  const mods = items
    .filter(i => {
      const s = state[String(i.addonID)];
      return s && (s.status === 'downloaded' || s.status === 'applied') && i.hasUpdate && i.latestFile;
    })
    .map(i => ({ addonId: i.addonID, oldFileName: i.installedFile, newFileName: i.latestFile }));

  if (mods.length === 0) return;

  // Show confirmation modal
  const modal = document.getElementById('apply-modal');
  const title = document.getElementById('apply-modal-title');
  const body = document.getElementById('apply-modal-body');
  const confirmBtn = document.getElementById('apply-modal-confirm');

  title.textContent = `Apply ${mods.length} Updates`;
  body.innerHTML = `<p>This will replace the following mods:</p><ul style="margin-top:0.5rem">` +
    mods.map(m => `<li>${esc(m.oldFileName)} &rarr; ${esc(m.newFileName)}</li>`).join('') +
    '</ul>';
  modal.classList.add('active');

  confirmBtn.onclick = async () => {
    modal.classList.remove('active');

    try {
      const resp = await fetch('/api/apply/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mods }),
      });
      const results = await resp.json();

      for (const result of results) {
        const actionsEl = document.getElementById(`actions-${result.addonId}`);
        if (!actionsEl) continue;
        if (result.success) {
          actionsEl.innerHTML = `<span class="status-badge badge-applied">Applied</span> <button class="btn btn-rollback" onclick="rollbackOne(${result.addonId}, '${esc(result.oldFileName)}', '${esc(result.newFileName)}')">Rollback</button>`;
        } else {
          const applyBtn = actionsEl.querySelector('.btn-apply');
          if (applyBtn) applyBtn.textContent = 'Failed';
        }
      }
    } catch { /* ignore */ }
  };
}
window.applyAll = applyAll;

// ── Util ───────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

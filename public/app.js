/* global EventSource */

// ── State ──────────────────────────────────────────────────────────────────
let scanResults = null;

// ── Dependency graph helpers (client-side ports) ──────────────────────────

function buildUpdateLookup() {
  const lookup = new Map();
  if (!scanResults) return lookup;
  for (const cat of [scanResults.breaking, scanResults.caution, scanResults.reviewDeps, scanResults.safeToUpdate, scanResults.updates, scanResults.upToDate]) {
    for (const item of (cat || [])) {
      if (item.hasUpdate) lookup.set(item.addonID, item);
    }
  }
  return lookup;
}

function buildAllModsLookup() {
  const lookup = new Map();
  if (!scanResults) return lookup;
  for (const cat of [scanResults.breaking, scanResults.caution, scanResults.reviewDeps, scanResults.safeToUpdate, scanResults.updates, scanResults.upToDate]) {
    for (const item of (cat || [])) {
      lookup.set(item.addonID, item);
    }
  }
  return lookup;
}

function resolveDependencyChain(targetIds, graph, updateLookup) {
  const result = new Set(targetIds);
  const visited = new Set();
  const queue = [...targetIds];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const node = graph[current];
    if (!node) continue;

    for (const depId of node.deps) {
      if (!result.has(depId) && updateLookup.has(depId)) {
        result.add(depId);
        queue.push(depId);
      }
    }
  }

  return [...result];
}

function topologicalSort(nodeIds, graph) {
  const nodeSet = new Set(nodeIds);
  const inDegree = new Map();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }

  for (const id of nodeIds) {
    const node = graph[id];
    if (!node) continue;
    for (const depId of node.deps) {
      if (nodeSet.has(depId)) {
        inDegree.set(id, (inDegree.get(id) || 0) + 1);
      }
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);

    const node = graph[current];
    if (!node) continue;
    for (const dependentId of node.reverseDeps) {
      if (!nodeSet.has(dependentId)) continue;
      const newDeg = (inDegree.get(dependentId) || 1) - 1;
      inDegree.set(dependentId, newDeg);
      if (newDeg === 0) queue.push(dependentId);
    }
  }

  for (const id of nodeIds) {
    if (!sorted.includes(id)) sorted.push(id);
  }

  return sorted;
}

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

const optLlm = document.getElementById('opt-llm');
const btnSettings = document.getElementById('btn-settings');
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

  // Load LLM toggle state
  await loadLlmState();
}

// ── LLM State ──────────────────────────────────────────────────────────────
async function loadLlmState() {
  try {
    const resp = await fetch('/api/settings');
    const settings = await resp.json();
    const configured = settings.llm && settings.llm.enabled && settings.llm.endpoint && settings.llm.model;
    optLlm.disabled = !configured;
    if (!configured) optLlm.checked = false;
  } catch {
    optLlm.disabled = true;
  }
}

// ── Settings Modal ─────────────────────────────────────────────────────────
btnSettings.addEventListener('click', openSettings);

async function openSettings() {
  const modal = document.getElementById('settings-modal');
  const resultSpan = document.getElementById('test-llm-result');
  resultSpan.textContent = '';

  try {
    const resp = await fetch('/api/settings');
    const settings = await resp.json();
    document.getElementById('settings-llm-enabled').checked = settings.llm.enabled;
    document.getElementById('settings-llm-endpoint').value = settings.llm.endpoint || '';
    document.getElementById('settings-llm-apikey').value = settings.llm.apiKey || '';
    document.getElementById('settings-llm-model').value = settings.llm.model || '';
    document.getElementById('settings-llm-maxtokens').value = settings.llm.maxTokens || 1024;
    document.getElementById('settings-llm-temperature').value = settings.llm.temperature ?? 0.1;
    document.getElementById('settings-llm-concurrency').value = settings.llm.concurrency || 2;
  } catch {
    // Use defaults
  }

  modal.classList.add('active');
}

document.getElementById('btn-test-llm').addEventListener('click', async () => {
  const resultSpan = document.getElementById('test-llm-result');
  resultSpan.textContent = 'Testing...';
  resultSpan.style.color = 'var(--muted)';

  // Save current settings first so the test uses them
  await saveCurrentSettings();

  try {
    const resp = await fetch('/api/settings/test-llm', { method: 'POST' });
    const data = await resp.json();
    if (data.success) {
      resultSpan.textContent = 'Connected! Response: ' + data.response;
      resultSpan.style.color = 'var(--green)';
    } else {
      resultSpan.textContent = 'Failed: ' + data.error;
      resultSpan.style.color = 'var(--red)';
    }
  } catch (err) {
    resultSpan.textContent = 'Error: ' + err.message;
    resultSpan.style.color = 'var(--red)';
  }
});

async function saveCurrentSettings() {
  const tempVal = parseFloat(document.getElementById('settings-llm-temperature').value);
  const settings = {
    llm: {
      enabled: document.getElementById('settings-llm-enabled').checked,
      endpoint: document.getElementById('settings-llm-endpoint').value.trim(),
      apiKey: document.getElementById('settings-llm-apikey').value,
      model: document.getElementById('settings-llm-model').value.trim(),
      maxTokens: parseInt(document.getElementById('settings-llm-maxtokens').value) || 1024,
      temperature: Number.isFinite(tempVal) ? tempVal : 0.1,
      concurrency: parseInt(document.getElementById('settings-llm-concurrency').value) || 2,
    },
  };

  const resp = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!resp.ok) {
    const text = await resp.text();
    let msg;
    try { msg = JSON.parse(text).error; } catch { msg = text.slice(0, 200); }
    throw new Error(msg || `HTTP ${resp.status}`);
  }
  return resp.json();
}

document.getElementById('btn-detect-concurrency').addEventListener('click', async () => {
  const resultSpan = document.getElementById('detect-concurrency-result');
  resultSpan.textContent = 'Detecting...';
  resultSpan.style.color = 'var(--muted)';

  // Save current settings first so the backend has the latest endpoint/model/apiKey
  try {
    await saveCurrentSettings();
  } catch (err) {
    resultSpan.textContent = 'Save failed: ' + err.message;
    resultSpan.style.color = 'var(--red)';
    return;
  }

  try {
    const resp = await fetch('/api/settings/detect-concurrency');
    const data = await resp.json();
    if (data.success) {
      document.getElementById('settings-llm-concurrency').value = data.instances;
      const label = data.instances === 1 ? 'instance' : 'instances';
      resultSpan.textContent = `Detected ${data.instances} ${label}`;
      resultSpan.style.color = 'var(--green)';
    } else {
      resultSpan.textContent = data.error || 'Detection failed';
      resultSpan.style.color = 'var(--red)';
    }
  } catch (err) {
    resultSpan.textContent = 'Error: ' + err.message;
    resultSpan.style.color = 'var(--red)';
  }
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  try {
    await saveCurrentSettings();
    closeModal('settings-modal');
    await loadLlmState();
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
});

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
  if (optLlm.checked) params.set('useLlm', 'true');
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
  const { metadata, breaking, caution, reviewDeps, safeToUpdate, updates, upToDate, errors } = data;

  // Update stats
  document.getElementById('stat-breaking').textContent = breaking.length;
  document.getElementById('stat-caution').textContent = (caution || []).length;
  document.getElementById('stat-review-deps').textContent = (reviewDeps || []).length;
  document.getElementById('stat-safe').textContent = safeToUpdate.length;
  document.getElementById('stat-update').textContent = updates.length;
  document.getElementById('stat-ok').textContent = upToDate.length;
  statsDiv.style.display = 'flex';

  let html = '';

  if (breaking.length > 0) {
    html += renderSection('Breaking Changes', 'breaking', breaking, true);
  }
  if (caution && caution.length > 0) {
    html += renderSection('Caution', 'caution', caution, true);
  }
  if (reviewDeps && reviewDeps.length > 0) {
    html += renderSection('Review Deps', 'review-deps', reviewDeps, true);
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
  html += `<h2 onclick="toggleSection(this)"><span class="section-toggle">&#9660;</span><span>${title} (${items.length})</span>`;
  if (hasUpdates) {
    html += ` <button class="btn btn-download btn-bulk" onclick="event.stopPropagation(); downloadAll('${cssClass}')">Download All</button>`;
    html += ` <button class="btn btn-apply btn-bulk" onclick="event.stopPropagation(); applyAll('${cssClass}')">Apply All</button>`;
    html += ` <button class="btn btn-rollback btn-bulk" onclick="event.stopPropagation(); rollbackAll('${cssClass}')">Rollback All</button>`;
  }
  html += `</h2>`;
  html += '<div class="section-body">';
  html += '<table><thead><tr><th>Mod</th><th>Installed</th><th>Available</th><th>Config Refs</th><th>Quest Refs</th><th>Deps</th><th>Status</th>';
  if (showActions) html += '<th>Actions</th>';
  html += '</tr></thead><tbody>';

  for (const item of items) {
    html += renderRow(item, cssClass, showActions);
  }

  html += '</tbody></table></div></div>';
  return html;
}

function toggleSection(h2) {
  h2.closest('.section').classList.toggle('collapsed');
}
window.toggleSection = toggleSection;

function renderRow(item, cssClass, showActions) {
  const name = item.url
    ? `<a href="${esc(item.url)}" target="_blank">${esc(item.name)}</a>`
    : esc(item.name);
  const installed = esc(item.installedFile || '-');
  const latest = esc(item.latestFile || '-');
  let change = item.breakingReason
    ? esc(item.breakingReason)
    : item.hasUpdate ? 'Update available' : 'Up to date';
  if (item.llmChangelogs && item.llmChangelogs.length > 0) {
    // Show worst severity badge
    const severities = item.llmChangelogs.map(e => e.llmAnalysis?.severity || 'safe');
    let worst = 'safe';
    if (severities.includes('breaking')) worst = 'breaking';
    else if (severities.includes('caution')) worst = 'caution';
    const badgeLabel = worst.toUpperCase();
    const escapedName = esc(item.name).replace(/'/g, "\\'");
    change = `<span class="llm-badge llm-badge-${worst}" onclick="showFlaggedChangelogs(${item.addonID}, '${escapedName}')">${badgeLabel}</span> ${change}`;
  } else if (item.flaggedChangelogs && item.flaggedChangelogs.length > 0) {
    const n = item.flaggedChangelogs.length;
    change = `<span class="changelog-warn" onclick="showFlaggedChangelogs(${item.addonID}, '${esc(item.name).replace(/'/g, "\\'")}')">&#9888;${n}</span> ${change}`;
  }

  const refsHtml = item.configRefs > 0
    ? `<span class="config-ref-link" onclick="showConfigRefs(${item.addonID}, '${esc(item.name)}')">${item.configRefs}</span>`
    : '0';

  const questRefsHtml = item.questRefs > 0
    ? `<span class="quest-ref-link" onclick="showQuestRefs(${item.addonID}, '${esc(item.name)}')">${item.questRefs}</span>`
    : '0';

  // Deps cell
  let depsHtml = '0';
  const deps = item.dependencies || [];
  if (deps.length > 0) {
    // Count how many deps have pending updates
    const updateLookup = buildUpdateLookup();
    const pendingCount = deps.filter(d => updateLookup.has(d)).length;
    const label = pendingCount > 0 ? `${deps.length} (${pendingCount} pending)` : String(deps.length);

    // Check if any deps are in breaking or caution buckets
    const breakingIds = new Set((scanResults?.breaking || []).map(m => m.addonID));
    const cautionIds = new Set((scanResults?.caution || []).map(m => m.addonID));
    const hasBreakingDep = deps.some(d => breakingIds.has(d));
    const hasCautionDep = deps.some(d => cautionIds.has(d));
    let depIcons = '';
    if (hasBreakingDep) depIcons += ' <span class="dep-warn-breaking" title="Has dependency with breaking changes">&#9888;</span>';
    if (hasCautionDep) depIcons += ' <span class="dep-warn-caution" title="Has dependency requiring caution">&#9670;</span>';

    depsHtml = `<span class="dep-link" onclick="showDeps(${item.addonID}, '${esc(item.name)}')">${label}</span>${depIcons}`;
  }

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

  return `<tr class="row-${cssClass}" data-addon="${item.addonID}"><td>${name}</td><td>${installed}</td><td>${latest}</td><td>${refsHtml}</td><td>${questRefsHtml}</td><td>${depsHtml}</td><td>${change}</td>${actionsHtml}</tr>`;
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

// ── Dependencies Modal ─────────────────────────────────────────────────────
function showDeps(addonId, modName) {
  const modal = document.getElementById('deps-modal');
  const title = document.getElementById('deps-modal-title');
  const body = document.getElementById('deps-modal-body');

  title.textContent = `Dependencies: ${modName}`;

  if (!scanResults || !scanResults.dependencyGraph) {
    body.innerHTML = '<p style="color:var(--muted)">No dependency data available.</p>';
    modal.classList.add('active');
    return;
  }

  const graph = scanResults.dependencyGraph;
  const node = graph[addonId];
  const allMods = buildAllModsLookup();
  const updateLookup = buildUpdateLookup();

  if (!node || node.deps.length === 0) {
    body.innerHTML = '<p style="color:var(--muted)">No required dependencies.</p>';
    modal.classList.add('active');
    return;
  }

  // Check missing deps
  const missingIds = new Set((scanResults.missingDeps || []).map(d => d.addonId));
  const breakingIds = new Set((scanResults.breaking || []).map(m => m.addonID));
  const cautionIds = new Set((scanResults.caution || []).map(m => m.addonID));

  let html = '<ul>';
  for (const depId of node.deps) {
    const mod = allMods.get(depId);
    const name = mod ? esc(mod.name) : `Addon ${depId}`;
    let icon = '';
    if (breakingIds.has(depId)) icon = ' <span class="dep-warn-breaking" title="Breaking changes">&#9888;</span>';
    else if (cautionIds.has(depId)) icon = ' <span class="dep-warn-caution" title="Caution">&#9670;</span>';
    let status;
    if (updateLookup.has(depId)) {
      status = '<span style="color:var(--yellow)">has update</span>';
    } else if (mod) {
      status = '<span style="color:var(--green)">up to date</span>';
    } else {
      status = '<span style="color:var(--muted)">unknown</span>';
    }
    html += `<li>${name}${icon} — ${status}</li>`;
  }

  // Show missing deps that aren't installed
  const myDeps = (allMods.get(addonId)?.dependencies) || [];
  for (const md of scanResults.missingDeps || []) {
    if (myDeps.includes(md.addonId) || node.deps.includes(md.addonId)) continue;
    // already shown above
  }

  // Also show deps not in graph (missing/uninstalled)
  const item = allMods.get(addonId);
  const rawDeps = item ? (item.dependencies || []) : [];
  for (const depId of rawDeps) {
    if (node.deps.includes(depId)) continue; // already shown
    const isMissing = !allMods.has(depId);
    if (isMissing) {
      html += `<li>Addon ${depId} — <span style="color:var(--red)">not installed</span></li>`;
    }
  }

  html += '</ul>';

  // Show warning about missing deps
  const relevantMissing = (scanResults.missingDeps || []).filter(md => md.neededBy.includes(addonId));
  if (relevantMissing.length > 0) {
    html += '<p style="color:var(--yellow);margin-top:0.8rem;font-size:0.85rem">Some required dependencies are not installed in this instance.</p>';
  }

  body.innerHTML = html;
  modal.classList.add('active');
}
window.showDeps = showDeps;

// ── Flagged Changelogs Modal ────────────────────────────────────────────
function showFlaggedChangelogs(addonId, modName) {
  const modal = document.getElementById('changelog-modal');
  const title = document.getElementById('changelog-modal-title');
  const body = document.getElementById('changelog-modal-body');

  // Find the item across all categories
  let item = null;
  if (scanResults) {
    for (const cat of [scanResults.breaking, scanResults.caution, scanResults.reviewDeps, scanResults.safeToUpdate, scanResults.updates, scanResults.upToDate]) {
      for (const m of (cat || [])) {
        if (m.addonID === addonId) { item = m; break; }
      }
      if (item) break;
    }
  }

  // LLM results mode
  if (item && item.llmChangelogs && item.llmChangelogs.length > 0) {
    title.textContent = `LLM Analysis: ${modName}`;
    let html = '';
    for (const entry of item.llmChangelogs) {
      const date = new Date(entry.fileDate).toLocaleDateString();
      const analysis = entry.llmAnalysis || {};
      const sev = analysis.severity || 'safe';
      const sevBadge = `<span class="llm-badge llm-badge-${sev}">${sev.toUpperCase()}</span>`;
      html += `<div class="changelog-version">`;
      html += `<div class="changelog-version-header" onclick="this.parentElement.classList.toggle('open')">`;
      html += `<span style="color:var(--text);font-weight:600">${esc(entry.fileName)}</span>`;
      html += `<span style="color:var(--muted);font-size:0.8rem">${date}</span>`;
      html += sevBadge;
      html += `</div>`;
      html += `<div class="changelog-version-body">`;
      if (analysis.summary) {
        html += `<div class="llm-summary">${esc(analysis.summary)}</div>`;
      }
      if (analysis.breakingItems && analysis.breakingItems.length > 0) {
        html += '<ul class="llm-breaking-items">';
        for (const bi of analysis.breakingItems) {
          html += `<li>${esc(bi)}</li>`;
        }
        html += '</ul>';
      }
      html += `<details style="margin-top:0.5rem"><summary style="cursor:pointer;color:var(--muted);font-size:0.8rem">Show changelog</summary><div style="margin-top:0.4rem">${entry.changelogHtml}</div></details>`;
      html += `</div>`;
      html += `</div>`;
    }
    body.innerHTML = html;
    modal.classList.add('active');
    return;
  }

  // Keyword results mode
  title.textContent = `Flagged Changelogs: ${modName}`;

  if (!item || !item.flaggedChangelogs || item.flaggedChangelogs.length === 0) {
    body.innerHTML = '<p style="color:var(--muted)">No flagged changelogs found.</p>';
    modal.classList.add('active');
    return;
  }

  let html = '';
  for (const entry of item.flaggedChangelogs) {
    const date = new Date(entry.fileDate).toLocaleDateString();
    const uniqueKws = [...new Set(entry.keywords)];
    const badges = uniqueKws.map(kw => `<span class="kw-badge">${esc(kw)}</span>`).join(' ');
    html += `<div class="changelog-version">`;
    html += `<div class="changelog-version-header" onclick="this.parentElement.classList.toggle('open')">`;
    html += `<span style="color:var(--text);font-weight:600">${esc(entry.fileName)}</span>`;
    html += `<span style="color:var(--muted);font-size:0.8rem">${date}</span>`;
    html += badges;
    html += `</div>`;
    html += `<div class="changelog-version-body">${entry.changelogHtml}</div>`;
    html += `</div>`;
  }

  body.innerHTML = html;
  modal.classList.add('active');
}
window.showFlaggedChangelogs = showFlaggedChangelogs;

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

  // Resolve dependency chain
  const graph = scanResults?.dependencyGraph || {};
  const updateLookup = buildUpdateLookup();
  const allMods = buildAllModsLookup();
  const chainIds = resolveDependencyChain([addonId], graph, updateLookup);
  const extraDepIds = chainIds.filter(id => id !== addonId);

  title.textContent = 'Confirm Apply';
  let bodyHtml = `<p>Replace <strong>${esc(oldFileName)}</strong> with <strong>${esc(newFileName)}</strong>?</p>`;

  if (extraDepIds.length > 0) {
    bodyHtml += '<p style="color:var(--yellow);margin-top:0.8rem;font-size:0.85rem">The following dependencies will also be updated:</p>';
    bodyHtml += '<ul style="margin-top:0.3rem">';
    for (const depId of extraDepIds) {
      const dep = updateLookup.get(depId);
      if (dep) bodyHtml += `<li>${esc(dep.name)}: ${esc(dep.installedFile)} &rarr; ${esc(dep.latestFile)}</li>`;
    }
    bodyHtml += '</ul>';
  }

  // Warn about missing deps
  const relevantMissing = (scanResults?.missingDeps || []).filter(md => md.neededBy.includes(addonId));
  if (relevantMissing.length > 0) {
    bodyHtml += `<p style="color:var(--red);margin-top:0.5rem;font-size:0.85rem">${relevantMissing.length} required dep(s) not installed in this instance.</p>`;
  }

  bodyHtml += '<p style="color:var(--muted);margin-top:0.5rem;font-size:0.85rem">The old jars will be backed up and can be rolled back.</p>';
  body.innerHTML = bodyHtml;
  modal.classList.add('active');

  confirmBtn.onclick = async () => {
    modal.classList.remove('active');

    // Build ordered list: deps first, then target
    const sortedIds = topologicalSort(chainIds, graph);
    const allModsToApply = sortedIds
      .map(id => {
        const item = allMods.get(id);
        if (!item || !item.hasUpdate || !item.latestFile) return null;
        return { addonId: id, oldFileName: item.installedFile, newFileName: item.latestFile, downloadUrl: item.downloadUrl };
      })
      .filter(Boolean);

    // First, download any not-yet-downloaded deps
    let stateResp;
    try { stateResp = await fetch('/api/download-state'); } catch { return; }
    const dlState = await stateResp.json();

    const needsDownload = allModsToApply.filter(m => {
      const s = dlState[String(m.addonId)];
      return (!s || (s.status !== 'downloaded' && s.status !== 'applied')) && m.downloadUrl;
    });

    if (needsDownload.length > 0) {
      try {
        await fetch('/api/download/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mods: needsDownload.map(m => ({ addonId: m.addonId, downloadUrl: m.downloadUrl, fileName: m.newFileName })) }),
        });
      } catch { /* continue — apply will catch missing files */ }
    }

    // Now apply all in topological order
    const modsToApply = allModsToApply.map(m => ({ addonId: m.addonId, oldFileName: m.oldFileName, newFileName: m.newFileName }));

    // Update UI for target mod
    const actionsEl = document.getElementById(`actions-${addonId}`);
    const applyBtn = actionsEl?.querySelector('.btn-apply');
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying...';
    }

    try {
      const resp = await fetch('/api/apply/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mods: modsToApply }),
      });
      const results = await resp.json();

      for (const result of results) {
        const el = document.getElementById(`actions-${result.addonId}`);
        if (!el) continue;
        if (result.success) {
          el.innerHTML = `<span class="status-badge badge-applied">Applied</span> <button class="btn btn-rollback" onclick="rollbackOne(${result.addonId}, '${esc(result.oldFileName)}', '${esc(result.newFileName)}')">Rollback</button>`;
        } else {
          const btn = el.querySelector('.btn-apply');
          if (btn) { btn.textContent = 'Failed'; btn.disabled = false; }
        }
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

// ── Rollback All ────────────────────────────────────────────────────────────
async function rollbackAll(sectionClass) {
  if (!scanResults) return;

  let items;
  if (sectionClass === 'breaking') items = scanResults.breaking;
  else if (sectionClass === 'caution') items = scanResults.caution;
  else if (sectionClass === 'review-deps') items = scanResults.reviewDeps;
  else if (sectionClass === 'safe') items = scanResults.safeToUpdate;
  else if (sectionClass === 'update') items = scanResults.updates;
  else return;

  // Only include mods that have been applied (check download state)
  let stateResp;
  try {
    stateResp = await fetch('/api/download-state');
  } catch { return; }
  const state = await stateResp.json();

  const mods = items
    .filter(i => {
      const s = state[String(i.addonID)];
      return s && s.status === 'applied' && i.hasUpdate && i.latestFile;
    })
    .map(i => ({ addonId: i.addonID, oldFileName: i.installedFile, newFileName: i.latestFile }));

  if (mods.length === 0) return;

  // Show confirmation modal
  const modal = document.getElementById('apply-modal');
  const title = document.getElementById('apply-modal-title');
  const body = document.getElementById('apply-modal-body');
  const confirmBtn = document.getElementById('apply-modal-confirm');

  title.textContent = `Rollback ${mods.length} Mods`;
  body.innerHTML = `<p>This will restore the following mods to their previous versions:</p><ul style="margin-top:0.5rem">` +
    mods.map(m => `<li>${esc(m.newFileName)} &rarr; ${esc(m.oldFileName)}</li>`).join('') +
    '</ul><p style="color:var(--muted);margin-top:0.5rem;font-size:0.85rem">Backups will be copied back to the mods folder.</p>';
  modal.classList.add('active');

  confirmBtn.onclick = async () => {
    modal.classList.remove('active');

    try {
      const resp = await fetch('/api/rollback/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mods }),
      });
      const results = await resp.json();

      for (const result of results) {
        const actionsEl = document.getElementById(`actions-${result.addonId}`);
        if (!actionsEl) continue;
        if (result.success) {
          actionsEl.innerHTML = '<span class="status-badge badge-rolledback">Rolled back</span>';
        } else {
          const rbBtn = actionsEl.querySelector('.btn-rollback');
          if (rbBtn) rbBtn.textContent = 'Failed';
        }
      }
    } catch { /* ignore */ }
  };
}
window.rollbackAll = rollbackAll;

// ── Download All ───────────────────────────────────────────────────────────
async function downloadAll(sectionClass) {
  if (!scanResults) return;

  // Gather all mods from the relevant section that have download URLs
  let items;
  if (sectionClass === 'breaking') items = scanResults.breaking;
  else if (sectionClass === 'caution') items = scanResults.caution;
  else if (sectionClass === 'review-deps') items = scanResults.reviewDeps;
  else if (sectionClass === 'safe') items = scanResults.safeToUpdate;
  else if (sectionClass === 'update') items = scanResults.updates;
  else return;

  // Resolve dependency chain for all items in the section
  const graph = scanResults.dependencyGraph || {};
  const updateLookup = buildUpdateLookup();
  const targetIds = items.filter(i => i.hasUpdate).map(i => i.addonID);
  const chainIds = resolveDependencyChain(targetIds, graph, updateLookup);

  // Build mod list including deps
  const allMods = buildAllModsLookup();
  const seenIds = new Set();
  const mods = [];
  for (const id of chainIds) {
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const item = allMods.get(id);
    if (item && item.hasUpdate && item.downloadUrl && item.latestFile) {
      mods.push({ addonId: item.addonID, downloadUrl: item.downloadUrl, fileName: item.latestFile });
    }
  }

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
  else if (sectionClass === 'caution') items = scanResults.caution;
  else if (sectionClass === 'review-deps') items = scanResults.reviewDeps;
  else if (sectionClass === 'safe') items = scanResults.safeToUpdate;
  else if (sectionClass === 'update') items = scanResults.updates;
  else return;

  // Resolve dependency chain for all items in the section
  const graph = scanResults.dependencyGraph || {};
  const updateLookup = buildUpdateLookup();
  const allMods = buildAllModsLookup();
  const targetIds = items.filter(i => i.hasUpdate && i.latestFile).map(i => i.addonID);
  const chainIds = resolveDependencyChain(targetIds, graph, updateLookup);
  const sortedIds = topologicalSort(chainIds, graph);

  // Only include mods that have been downloaded (check download state)
  let stateResp;
  try {
    stateResp = await fetch('/api/download-state');
  } catch { return; }
  const state = await stateResp.json();

  const mods = [];
  const extraDeps = [];
  for (const id of sortedIds) {
    const item = allMods.get(id);
    if (!item || !item.hasUpdate || !item.latestFile) continue;
    const s = state[String(id)];
    if (!s || (s.status !== 'downloaded' && s.status !== 'applied')) continue;
    const entry = { addonId: item.addonID, oldFileName: item.installedFile, newFileName: item.latestFile };
    mods.push(entry);
    if (!targetIds.includes(id)) extraDeps.push(item);
  }

  if (mods.length === 0) return;

  // Show confirmation modal
  const modal = document.getElementById('apply-modal');
  const title = document.getElementById('apply-modal-title');
  const body = document.getElementById('apply-modal-body');
  const confirmBtn = document.getElementById('apply-modal-confirm');

  title.textContent = `Apply ${mods.length} Updates`;
  let bodyHtml = `<p>This will replace the following mods:</p><ul style="margin-top:0.5rem">` +
    mods.map(m => `<li>${esc(m.oldFileName)} &rarr; ${esc(m.newFileName)}</li>`).join('') +
    '</ul>';

  if (extraDeps.length > 0) {
    bodyHtml += '<p style="color:var(--yellow);margin-top:0.8rem;font-size:0.85rem">Includes dependencies from other sections:</p>';
    bodyHtml += '<ul style="margin-top:0.3rem">' + extraDeps.map(d => `<li>${esc(d.name)}</li>`).join('') + '</ul>';
  }

  body.innerHTML = bodyHtml;
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

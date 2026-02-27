import express from 'express';
import { join, dirname, resolve, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { access } from 'fs/promises';
import { execFile } from 'child_process';
import { PORT, INSTANCES_ROOT, CACHE_VERSION } from './lib/config.js';
import { listInstances, loadInstance, scanConfigRefs, runScan, pruneCache } from './lib/scanner.js';
import { downloadMod, applyMod, downloadBulk, applyBulk, rollbackMod, rollbackBulk, getDownloadState } from './lib/downloader.js';
import { loadSettings, saveSettings } from './lib/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'client', 'dist')));

// ── State ──────────────────────────────────────────────────────────────────
let selectedInstancePath = null;
let lastScanResults = null;
let lastScanVersion = null;
let scanRunning = false;
let scanAbortController = null;
let lastConfigRefs = {};
let lastRefSeverity = {};

// ── GET /api/instances ─────────────────────────────────────────────────────
app.get('/api/instances', async (req, res) => {
  try {
    const instances = await listInstances();
    const selectedName = selectedInstancePath.split(/[\\/]/).pop();
    res.json({ instances, selected: selectedName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/instance/select ──────────────────────────────────────────────
app.post('/api/instance/select', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Missing instance name' });
    return;
  }
  if (scanRunning) {
    res.status(409).json({ error: 'Cannot switch profile while a scan is running' });
    return;
  }

  const newPath = join(INSTANCES_ROOT, name);
  try {
    const data = await loadInstance(newPath);
    selectedInstancePath = newPath;
    // Clear stale results from previous profile
    lastScanResults = null;
    lastScanVersion = null;
    lastConfigRefs = {};
    lastRefSeverity = {};
    res.json({ instanceName: data.instanceName, mcVersion: data.mcVersion, loaderName: data.loaderName, modCount: data.allAddons.length });
  } catch (err) {
    res.status(400).json({ error: `Failed to load instance: ${err.message}` });
  }
});

// ── GET /api/instance ──────────────────────────────────────────────────────
app.get('/api/instance', async (req, res) => {
  try {
    const { mcVersion, loaderName, instanceName, allAddons } = await loadInstance(selectedInstancePath);
    res.json({ instanceName, mcVersion, loaderName, modCount: allAddons.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/scan/stream (SSE) ─────────────────────────────────────────────
app.get('/api/scan/stream', async (req, res) => {
  if (scanRunning) {
    res.status(409).json({ error: 'Scan already in progress' });
    return;
  }
  scanRunning = true;
  scanAbortController = new AbortController();
  const { signal } = scanAbortController;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Track client disconnect to avoid writing to a dead connection
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
    if (scanAbortController) scanAbortController.abort();
  });

  const send = (event, data) => {
    if (clientDisconnected) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const noCache = req.query.noCache === 'true';
  const limit = parseInt(req.query.limit) || 0;
  const checkChangelogs = req.query.checkChangelogs === 'true';
  const useLlm = req.query.useLlm === 'true';

  let scanOptions = { noCache, limit, checkChangelogs, signal };

  if (useLlm) {
    try {
      const settings = await loadSettings();
      if (settings.llm.enabled && settings.llm.endpoint && settings.llm.model) {
        scanOptions.useLlm = true;
        scanOptions.settings = settings;
      }
    } catch { /* fall back to keyword mode */ }
  }

  try {
    const { allAddons } = await loadInstance(selectedInstancePath);
    const { refFiles, refSeverity } = await scanConfigRefs(selectedInstancePath, allAddons);
    lastConfigRefs = refFiles;
    lastRefSeverity = refSeverity;
    lastScanVersion = CACHE_VERSION;

    let scanResults = null;
    await runScan(selectedInstancePath, scanOptions, (event) => {
      if (event.type === 'progress') {
        send('progress', event);
      } else if (event.type === 'status') {
        send('status', event);
      } else if (event.type === 'done') {
        scanResults = event.results;
      }
    });

    if (scanResults) lastScanResults = scanResults;

    if (signal.aborted) {
      send('cancelled', { reason: 'Scan cancelled' });
    } else {
      send('done', scanResults);
    }
  } catch (err) {
    if (signal.aborted) {
      send('cancelled', { reason: 'Scan cancelled' });
    } else {
      send('error', { error: err.message });
    }
  } finally {
    scanRunning = false;
    scanAbortController = null;
    res.end();
  }
});

// ── POST /api/scan/cancel ─────────────────────────────────────────────────
app.post('/api/scan/cancel', (req, res) => {
  if (!scanRunning || !scanAbortController) {
    res.status(409).json({ error: 'No scan in progress' });
    return;
  }
  scanAbortController.abort();
  res.json({ success: true });
});

// ── GET /api/scan/results ──────────────────────────────────────────────────
app.get('/api/scan/results', (req, res) => {
  if (!lastScanResults || lastScanVersion !== CACHE_VERSION) {
    res.status(404).json({ error: 'No scan results available. Run a scan first.' });
    return;
  }
  res.json(lastScanResults);
});

// ── GET /api/config-refs/:addonId ──────────────────────────────────────────
app.get('/api/config-refs/:addonId', (req, res) => {
  if (lastScanVersion !== CACHE_VERSION) {
    res.json({ addonId: req.params.addonId, files: {}, severity: null });
    return;
  }
  const addonId = req.params.addonId;
  const files = lastConfigRefs[addonId] || {};
  const severity = lastRefSeverity[addonId] || null;
  res.json({ addonId, files, severity });
});

// ── VS Code availability (cached with TTL) ──────────────────────────────────
let vsCodePromise = null;
let vsCodeCheckedAt = 0;
const VSCODE_CHECK_TTL = 5 * 60 * 1000; // 5 minutes

function checkVSCode() {
  if (vsCodePromise && Date.now() - vsCodeCheckedAt < VSCODE_CHECK_TTL) return vsCodePromise;
  vsCodeCheckedAt = Date.now();
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  vsCodePromise = new Promise((resolve) => {
    execFile(cmd, ['code'], (err) => resolve(!err));
  });
  return vsCodePromise;
}

// ── POST /api/open-file ─────────────────────────────────────────────────────
app.post('/api/open-file', async (req, res) => {
  const { filePath, line } = req.body;
  if (typeof filePath !== 'string' || !filePath || !selectedInstancePath) {
    res.status(400).json({ error: 'Missing filePath or no instance selected' });
    return;
  }

  const absPath = resolve(selectedInstancePath, filePath);
  // Validate the resolved path stays within the instance directory
  const rel = relative(selectedInstancePath, absPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    res.status(400).json({ error: 'Path escapes instance directory' });
    return;
  }

  try {
    await access(absPath);
  } catch {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const hasVSCode = await checkVSCode();
  let bin, args;

  if (hasVSCode) {
    const lineNum = typeof line === 'number' && line > 0 ? line : 1;
    bin = 'code';
    args = ['--goto', `"${absPath}:${lineNum}"`];
  } else {
    const platform = process.platform;
    if (platform === 'win32') {
      bin = 'cmd';
      args = ['/c', 'start', '""', absPath];
    } else if (platform === 'darwin') {
      bin = 'open';
      args = [absPath];
    } else {
      bin = 'xdg-open';
      args = [absPath];
    }
  }

  // code is a .cmd on Windows, so it needs shell: true to resolve
  const opts = hasVSCode && process.platform === 'win32' ? { shell: true } : {};
  execFile(bin, args, opts, (err) => {
    if (err) {
      res.status(500).json({ error: `Failed to open file: ${err.message}` });
      return;
    }
    res.json({ success: true });
  });
});

// ── POST /api/download ─────────────────────────────────────────────────────
app.post('/api/download', async (req, res) => {
  const { addonId, downloadUrl, fileName } = req.body;
  if (!addonId || !downloadUrl || !fileName) {
    res.status(400).json({ error: 'Missing addonId, downloadUrl, or fileName' });
    return;
  }
  try {
    const result = await downloadMod(addonId, downloadUrl, fileName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/download/bulk ────────────────────────────────────────────────
app.post('/api/download/bulk', async (req, res) => {
  const { mods } = req.body;
  if (!mods || !Array.isArray(mods)) {
    res.status(400).json({ error: 'Missing mods array' });
    return;
  }
  try {
    const results = await downloadBulk(mods);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/apply ────────────────────────────────────────────────────────
app.post('/api/apply', async (req, res) => {
  const { addonId, oldFileName, newFileName } = req.body;
  if (!addonId || !oldFileName || !newFileName) {
    res.status(400).json({ error: 'Missing addonId, oldFileName, or newFileName' });
    return;
  }
  try {
    const result = await applyMod(addonId, oldFileName, newFileName, selectedInstancePath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/apply/bulk ───────────────────────────────────────────────────
app.post('/api/apply/bulk', async (req, res) => {
  const { mods } = req.body;
  if (!mods || !Array.isArray(mods)) {
    res.status(400).json({ error: 'Missing mods array' });
    return;
  }
  try {
    const results = await applyBulk(mods, selectedInstancePath);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rollback ─────────────────────────────────────────────────────
app.post('/api/rollback', async (req, res) => {
  const { addonId, oldFileName, newFileName } = req.body;
  if (!addonId || !oldFileName || !newFileName) {
    res.status(400).json({ error: 'Missing addonId, oldFileName, or newFileName' });
    return;
  }
  try {
    const result = await rollbackMod(addonId, oldFileName, newFileName, selectedInstancePath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rollback/bulk ────────────────────────────────────────────────
app.post('/api/rollback/bulk', async (req, res) => {
  const { mods } = req.body;
  if (!mods || !Array.isArray(mods)) {
    res.status(400).json({ error: 'Missing mods array' });
    return;
  }
  try {
    const results = await rollbackBulk(mods, selectedInstancePath);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/download-state ────────────────────────────────────────────────
app.get('/api/download-state', (req, res) => {
  res.json(getDownloadState());
});

// ── GET /api/settings ───────────────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await loadSettings();
    // Mask API key for client
    const masked = { ...settings, llm: { ...settings.llm } };
    if (masked.llm.apiKey) {
      masked.llm.apiKey = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
    }
    res.json(masked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/settings ─────────────────────────────────────────────────────
app.post('/api/settings', async (req, res) => {
  try {
    const incoming = req.body;
    // Preserve existing API key when masked placeholder received
    if (incoming.llm && incoming.llm.apiKey === '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
      const current = await loadSettings();
      incoming.llm.apiKey = current.llm.apiKey;
    }
    const saved = await saveSettings(incoming);
    // Return masked version
    const masked = { ...saved, llm: { ...saved.llm } };
    if (masked.llm.apiKey) {
      masked.llm.apiKey = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
    }
    res.json(masked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/settings/test-llm ────────────────────────────────────────────
app.post('/api/settings/test-llm', async (req, res) => {
  try {
    const settings = await loadSettings();
    const { endpoint, apiKey, model } = settings.llm;
    if (!endpoint || !model) {
      res.status(400).json({ error: 'LLM endpoint and model must be configured' });
      return;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Respond with the word "ok".' }],
          max_tokens: 16,
          temperature: 0,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        res.json({ success: false, error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` });
        return;
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '';
      res.json({ success: true, response: content.slice(0, 100) });
    } catch (fetchErr) {
      clearTimeout(timeout);
      res.json({ success: false, error: fetchErr.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/settings/detect-concurrency ─────────────────────────────────
app.get('/api/settings/detect-concurrency', async (req, res) => {
  try {
    const settings = await loadSettings();
    const { endpoint, apiKey, model } = settings.llm;
    if (!endpoint || !model) {
      res.json({ success: false, error: 'LLM endpoint and model must be configured' });
      return;
    }

    // Derive models URL: replace /chat/completions at end of endpoint with /models
    const modelsUrl = endpoint.replace(/\/chat\/completions\/?$/, '/models');
    if (modelsUrl === endpoint) {
      res.json({ success: false, error: 'Cannot derive models URL from endpoint (expected /chat/completions suffix)' });
      return;
    }

    const headers = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const resp = await fetch(modelsUrl, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        res.json({ success: false, error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` });
        return;
      }

      const body = await resp.json();
      const allModels = body.data || [];

      // Strip any :N suffix from the configured model name to get the base name
      const baseName = model.replace(/:\d+$/, '');

      // Count models whose id, after stripping :N, matches the base name
      const matching = allModels.filter(m => {
        const id = (m.id || '').replace(/:\d+$/, '');
        return id === baseName;
      });

      res.json({ success: true, instances: matching.length, models: matching.map(m => m.id) });
    } catch (fetchErr) {
      clearTimeout(timeout);
      res.json({ success: false, error: fetchErr.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback — must come after all /api routes
app.get('/{*path}', (req, res) => {
  res.sendFile(join(__dirname, 'client', 'dist', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────
(async () => {
  // Prune stale cache entries on startup
  try {
    await pruneCache();
  } catch (err) {
    console.warn('Cache prune failed:', err.message);
  }

  // Auto-select first available instance
  try {
    const instances = await listInstances();
    if (instances.length > 0) {
      selectedInstancePath = instances[0].path;
      console.log(`Auto-selected instance: ${instances[0].name}`);
    } else {
      console.warn('No CurseForge instances found in', INSTANCES_ROOT);
    }
  } catch (err) {
    console.warn('Failed to auto-detect instances:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Mod Update Manager running at http://localhost:${PORT}`);
  });
})();

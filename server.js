import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PORT, INSTANCES_ROOT, DEFAULT_INSTANCE } from './lib/config.js';
import { listInstances, loadInstance, scanConfigRefs, scanQuestRefs, runScan } from './lib/scanner.js';
import { downloadMod, applyMod, downloadBulk, applyBulk, rollbackMod, rollbackBulk, getDownloadState } from './lib/downloader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── State ──────────────────────────────────────────────────────────────────
let selectedInstancePath = join(INSTANCES_ROOT, DEFAULT_INSTANCE);
let lastScanResults = null;
let scanRunning = false;
let lastConfigRefs = {};
let lastQuestRefs = {};

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
    lastConfigRefs = {};
    lastQuestRefs = {};
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

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const noCache = req.query.noCache === 'true';
  const limit = parseInt(req.query.limit) || 0;
  const checkChangelogs = req.query.checkChangelogs === 'true';

  try {
    const { allAddons } = await loadInstance(selectedInstancePath);
    const { refFiles } = await scanConfigRefs(selectedInstancePath, allAddons);
    lastConfigRefs = refFiles;
    const { questRefFiles } = await scanQuestRefs(selectedInstancePath, allAddons);
    lastQuestRefs = questRefFiles;

    const results = await runScan(selectedInstancePath, { noCache, limit, checkChangelogs }, (event) => {
      if (event.type === 'progress') {
        send('progress', event);
      } else if (event.type === 'status') {
        send('status', event);
      } else if (event.type === 'done') {
        lastScanResults = event.results;
        send('done', event.results);
      }
    });
  } catch (err) {
    send('error', { error: err.message });
  } finally {
    scanRunning = false;
    res.end();
  }
});

// ── GET /api/scan/results ──────────────────────────────────────────────────
app.get('/api/scan/results', (req, res) => {
  if (!lastScanResults) {
    res.status(404).json({ error: 'No scan results available. Run a scan first.' });
    return;
  }
  res.json(lastScanResults);
});

// ── GET /api/config-refs/:addonId ──────────────────────────────────────────
app.get('/api/config-refs/:addonId', (req, res) => {
  const addonId = req.params.addonId;
  const files = lastConfigRefs[addonId] || [];
  res.json({ addonId, files });
});

// ── GET /api/quest-refs/:addonId ────────────────────────────────────────────
app.get('/api/quest-refs/:addonId', (req, res) => {
  const addonId = req.params.addonId;
  const files = lastQuestRefs[addonId] || [];
  res.json({ addonId, files });
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

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Mod Update Manager running at http://localhost:${PORT}`);
});

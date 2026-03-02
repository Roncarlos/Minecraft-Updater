import { join, dirname, resolve, relative, isAbsolute, extname } from 'path';
import { fileURLToPath } from 'url';
import { readFile, writeFile, mkdir, rm, readdir, stat, cp } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { INSTANCES_ROOT } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MODPACK_DIR = join(ROOT, 'modpack-mods');
const PRESETS_INDEX = join(MODPACK_DIR, 'presets.json');
const PRESETS_DIR = join(MODPACK_DIR, 'presets');

// ── Index file lock ──────────────────────────────────────────────────────

let indexLock = Promise.resolve();

function withIndexLock(fn) {
  const next = indexLock.then(fn, fn);
  indexLock = next.catch(() => {});
  return next;
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function ensureModifierDirs() {
  await mkdir(MODPACK_DIR, { recursive: true });
  await mkdir(PRESETS_DIR, { recursive: true });
}

async function readIndex() {
  await ensureModifierDirs();
  try {
    const raw = await readFile(PRESETS_INDEX, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeIndex(index) {
  await ensureModifierDirs();
  await writeFile(PRESETS_INDEX, JSON.stringify(index, null, 2));
}

function presetDir(id) {
  return join(PRESETS_DIR, id);
}

function presetJsonPath(id) {
  return join(presetDir(id), 'preset.json');
}

function presetConfigsDir(id) {
  return join(presetDir(id), 'configs');
}

function presetModsDir(id) {
  return join(presetDir(id), 'mods');
}

async function readPresetJson(id) {
  const raw = await readFile(presetJsonPath(id), 'utf-8');
  return JSON.parse(raw);
}

async function writePresetJson(id, data) {
  await writeFile(presetJsonPath(id), JSON.stringify(data, null, 2));
}

function buildSummary(preset) {
  return {
    id: preset.id,
    name: preset.name,
    mcVersion: preset.mcVersion,
    loader: preset.loader,
    modCount: preset.mods.length,
    configCount: preset.configs.length,
    createdAt: preset.createdAt,
  };
}

async function syncIndex(id, preset) {
  return withIndexLock(async () => {
    const index = await readIndex();
    const idx = index.findIndex(p => p.id === id);
    if (idx !== -1) {
      index[idx] = buildSummary(preset);
      await writeIndex(index);
    }
  });
}

// ── Input validation ─────────────────────────────────────────────────────

const MOD_SCHEMA_KEYS = ['addonId', 'name', 'fileId', 'fileName', 'downloadUrl'];

function validateModInput(mod) {
  if (!mod || typeof mod !== 'object' || Array.isArray(mod)) {
    throw new Error('Invalid mod object');
  }
  for (const key of MOD_SCHEMA_KEYS) {
    if (mod[key] === undefined || mod[key] === null) {
      throw new Error(`Missing required mod field: ${key}`);
    }
  }
  if (typeof mod.addonId !== 'number' || !Number.isFinite(mod.addonId)) {
    throw new Error('addonId must be a finite number');
  }
  if (typeof mod.name !== 'string' || !mod.name) {
    throw new Error('name must be a non-empty string');
  }
  if (typeof mod.fileId !== 'number' || !Number.isFinite(mod.fileId)) {
    throw new Error('fileId must be a finite number');
  }
  if (typeof mod.fileName !== 'string' || !mod.fileName) {
    throw new Error('fileName must be a non-empty string');
  }
  if (typeof mod.downloadUrl !== 'string' || !mod.downloadUrl) {
    throw new Error('downloadUrl must be a non-empty string');
  }
  // Return a sanitized object with only expected keys
  return {
    addonId: mod.addonId,
    name: mod.name,
    fileId: mod.fileId,
    fileName: mod.fileName,
    downloadUrl: mod.downloadUrl,
    thumbnailUrl: typeof mod.thumbnailUrl === 'string' ? mod.thumbnailUrl : undefined,
  };
}

function validatePresetInput(name, mcVersion, loader) {
  if (name !== undefined && name !== null && typeof name !== 'string') {
    throw new Error('name must be a string');
  }
  if (mcVersion !== undefined && mcVersion !== null && typeof mcVersion !== 'string') {
    throw new Error('mcVersion must be a string');
  }
  if (loader !== undefined && loader !== null && typeof loader !== 'string') {
    throw new Error('loader must be a string');
  }
  const safeName = typeof name === 'string' ? name.slice(0, 200) : '';
  const safeMc = typeof mcVersion === 'string' ? mcVersion.slice(0, 50) : '';
  const safeLoader = typeof loader === 'string' ? loader.slice(0, 50) : '';
  return { name: safeName, mcVersion: safeMc, loader: safeLoader };
}

// ── Preset CRUD ───────────────────────────────────────────────────────────

export async function listPresets() {
  return await readIndex();
}

export async function createPreset(name, mcVersion = '', loader = '') {
  const safe = validatePresetInput(name, mcVersion, loader);
  const id = randomUUID();
  const now = new Date().toISOString();
  const preset = {
    id,
    name: safe.name || 'New Preset',
    description: '',
    mcVersion: safe.mcVersion,
    loader: safe.loader,
    createdAt: now,
    mods: [],
    configs: [],
  };

  await mkdir(presetDir(id), { recursive: true });
  await mkdir(presetConfigsDir(id), { recursive: true });
  await mkdir(presetModsDir(id), { recursive: true });
  await writePresetJson(id, preset);

  await withIndexLock(async () => {
    const index = await readIndex();
    index.push(buildSummary(preset));
    await writeIndex(index);
  });

  return preset;
}

export async function getPreset(id) {
  return await readPresetJson(id);
}

export async function updatePreset(id, updates) {
  const preset = await readPresetJson(id);
  const allowed = ['name', 'description', 'mcVersion', 'loader'];
  for (const key of allowed) {
    if (updates[key] !== undefined && typeof updates[key] === 'string') {
      preset[key] = updates[key].slice(0, key === 'description' ? 1000 : 200);
    }
  }
  await writePresetJson(id, preset);
  await syncIndex(id, preset);
  return preset;
}

export async function deletePreset(id) {
  const dir = presetDir(id);
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
  await withIndexLock(async () => {
    const index = await readIndex();
    const filtered = index.filter(p => p.id !== id);
    await writeIndex(filtered);
  });
}

// ── Preset Mods ───────────────────────────────────────────────────────────

export async function addModToPreset(id, mod) {
  const sanitized = validateModInput(mod);
  const preset = await readPresetJson(id);
  const existing = preset.mods.findIndex(m => m.addonId === sanitized.addonId);
  if (existing !== -1) {
    preset.mods[existing] = sanitized;
  } else {
    preset.mods.push(sanitized);
  }
  await writePresetJson(id, preset);
  await syncIndex(id, preset);
  return preset;
}

export async function removeModFromPreset(id, addonId) {
  if (!Number.isFinite(addonId)) {
    throw new Error('addonId must be a finite number');
  }
  const preset = await readPresetJson(id);
  preset.mods = preset.mods.filter(m => m.addonId !== addonId);
  await writePresetJson(id, preset);

  // Clean up downloaded jar if present
  const modsDir = presetModsDir(id);
  try {
    const files = await readdir(modsDir);
    for (const f of files) {
      if (f.startsWith(`${addonId}_`)) {
        await rm(join(modsDir, f), { force: true });
      }
    }
  } catch { /* mods dir may not exist */ }

  await syncIndex(id, preset);
  return preset;
}

// ── Config Management ─────────────────────────────────────────────────────

export async function listConfigs(id) {
  const configDir = presetConfigsDir(id);
  const entries = [];

  async function walk(dir, prefix = '') {
    let items;
    try { items = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const item of items) {
      const relPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        await walk(join(dir, item.name), relPath);
      } else {
        const st = await stat(join(dir, item.name));
        entries.push({ targetPath: relPath, sizeBytes: st.size });
      }
    }
  }

  await walk(configDir);
  return entries;
}

export async function importConfigsFromFolder(id, folderPath) {
  if (!folderPath || !isAbsolute(folderPath)) {
    throw new Error('Folder path must be absolute');
  }

  // Restrict to INSTANCES_ROOT to prevent arbitrary filesystem reads
  const resolved = resolve(folderPath);
  const normalizedRoot = resolve(INSTANCES_ROOT);
  const rel = relative(normalizedRoot, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Folder path must be within the instances directory');
  }

  const configDir = presetConfigsDir(id);
  const imported = [];

  async function walk(srcDir, relPrefix = '') {
    const items = await readdir(srcDir, { withFileTypes: true });
    for (const item of items) {
      const srcPath = join(srcDir, item.name);
      const relPath = relPrefix ? `${relPrefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        await walk(srcPath, relPath);
      } else {
        const destPath = join(configDir, relPath);
        await mkdir(dirname(destPath), { recursive: true });
        await cp(srcPath, destPath);
        const st = await stat(destPath);
        imported.push({ targetPath: relPath, sizeBytes: st.size });
      }
    }
  }

  await walk(folderPath);

  // Update preset configs list
  const preset = await readPresetJson(id);
  preset.configs = await listConfigs(id);
  await writePresetJson(id, preset);
  await syncIndex(id, preset);

  return imported;
}

export async function uploadConfig(id, targetPath, content) {
  // Validate path doesn't escape
  const configDir = presetConfigsDir(id);
  const absPath = resolve(configDir, targetPath);
  const rel = relative(configDir, absPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path escapes config directory');
  }

  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, 'utf-8');

  // Update preset configs
  const preset = await readPresetJson(id);
  preset.configs = await listConfigs(id);
  await writePresetJson(id, preset);
  await syncIndex(id, preset);

  const st = await stat(absPath);
  return { targetPath, sizeBytes: st.size };
}

export async function readConfig(id, targetPath) {
  const configDir = presetConfigsDir(id);
  const absPath = resolve(configDir, targetPath);
  const rel = relative(configDir, absPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path escapes config directory');
  }
  return await readFile(absPath, 'utf-8');
}

export function resolveConfigPath(id, targetPath) {
  const configDir = presetConfigsDir(id);
  const absPath = resolve(configDir, targetPath);
  const rel = relative(configDir, absPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path escapes config directory');
  }
  return absPath;
}

export async function saveConfig(id, targetPath, content) {
  return await uploadConfig(id, targetPath, content);
}

export async function deleteConfig(id, targetPath) {
  const configDir = presetConfigsDir(id);
  const absPath = resolve(configDir, targetPath);
  const rel = relative(configDir, absPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path escapes config directory');
  }

  await rm(absPath, { force: true });

  // Update preset configs
  const preset = await readPresetJson(id);
  preset.configs = await listConfigs(id);
  await writePresetJson(id, preset);
  await syncIndex(id, preset);
}

// ── Apply Preset ──────────────────────────────────────────────────────────

export async function downloadPresetMods(id) {
  const preset = await readPresetJson(id);
  const modsDir = presetModsDir(id);
  await mkdir(modsDir, { recursive: true });

  const results = [];
  for (const mod of preset.mods) {
    const destPath = join(modsDir, `${mod.addonId}_${mod.fileName}`);
    try {
      // Skip if already downloaded
      if (existsSync(destPath)) {
        results.push({ addonId: mod.addonId, fileName: mod.fileName, success: true });
        continue;
      }

      const resp = await fetch(mod.downloadUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());

      // Verify download is not empty
      if (buffer.length === 0) {
        throw new Error('Downloaded file is empty');
      }

      await writeFile(destPath, buffer);
      results.push({ addonId: mod.addonId, fileName: mod.fileName, success: true });
    } catch (err) {
      results.push({ addonId: mod.addonId, fileName: mod.fileName, success: false, error: err.message });
    }
  }

  return results;
}

export async function applyPreset(id, instanceName) {
  const preset = await readPresetJson(id);
  const instancePath = join(INSTANCES_ROOT, instanceName);

  // Verify instance exists and path doesn't escape
  const rel = relative(INSTANCES_ROOT, instancePath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Invalid instance name');
  }
  if (!existsSync(instancePath)) {
    throw new Error(`Instance not found: ${instanceName}`);
  }

  const errors = [];
  const modResults = [];
  const configResults = [];

  // 1. Copy mod JARs
  const presetModDir = presetModsDir(id);
  const instanceModDir = join(instancePath, 'mods');
  await mkdir(instanceModDir, { recursive: true });

  for (const mod of preset.mods) {
    const srcFile = join(presetModDir, `${mod.addonId}_${mod.fileName}`);
    const destFile = join(instanceModDir, mod.fileName);
    try {
      if (!existsSync(srcFile)) {
        throw new Error('Mod not downloaded. Download mods first.');
      }
      await cp(srcFile, destFile);
      modResults.push({ addonId: mod.addonId, fileName: mod.fileName, success: true });
    } catch (err) {
      modResults.push({ addonId: mod.addonId, fileName: mod.fileName, success: false, error: err.message });
      errors.push(`Mod ${mod.fileName}: ${err.message}`);
    }
  }

  // 2. Merge/copy config files
  const { mergeConfigFile } = await import('./merge.js');
  const configDir = presetConfigsDir(id);

  for (const cfg of preset.configs) {
    const srcPath = join(configDir, cfg.targetPath);
    const destPath = join(instancePath, cfg.targetPath);

    // Validate destination stays in instance
    const cfgRel = relative(instancePath, destPath);
    if (cfgRel.startsWith('..') || isAbsolute(cfgRel)) {
      configResults.push({ targetPath: cfg.targetPath, action: 'replaced', backedUp: false, success: false, error: 'Path escapes instance directory' });
      errors.push(`Config ${cfg.targetPath}: path escapes instance directory`);
      continue;
    }

    try {
      const result = await mergeConfigFile(srcPath, destPath);
      configResults.push({ targetPath: cfg.targetPath, ...result, success: true });
    } catch (err) {
      configResults.push({ targetPath: cfg.targetPath, action: 'replaced', backedUp: false, success: false, error: err.message });
      errors.push(`Config ${cfg.targetPath}: ${err.message}`);
    }
  }

  return {
    presetName: preset.name,
    instanceName,
    mods: modResults,
    configs: configResults,
    errors,
  };
}

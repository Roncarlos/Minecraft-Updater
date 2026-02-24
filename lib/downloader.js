import { createWriteStream } from 'fs';
import { mkdir, copyFile, unlink, access } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { DOWNLOADS_PATH, BACKUPS_PATH } from './config.js';

// In-memory state: addonId -> { status, fileName, oldFileName, error }
const state = new Map();

/**
 * Ensure the downloads directory exists.
 */
async function ensureDownloadsDir() {
  await mkdir(DOWNLOADS_PATH, { recursive: true });
}

/**
 * Ensure the backups directory exists.
 */
async function ensureBackupsDir() {
  await mkdir(BACKUPS_PATH, { recursive: true });
}

/**
 * Download a mod jar from CDN to the staging folder.
 */
export async function downloadMod(addonId, downloadUrl, fileName) {
  await ensureDownloadsDir();
  const key = String(addonId);
  state.set(key, { status: 'downloading', fileName, error: null });

  try {
    const resp = await fetch(downloadUrl, { signal: AbortSignal.timeout(120000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

    const dest = join(DOWNLOADS_PATH, fileName);
    const body = Readable.fromWeb(resp.body);
    await pipeline(body, createWriteStream(dest));

    state.set(key, { status: 'downloaded', fileName, error: null });
    return { success: true, fileName };
  } catch (err) {
    state.set(key, { status: 'error', fileName, error: err.message });
    throw err;
  }
}

/**
 * Apply an update: back up old jar to backups/, then copy new jar from downloads/ to mods/.
 */
export async function applyMod(addonId, oldFileName, newFileName, instancePath) {
  const key = String(addonId);
  const modsPath = join(instancePath, 'mods');
  const oldPath = join(modsPath, oldFileName);
  const newSrc = join(DOWNLOADS_PATH, newFileName);
  const newDest = join(modsPath, newFileName);

  try {
    // Verify the downloaded file exists
    await access(newSrc);
  } catch {
    throw new Error(`Downloaded file not found: ${newFileName}. Download it first.`);
  }

  try {
    // Back up old jar to backups/ folder
    try {
      await access(oldPath);
      await ensureBackupsDir();
      await copyFile(oldPath, join(BACKUPS_PATH, oldFileName));
      await unlink(oldPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // Old file already gone, that's fine — nothing to back up
    }

    // Copy new jar (not rename, avoids cross-device issues)
    await copyFile(newSrc, newDest);

    state.set(key, { status: 'applied', fileName: newFileName, oldFileName, error: null });
    return { success: true, oldFileName, newFileName };
  } catch (err) {
    state.set(key, { status: 'error', fileName: newFileName, error: err.message });
    throw err;
  }
}

/**
 * Download multiple mods sequentially.
 */
export async function downloadBulk(mods) {
  const results = [];
  for (const mod of mods) {
    try {
      const result = await downloadMod(mod.addonId, mod.downloadUrl, mod.fileName);
      results.push({ addonId: mod.addonId, ...result });
    } catch (err) {
      results.push({ addonId: mod.addonId, success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Apply multiple updates sequentially.
 */
export async function applyBulk(mods, instancePath) {
  const results = [];
  for (const mod of mods) {
    try {
      const result = await applyMod(mod.addonId, mod.oldFileName, mod.newFileName, instancePath);
      results.push({ addonId: mod.addonId, ...result });
    } catch (err) {
      results.push({ addonId: mod.addonId, success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Rollback: restore backed-up jar to mods/, remove the new jar from mods/.
 */
export async function rollbackMod(addonId, oldFileName, newFileName, instancePath) {
  const key = String(addonId);
  const modsPath = join(instancePath, 'mods');
  const backupSrc = join(BACKUPS_PATH, oldFileName);
  const oldDest = join(modsPath, oldFileName);
  const newPath = join(modsPath, newFileName);

  try {
    await access(backupSrc);
  } catch {
    throw new Error(`Backup not found: ${oldFileName}. Cannot rollback.`);
  }

  try {
    // Remove the new jar from mods/
    try {
      await unlink(newPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    // Restore backed-up jar to mods/
    await copyFile(backupSrc, oldDest);

    state.set(key, { status: 'rolledback', fileName: oldFileName, oldFileName: null, error: null });
    return { success: true, restoredFile: oldFileName, removedFile: newFileName };
  } catch (err) {
    state.set(key, { status: 'error', fileName: newFileName, oldFileName, error: err.message });
    throw err;
  }
}

/**
 * Rollback multiple mods sequentially.
 */
export async function rollbackBulk(mods, instancePath) {
  const results = [];
  for (const mod of mods) {
    try {
      const result = await rollbackMod(mod.addonId, mod.oldFileName, mod.newFileName, instancePath);
      results.push({ addonId: mod.addonId, ...result });
    } catch (err) {
      results.push({ addonId: mod.addonId, success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Get the full download/apply state map.
 */
export function getDownloadState() {
  return Object.fromEntries(state);
}

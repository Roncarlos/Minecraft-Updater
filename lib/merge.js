import { readFile, writeFile, mkdir, cp } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, extname } from 'path';

// ── Deep merge utility ────────────────────────────────────────────────────

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Deep merge source into target.
 * - Objects are recursively merged (new keys added, existing keys overridden by source)
 * - Arrays are replaced entirely by source
 * - Primitives are replaced by source
 */
export function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (isPlainObject(result[key]) && isPlainObject(source[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ── JSON merge ────────────────────────────────────────────────────────────

export function deepMergeJson(targetJson, sourceJson) {
  const target = JSON.parse(targetJson);
  const source = JSON.parse(sourceJson);
  return JSON.stringify(deepMerge(target, source), null, 2);
}

// ── TOML merge ────────────────────────────────────────────────────────────

let smolToml = null;

async function getTomlParser() {
  if (!smolToml) {
    smolToml = await import('smol-toml');
  }
  return smolToml;
}

export async function deepMergeToml(targetToml, sourceToml) {
  const toml = await getTomlParser();
  const target = toml.parse(targetToml);
  const source = toml.parse(sourceToml);
  const merged = deepMerge(target, source);
  return toml.stringify(merged);
}

// ── Backup utility ────────────────────────────────────────────────────────

export async function backupFile(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.${timestamp}.bak`;
  await cp(filePath, backupPath);
  return backupPath;
}

// ── Main merge dispatcher ─────────────────────────────────────────────────

/**
 * Merge a preset config file into an instance destination.
 * Returns { action, backedUp }
 */
export async function mergeConfigFile(srcPath, destPath) {
  const srcContent = await readFile(srcPath, 'utf-8');
  await mkdir(dirname(destPath), { recursive: true });

  // If destination doesn't exist, just copy
  if (!existsSync(destPath)) {
    await writeFile(destPath, srcContent, 'utf-8');
    return { action: 'created', backedUp: false };
  }

  const ext = extname(destPath).toLowerCase();
  const destContent = await readFile(destPath, 'utf-8');

  // JSON / JSON5 — deep merge
  if (ext === '.json' || ext === '.json5') {
    try {
      await backupFile(destPath);
      const merged = deepMergeJson(destContent, srcContent);
      await writeFile(destPath, merged, 'utf-8');
      return { action: 'merged', backedUp: true };
    } catch (err) {
      console.warn(`[merge] JSON merge failed for ${destPath}, falling back to replace: ${err.message}`);
    }
  }

  // TOML — deep merge
  if (ext === '.toml') {
    try {
      await backupFile(destPath);
      const merged = await deepMergeToml(destContent, srcContent);
      await writeFile(destPath, merged, 'utf-8');
      return { action: 'merged', backedUp: true };
    } catch (err) {
      console.warn(`[merge] TOML merge failed for ${destPath}, falling back to replace: ${err.message}`);
    }
  }

  // Everything else — replace with backup
  await backupFile(destPath);
  await writeFile(destPath, srcContent, 'utf-8');
  return { action: 'replaced', backedUp: true };
}

import { API_KEY, API_BASE, RATE_LIMIT_MS } from './config.js';

const headers = {
  'x-api-key': API_KEY,
  'Content-Type': 'application/json',
};

let lastCallTime = 0;

async function rateLimitedFetch(url) {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastCallTime = Date.now();
  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

/**
 * Get files for a mod filtered by MC version and loader type.
 * If loaderName is provided, applies client-side filtering on gameVersions
 * to ensure only files matching the target loader are returned.
 */
export async function getModFiles(addonId, mcVersion, loaderType, loaderName) {
  const url = `${API_BASE}/mods/${addonId}/files?gameVersion=${mcVersion}&modLoaderType=${loaderType}&pageSize=50`;
  const json = await rateLimitedFetch(url);
  const files = json.data || [];
  if (!loaderName) return files;
  // Client-side filter: file's gameVersions must include the loader name
  const lowerLoader = loaderName.toLowerCase();
  return files.filter(f => {
    const gv = (f.gameVersions || []).map(v => v.toLowerCase());
    return gv.some(v => v === lowerLoader);
  });
}

/**
 * Get changelog HTML for a specific file.
 */
export async function getChangelog(addonId, fileId) {
  const url = `${API_BASE}/mods/${addonId}/files/${fileId}/changelog`;
  const json = await rateLimitedFetch(url);
  return json.data || '';
}

/**
 * Get download URL for a specific file.
 */
export async function getDownloadUrl(addonId, fileId) {
  const url = `${API_BASE}/mods/${addonId}/files/${fileId}/download-url`;
  const json = await rateLimitedFetch(url);
  return json.data || null;
}

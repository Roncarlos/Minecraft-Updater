import { API_KEY, API_BASE, RATE_LIMIT_MS } from './config.js';

const headers = {
  'x-api-key': API_KEY,
  'Content-Type': 'application/json',
};

let lastCallTime = 0;

export const LOADER_MAP = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };

async function rateLimitedFetch(url, signal) {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastCallTime = Date.now();
  const timeoutSignal = AbortSignal.timeout(15000);
  const fetchSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
  const resp = await fetch(url, { headers, signal: fetchSignal });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
  return resp.json();
}

/**
 * Search mods by name/keyword.
 */
export async function searchMods(query, mcVersion, loader, pageSize = 20, signal) {
  const params = new URLSearchParams({
    gameId: '432',
    searchFilter: query,
    pageSize: String(pageSize),
    sortField: '2', // popularity
    sortOrder: 'desc',
    classId: '6', // mods class
  });
  if (mcVersion) params.set('gameVersion', mcVersion);
  if (loader) {
    const lt = LOADER_MAP[loader.toLowerCase()];
    if (lt) params.set('modLoaderType', String(lt));
  }
  const url = `${API_BASE}/mods/search?${params}`;
  const json = await rateLimitedFetch(url, signal);
  return (json.data || []).map(m => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
    summary: m.summary,
    downloadCount: m.downloadCount,
    authors: (m.authors || []).map(a => ({ name: a.name })),
    logo: m.logo ? { thumbnailUrl: m.logo.thumbnailUrl } : undefined,
    categories: (m.categories || []).map(c => ({ name: c.name })),
  }));
}

/**
 * Get files for a mod filtered by MC version and loader type.
 * If loaderName is provided, applies client-side filtering on gameVersions
 * to ensure only files matching the target loader are returned.
 */
export async function getModFiles(addonId, mcVersion, loaderType, loaderName, signal) {
  const params = new URLSearchParams({ pageSize: '50' });
  if (mcVersion) params.set('gameVersion', mcVersion);
  if (loaderType) params.set('modLoaderType', String(loaderType));
  const url = `${API_BASE}/mods/${addonId}/files?${params}`;
  const json = await rateLimitedFetch(url, signal);
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
export async function getChangelog(addonId, fileId, signal) {
  const url = `${API_BASE}/mods/${addonId}/files/${fileId}/changelog`;
  const json = await rateLimitedFetch(url, signal);
  return json.data || '';
}

/**
 * Get download URL for a specific file.
 */
export async function getDownloadUrl(addonId, fileId, signal) {
  const url = `${API_BASE}/mods/${addonId}/files/${fileId}/download-url`;
  const json = await rateLimitedFetch(url, signal);
  return json.data || null;
}

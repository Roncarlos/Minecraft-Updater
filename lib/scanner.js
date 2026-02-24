import { readFile, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import {
  INSTANCES_ROOT, CACHE_PATH, CACHE_MAX_AGE_HOURS,
  LOADER_MAP, EXCLUDED_MOD_IDS, CONFIG_EXTENSIONS, QUEST_EXTENSIONS, QUEST_DIRS, MOD_REF_REGEX,
} from './config.js';
import { extractSemver, detectVersionBump, hasBreakingKeywords, findBreakingSnippets } from './versioning.js';
import { getModFiles, getChangelog, getDownloadUrl } from './curseforge.js';
import { buildDependencyGraph } from './depgraph.js';

/**
 * List all CurseForge instances that contain a minecraftinstance.json.
 * Returns array of { name, path }.
 */
export async function listInstances() {
  const results = [];
  try {
    const entries = await readdir(INSTANCES_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const instPath = join(INSTANCES_ROOT, entry.name);
      const instFile = join(instPath, 'minecraftinstance.json');
      try {
        await readFile(instFile, 'utf-8');
        results.push({ name: entry.name, path: instPath });
      } catch { /* no minecraftinstance.json, skip */ }
    }
  } catch { /* instances root not readable */ }
  return results;
}

/**
 * Load instance data from minecraftinstance.json.
 */
export async function loadInstance(instancePath) {
  const instanceFile = join(instancePath, 'minecraftinstance.json');
  const raw = await readFile(instanceFile, 'utf-8');
  const instance = JSON.parse(raw);

  const mcVersion = instance.gameVersion;
  const loaderType = instance.baseModLoader.type;
  const loaderName = LOADER_MAP[loaderType] || `Unknown (${loaderType})`;
  const instanceName = instance.manifest?.name || instancePath.split(/[\\/]/).pop();
  const allAddons = instance.installedAddons || [];

  return { mcVersion, loaderType, loaderName, instanceName, allAddons };
}

/**
 * Load the cache from disk.
 */
async function loadCache() {
  try {
    const raw = await readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save cache to disk.
 */
async function saveCache(cache) {
  const { writeFile } = await import('fs/promises');
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Recursively find files matching given extensions in a directory.
 */
async function findFiles(dir, extensions) {
  const results = [];
  const extSet = new Set(extensions.map(e => e.replace('*', '')));
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await findFiles(fullPath, extensions));
      } else if (extSet.has(extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  return results;
}

/**
 * Build modid -> addonID mapping and scan config files for mod references.
 * Returns { refCounts, refFiles } maps keyed by addonID.
 */
export async function scanConfigRefs(instancePath, allAddons) {
  // Build modid -> addonID mapping
  const modIdToAddon = new Map();
  const addonToModIds = new Map();

  for (const a of allAddons) {
    const candidates = [];

    // 1. URL slug
    if (a.webSiteURL) {
      const rawSlug = a.webSiteURL.split('/').pop();
      candidates.push(rawSlug.toLowerCase());
      const cleanSlug = rawSlug.replace(/-/g, '').toLowerCase();
      if (cleanSlug !== rawSlug.toLowerCase()) {
        candidates.push(cleanSlug);
      }
    }

    // 2. Filename prefix
    if (a.installedFile?.fileName) {
      const fn = a.installedFile.fileName.replace(/\.jar$/i, '');
      const match = fn.match(/^([A-Za-z][A-Za-z0-9_]*?)[-_+]/);
      if (match) candidates.push(match[1].toLowerCase());
    }

    // 3. Mod name lowercased, no spaces/special chars
    if (a.name) {
      candidates.push(a.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
    }

    addonToModIds.set(a.addonID, candidates);
    for (const mid of candidates) {
      if (!modIdToAddon.has(mid)) {
        modIdToAddon.set(mid, a.addonID);
      }
    }
  }

  // Scan config directories
  const refCounts = new Map(); // addonID -> count
  const refFiles = new Map();  // addonID -> Set of file paths

  const configDirs = [
    join(instancePath, 'config'),
    join(instancePath, 'kubejs'),
    join(instancePath, 'defaultconfigs'),
  ];
  const extList = CONFIG_EXTENSIONS;

  for (const dir of configDirs) {
    const files = await findFiles(dir, extList);
    for (const filePath of files) {
      let content;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch { continue; }
      if (!content) continue;

      // Determine owner of this config file
      const relPath = filePath.substring(instancePath.length).replace(/^[\\/]+/, '').replace(/\\/g, '/');
      const pathParts = relPath.split('/');
      let ownerAddonId = null;
      if (pathParts.length >= 2) {
        const subDir = pathParts[1].toLowerCase();
        if (modIdToAddon.has(subDir)) {
          ownerAddonId = modIdToAddon.get(subDir);
        }
      }

      const lower = content.toLowerCase();
      // Reset regex lastIndex for global matching
      const regex = new RegExp(MOD_REF_REGEX.source, 'g');
      let m;
      while ((m = regex.exec(lower)) !== null) {
        const foundModId = m[1];
        if (EXCLUDED_MOD_IDS.has(foundModId)) continue;
        if (!modIdToAddon.has(foundModId)) continue;

        const referencedAddonId = modIdToAddon.get(foundModId);

        // Skip self-references
        if (ownerAddonId !== null && referencedAddonId === ownerAddonId) continue;

        if (!refCounts.has(referencedAddonId)) {
          refCounts.set(referencedAddonId, 0);
          refFiles.set(referencedAddonId, new Set());
        }
        refCounts.set(referencedAddonId, refCounts.get(referencedAddonId) + 1);
        refFiles.get(referencedAddonId).add(relPath);
      }
    }
  }

  // Convert Sets to arrays for JSON serialization
  const refFilesObj = {};
  for (const [id, fileSet] of refFiles) {
    refFilesObj[id] = [...fileSet];
  }

  return { refCounts: Object.fromEntries(refCounts), refFiles: refFilesObj };
}

/**
 * Scan quest files (FTB Quests .snbt, etc.) for mod item references.
 * Returns { questRefCounts, questRefFiles } maps keyed by addonID.
 * Uses the same modIdToAddon mapping built from allAddons.
 */
export async function scanQuestRefs(instancePath, allAddons) {
  // Build modid -> addonID mapping (same logic as config refs)
  const modIdToAddon = new Map();
  for (const a of allAddons) {
    const candidates = [];
    if (a.webSiteURL) {
      const rawSlug = a.webSiteURL.split('/').pop();
      candidates.push(rawSlug.toLowerCase());
      const cleanSlug = rawSlug.replace(/-/g, '').toLowerCase();
      if (cleanSlug !== rawSlug.toLowerCase()) candidates.push(cleanSlug);
    }
    if (a.installedFile?.fileName) {
      const fn = a.installedFile.fileName.replace(/\.jar$/i, '');
      const match = fn.match(/^([A-Za-z][A-Za-z0-9_]*?)[-_+]/);
      if (match) candidates.push(match[1].toLowerCase());
    }
    if (a.name) {
      candidates.push(a.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
    }
    for (const mid of candidates) {
      if (!modIdToAddon.has(mid)) modIdToAddon.set(mid, a.addonID);
    }
  }

  const questRefCounts = new Map();
  const questRefFiles = new Map();

  // Scan known quest directories
  for (const questDir of QUEST_DIRS) {
    const fullDir = join(instancePath, questDir);
    const files = await findFiles(fullDir, QUEST_EXTENSIONS);
    for (const filePath of files) {
      let content;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch { continue; }
      if (!content) continue;

      const relPath = filePath.substring(instancePath.length).replace(/^[\\/]+/, '').replace(/\\/g, '/');
      const lower = content.toLowerCase();
      const regex = new RegExp(MOD_REF_REGEX.source, 'g');
      let m;
      while ((m = regex.exec(lower)) !== null) {
        const foundModId = m[1];
        if (EXCLUDED_MOD_IDS.has(foundModId)) continue;
        if (foundModId === 'ftbquests') continue; // skip quest system self-refs
        if (!modIdToAddon.has(foundModId)) continue;

        const referencedAddonId = modIdToAddon.get(foundModId);
        if (!questRefCounts.has(referencedAddonId)) {
          questRefCounts.set(referencedAddonId, 0);
          questRefFiles.set(referencedAddonId, new Set());
        }
        questRefCounts.set(referencedAddonId, questRefCounts.get(referencedAddonId) + 1);
        questRefFiles.get(referencedAddonId).add(relPath);
      }
    }
  }

  const questRefFilesObj = {};
  for (const [id, fileSet] of questRefFiles) {
    questRefFilesObj[id] = [...fileSet];
  }

  return { questRefCounts: Object.fromEntries(questRefCounts), questRefFiles: questRefFilesObj };
}

/**
 * Main scan loop. Calls onProgress(event) for SSE streaming.
 * Returns { breaking, safeToUpdate, updates, upToDate, errors, metadata }.
 */
export async function runScan(instancePath, options = {}, onProgress = () => {}) {
  const { noCache = false, limit = 0, checkChangelogs = false } = options;

  const { mcVersion, loaderType, loaderName, instanceName, allAddons } = await loadInstance(instancePath);

  onProgress({ type: 'status', message: 'Scanning config files...' });
  const { refCounts, refFiles } = await scanConfigRefs(instancePath, allAddons);

  onProgress({ type: 'status', message: 'Scanning quest files...' });
  const { questRefCounts, questRefFiles } = await scanQuestRefs(instancePath, allAddons);

  onProgress({ type: 'status', message: 'Loading cache...' });
  let cache = noCache ? {} : await loadCache();

  const addons = limit > 0 ? allAddons.slice(0, limit) : allAddons;
  const total = addons.length;
  const now = Date.now();
  const maxAge = CACHE_MAX_AGE_HOURS * 3600 * 1000;

  const results = [];
  const errors = [];

  for (let i = 0; i < total; i++) {
    const addon = addons[i];
    const addonID = addon.addonID;
    const installedFile = addon.installedFile;
    const installedId = installedFile.id;
    const installedName = installedFile.fileName;
    const installedDate = installedFile.fileDate;
    const modName = addon.name;
    const modUrl = addon.webSiteURL;
    const configRefCount = refCounts[addonID] || 0;
    const configFilesList = refFiles[addonID] || [];
    const questRefCount = questRefCounts[addonID] || 0;
    const questFilesList = questRefFiles[addonID] || [];

    // Extract deps from installed file (minecraftinstance.json uses addonId/type)
    const installedDeps = (installedFile.dependencies || [])
      .filter(d => d.type === 3)
      .map(d => d.addonId);

    // Check cache
    const cKey = String(addonID);
    let useCache = false;
    if (!noCache && cache[cKey]) {
      try {
        const checkedAt = new Date(cache[cKey].checkedAt).getTime();
        if (now - checkedAt < maxAge) {
          useCache = true;
        }
      } catch { /* invalid date, skip cache */ }
    }

    const source = useCache ? 'cached' : 'API';
    onProgress({
      type: 'progress',
      current: i + 1,
      total,
      modName,
      source,
    });

    if (useCache) {
      const cached = cache[cKey];
      const installedVer = extractSemver(installedName);
      const hasUpdate = cached.latestFileId !== installedId;

      let isBreaking = false;
      let breakingReason = null;

      // Re-evaluate cached changelogs against current keyword list
      let flaggedChangelogs = null;
      const cachedCLs = cached.cachedChangelogs || null;
      if (hasUpdate && cachedCLs && cachedCLs.length > 0) {
        flaggedChangelogs = [];
        for (const entry of cachedCLs) {
          const snippets = findBreakingSnippets(entry.changelogHtml);
          if (snippets.length > 0) {
            flaggedChangelogs.push({
              ...entry,
              keywords: snippets.map(s => s.keyword),
              snippets,
            });
          }
        }
        if (flaggedChangelogs.length === 0) flaggedChangelogs = null;
      }

      if (hasUpdate) {
        const vbump = detectVersionBump(installedVer, cached.latestVersion);
        if (vbump.isBump) {
          isBreaking = true;
          breakingReason = `${vbump.type} version bump: ${installedVer} -> ${cached.latestVersion}`;
        }
        if (flaggedChangelogs && flaggedChangelogs.length > 0) {
          isBreaking = true;
          const kwSummary = `breaking keywords in ${flaggedChangelogs.length} changelog(s)`;
          breakingReason = breakingReason ? breakingReason + ' + ' + kwSummary : kwSummary;
        }
      }

      results.push({
        name: modName,
        addonID,
        installedFile: installedName,
        installedDate,
        installedVersion: installedVer,
        latestFile: cached.latestFileName,
        latestDate: cached.latestFileDate,
        latestFileId: cached.latestFileId,
        latestVersion: cached.latestVersion,
        downloadUrl: cached.downloadUrl || null,
        hasUpdate,
        isBreaking,
        breakingReason,
        changelogHtml: null,
        flaggedChangelogs,
        url: modUrl,
        configRefs: configRefCount,
        configFiles: configFilesList,
        questRefs: questRefCount,
        questFiles: questFilesList,
        dependencies: cached.dependencies || installedDeps,
      });
      continue;
    }

    // Query API
    try {
      const files = await getModFiles(addonID, mcVersion, loaderType);

      if (!files || files.length === 0) {
        results.push({
          name: modName,
          addonID,
          installedFile: installedName,
          installedDate,
          installedVersion: extractSemver(installedName),
          latestFile: null,
          latestDate: null,
          latestFileId: null,
          latestVersion: null,
          downloadUrl: null,
          hasUpdate: false,
          isBreaking: false,
          breakingReason: null,
          changelogHtml: null,
          url: modUrl,
          configRefs: configRefCount,
          configFiles: configFilesList,
          questRefs: questRefCount,
          questFiles: questFilesList,
          dependencies: installedDeps,
        });
        continue;
      }

      // Find latest release (releaseType=1), fallback to any
      const releases = files.filter(f => f.releaseType === 1).sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate));
      const latest = releases.length > 0 ? releases[0] : files.sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate))[0];

      const hasUpdate = latest.id !== installedId;
      const installedVer = extractSemver(installedName);
      const latestVer = extractSemver(latest.fileName);

      // Extract required dependencies (type 3 = RequiredDependency)
      // API response uses modId/relationType, not addonId/type
      const apiDeps = (latest.dependencies || [])
        .filter(d => d.relationType === 3)
        .map(d => d.modId);
      const dependencies = apiDeps.length > 0 ? apiDeps : installedDeps;

      // Get download URL
      let downloadUrl = latest.downloadUrl || null;
      if (!downloadUrl) {
        try {
          downloadUrl = await getDownloadUrl(addonID, latest.id);
        } catch { /* not critical */ }
      }

      // Update cache
      cache[cKey] = {
        latestFileId: latest.id,
        latestFileName: latest.fileName,
        latestFileDate: String(latest.fileDate),
        latestVersion: latestVer,
        downloadUrl,
        dependencies,
        checkedAt: new Date().toISOString(),
      };

      // Determine breaking change
      let isBreaking = false;
      let breakingReason = null;
      let changelogHtml = null;
      let flaggedChangelogs = null;

      if (hasUpdate) {
        const vbump = detectVersionBump(installedVer, latestVer);
        if (vbump.isBump) {
          isBreaking = true;
          breakingReason = `${vbump.type} version bump: ${installedVer} -> ${latestVer}`;
        }

        if (checkChangelogs) {
          // Identify intermediate files: between installed and latest by date
          const installedTime = new Date(installedDate).getTime();
          const latestTime = new Date(latest.fileDate).getTime();
          const intermediateFiles = files
            .filter(f => {
              const t = new Date(f.fileDate).getTime();
              return t > installedTime && t <= latestTime && f.id !== installedId;
            })
            .sort((a, b) => new Date(a.fileDate) - new Date(b.fileDate));

          const versionCount = intermediateFiles.length;
          if (versionCount > 1) {
            onProgress({ type: 'status', message: `Checking changelogs for ${modName} (${versionCount} versions)...` });
          }

          // Fetch ALL changelogs and cache them raw
          const allChangelogs = [];
          for (const file of intermediateFiles) {
            try {
              const cl = await getChangelog(addonID, file.id);
              if (!cl) continue;
              if (file.id === latest.id) changelogHtml = cl;
              allChangelogs.push({
                fileId: file.id,
                fileName: file.fileName,
                fileDate: file.fileDate,
                changelogHtml: cl,
              });
            } catch { /* skip this version, continue */ }
          }

          // If latest wasn't in intermediateFiles (single version jump), fetch it separately
          if (!intermediateFiles.some(f => f.id === latest.id)) {
            try {
              const cl = await getChangelog(addonID, latest.id);
              if (cl) {
                changelogHtml = cl;
                allChangelogs.push({
                  fileId: latest.id,
                  fileName: latest.fileName,
                  fileDate: latest.fileDate,
                  changelogHtml: cl,
                });
              }
            } catch { /* not critical */ }
          }

          // Store all changelogs in cache
          cache[cKey].cachedChangelogs = allChangelogs.length > 0 ? allChangelogs : null;

          // Derive flagged changelogs from the raw data
          flaggedChangelogs = [];
          for (const entry of allChangelogs) {
            const snippets = findBreakingSnippets(entry.changelogHtml);
            if (snippets.length > 0) {
              flaggedChangelogs.push({
                ...entry,
                keywords: snippets.map(s => s.keyword),
                snippets,
              });
            }
          }

          if (flaggedChangelogs.length > 0) {
            isBreaking = true;
            const kwSummary = `breaking keywords in ${flaggedChangelogs.length} changelog(s)`;
            breakingReason = breakingReason ? breakingReason + ' + ' + kwSummary : kwSummary;
          }

          if (flaggedChangelogs.length === 0) flaggedChangelogs = null;
        }
      }

      results.push({
        name: modName,
        addonID,
        installedFile: installedName,
        installedDate,
        installedVersion: installedVer,
        latestFile: latest.fileName,
        latestDate: latest.fileDate,
        latestFileId: latest.id,
        latestVersion: latestVer,
        downloadUrl,
        hasUpdate,
        isBreaking,
        breakingReason,
        changelogHtml,
        flaggedChangelogs,
        url: modUrl,
        configRefs: configRefCount,
        configFiles: configFilesList,
        questRefs: questRefCount,
        questFiles: questFilesList,
        dependencies,
      });
    } catch (err) {
      errors.push({
        name: modName,
        addonID,
        error: err.message,
      });
    }
  }

  // Save cache
  try {
    await saveCache(cache);
  } catch { /* not critical */ }

  // Build dependency graph
  const { graph, missingDeps } = buildDependencyGraph(results);

  // Serialize graph to plain objects for JSON transport
  const dependencyGraph = {};
  for (const [id, node] of graph) {
    dependencyGraph[id] = { deps: node.deps, reverseDeps: node.reverseDeps };
  }

  // Classify
  const breaking = results.filter(r => r.isBreaking && r.configRefs > 0).sort((a, b) => a.name.localeCompare(b.name));
  const safeToUpdate = results.filter(r => r.isBreaking && r.configRefs === 0).sort((a, b) => a.name.localeCompare(b.name));
  const updates = results.filter(r => r.hasUpdate && !r.isBreaking).sort((a, b) => a.name.localeCompare(b.name));
  const upToDate = results.filter(r => !r.hasUpdate).sort((a, b) => a.name.localeCompare(b.name));

  const scanResults = {
    metadata: { instanceName, mcVersion, loaderName, totalMods: allAddons.length, scannedMods: total },
    breaking,
    safeToUpdate,
    updates,
    upToDate,
    errors,
    dependencyGraph,
    missingDeps,
  };

  onProgress({ type: 'done', results: scanResults });

  return scanResults;
}

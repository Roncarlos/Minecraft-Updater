import { readFile, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import {
  INSTANCES_ROOT, CACHE_PATH, CACHE_MAX_AGE_HOURS,
  LOADER_MAP, EXCLUDED_MOD_IDS, CONFIG_EXTENSIONS, MOD_REF_REGEX, FILE_SEVERITY_RULES,
} from './config.js';
import { extractSemver, detectVersionBump, hasBreakingKeywords, findBreakingSnippets } from './versioning.js';
import { getModFiles, getChangelog, getDownloadUrl } from './curseforge.js';
import { buildDependencyGraph } from './depgraph.js';
import { analyzeChangelogs } from './llm.js';

function worstLlmSeverity(llmChangelogs) {
  if (!llmChangelogs || llmChangelogs.length === 0) return null;
  const sevs = llmChangelogs.map(e => e.llmAnalysis?.severity).filter(Boolean);
  if (sevs.length === 0) return null;
  if (sevs.includes('breaking')) return 'breaking';
  if (sevs.includes('caution')) return 'caution';
  return 'safe';
}

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
 * Classify a file path into a severity tier using FILE_SEVERITY_RULES.
 * Returns 'high', 'medium', or 'low'.
 */
function classifyFileSeverity(relPath) {
  for (const rule of FILE_SEVERITY_RULES) {
    if (rule.pattern.test(relPath)) return rule.tier;
  }
  return 'medium'; // default if no rule matches
}

/**
 * Build modid -> addonID mapping and scan all reference directories for mod references.
 * Returns { refCounts, refFiles, refSeverity } maps keyed by addonID.
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

  // Scan all relevant directories
  const refCounts = new Map(); // addonID -> count
  const refFiles = new Map();  // addonID -> Set of file paths
  const refTierCounts = new Map(); // addonID -> { high: N, medium: N, low: N }

  const configDirs = [
    join(instancePath, 'config'),
    join(instancePath, 'kubejs'),
    join(instancePath, 'defaultconfigs'),
    join(instancePath, 'scripts'),
    join(instancePath, 'datapacks'),
    join(instancePath, 'patchouli_books'),
    join(instancePath, 'resourcepacks'),
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

      const fileTier = classifyFileSeverity(relPath);

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
          refTierCounts.set(referencedAddonId, { high: 0, medium: 0, low: 0 });
        }
        refCounts.set(referencedAddonId, refCounts.get(referencedAddonId) + 1);
        refFiles.get(referencedAddonId).add(relPath);
        refTierCounts.get(referencedAddonId)[fileTier]++;
      }
    }
  }

  // Convert Sets to arrays for JSON serialization
  const refFilesObj = {};
  for (const [id, fileSet] of refFiles) {
    refFilesObj[id] = [...fileSet];
  }

  // Build severity summary per addon
  const refSeverity = {};
  for (const [id, counts] of refTierCounts) {
    let severity = 'low';
    if (counts.medium > 0) severity = 'medium';
    if (counts.high > 0) severity = 'high';
    refSeverity[id] = { severity, high: counts.high, medium: counts.medium, low: counts.low };
  }

  return { refCounts: Object.fromEntries(refCounts), refFiles: refFilesObj, refSeverity };
}

/**
 * Main scan loop. Calls onProgress(event) for SSE streaming.
 * Returns { breaking, safeToUpdate, updates, upToDate, errors, metadata }.
 */
export async function runScan(instancePath, options = {}, onProgress = () => {}) {
  const { noCache = false, limit = 0, checkChangelogs = false, useLlm = false, settings = null } = options;

  const { mcVersion, loaderType, loaderName, instanceName, allAddons } = await loadInstance(instancePath);

  onProgress({ type: 'status', message: 'Scanning references...' });
  const { refCounts, refFiles, refSeverity } = await scanConfigRefs(instancePath, allAddons);

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
    const totalRefs = refCounts[addonID] || 0;
    const refFilesList = refFiles[addonID] || [];
    const addonSeverity = refSeverity[addonID] || null;

    // Extract deps from installed file (minecraftinstance.json uses addonId/type)
    const installedDeps = (installedFile.dependencies || [])
      .filter(d => d.type === 3)
      .map(d => d.addonId);

    // Check cache
    const cKey = `${addonID}-${mcVersion}-${loaderType}`;
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

      let hasVersionBump = false;
      let hasKeywordFlag = false;
      let breakingReason = null;

      // Re-evaluate cached changelogs
      let flaggedChangelogs = null;
      let llmChangelogs = null;
      const cachedCLs = cached.cachedChangelogs || null;

      if (hasUpdate && cachedCLs && cachedCLs.length > 0) {
        if (useLlm && settings) {
          // LLM mode: use cached LLM results or run LLM against cached changelogs
          if (cached.llmChangelogs && cached.llmChangelogs.length > 0) {
            llmChangelogs = cached.llmChangelogs;
          } else {
            onProgress({ type: 'status', message: `LLM analyzing changelogs for ${modName}...` });
            try {
              llmChangelogs = await analyzeChangelogs(cachedCLs, modName, settings);
              // Update cache with LLM results
              cache[cKey].llmChangelogs = llmChangelogs;
            } catch {
              llmChangelogs = null;
            }
          }
        } else {
          // Keyword mode
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
      }

      if (hasUpdate) {
        const vbump = detectVersionBump(installedVer, cached.latestVersion);
        if (vbump.isBump) {
          hasVersionBump = true;
          breakingReason = `${vbump.type} version bump: ${installedVer} -> ${cached.latestVersion}`;
        }
        if (llmChangelogs && llmChangelogs.some(e => e.llmAnalysis?.severity === 'breaking')) {
          const llmSummary = 'LLM detected breaking changes';
          breakingReason = breakingReason ? breakingReason + ' + ' + llmSummary : llmSummary;
        }
        if (flaggedChangelogs && flaggedChangelogs.length > 0) {
          hasKeywordFlag = true;
          const kwSummary = `breaking keywords in ${flaggedChangelogs.length} changelog(s)`;
          breakingReason = breakingReason ? breakingReason + ' + ' + kwSummary : kwSummary;
        }
      }

      const llmSeverity = worstLlmSeverity(llmChangelogs);
      const isBreaking = llmSeverity === 'breaking' || (llmSeverity === null && (hasVersionBump || hasKeywordFlag));

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
        llmChangelogs,
        llmSeverity,
        hasVersionBump,
        hasKeywordFlag,
        url: modUrl,
        refs: totalRefs,
        refFiles: refFilesList,
        refSeverity: addonSeverity,
        dependencies: cached.dependencies || installedDeps,
      });
      continue;
    }

    // Query API
    try {
      const files = await getModFiles(addonID, mcVersion, loaderType, loaderName);

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
          llmSeverity: null,
          hasVersionBump: false,
          hasKeywordFlag: false,
          url: modUrl,
          refs: totalRefs,
          refFiles: refFilesList,
          refSeverity: addonSeverity,
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
      let hasVersionBump = false;
      let hasKeywordFlag = false;
      let breakingReason = null;
      let changelogHtml = null;
      let flaggedChangelogs = null;
      let llmChangelogs = null;

      if (hasUpdate) {
        const vbump = detectVersionBump(installedVer, latestVer);
        if (vbump.isBump) {
          hasVersionBump = true;
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

          // Analysis branch: LLM or keyword
          if (useLlm && settings && allChangelogs.length > 0) {
            onProgress({ type: 'status', message: `LLM analyzing changelogs for ${modName}...` });
            try {
              llmChangelogs = await analyzeChangelogs(allChangelogs, modName, settings);
              cache[cKey].llmChangelogs = llmChangelogs;

              if (llmChangelogs.some(e => e.llmAnalysis?.severity === 'breaking')) {
                const llmSummary = 'LLM detected breaking changes';
                breakingReason = breakingReason ? breakingReason + ' + ' + llmSummary : llmSummary;
              }
            } catch {
              // Fall back to keyword mode on LLM failure
              llmChangelogs = null;
            }
          }

          // Keyword mode (either primary or fallback)
          if (!llmChangelogs) {
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
              hasKeywordFlag = true;
              const kwSummary = `breaking keywords in ${flaggedChangelogs.length} changelog(s)`;
              breakingReason = breakingReason ? breakingReason + ' + ' + kwSummary : kwSummary;
            }

            if (flaggedChangelogs.length === 0) flaggedChangelogs = null;
          }
        }
      }

      const llmSeverity = worstLlmSeverity(llmChangelogs);
      const isBreaking = llmSeverity === 'breaking' || (llmSeverity === null && (hasVersionBump || hasKeywordFlag));

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
        llmChangelogs,
        llmSeverity,
        hasVersionBump,
        hasKeywordFlag,
        url: modUrl,
        refs: totalRefs,
        refFiles: refFilesList,
        refSeverity: addonSeverity,
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
  const sort = (a, b) => a.name.localeCompare(b.name);

  const breaking = results.filter(r => {
    if (!r.hasUpdate || r.llmSeverity === 'safe') return false;
    if (r.llmSeverity === 'breaking') return true;
    if (r.llmSeverity === null && (r.hasVersionBump || r.hasKeywordFlag) && r.refSeverity && r.refSeverity.severity === 'high') return true;
    return false;
  }).sort(sort);

  const caution = results.filter(r => {
    if (!r.hasUpdate || r.llmSeverity === 'safe') return false;
    if (r.llmSeverity === 'caution') return true;
    if (r.llmSeverity === null && (r.hasVersionBump || r.hasKeywordFlag) && (!r.refSeverity || r.refSeverity.severity !== 'high')) return true;
    return false;
  }).sort(sort);

  const breakingIds = new Set(breaking.map(r => r.addonID));
  const cautionIds = new Set(caution.map(r => r.addonID));

  const safeAll = results.filter(r => r.hasUpdate && r.llmSeverity === 'safe').sort(sort);
  const reviewDeps = safeAll.filter(r => {
    const deps = r.dependencies || [];
    return deps.some(d => breakingIds.has(d) || cautionIds.has(d));
  });
  const reviewDepsIds = new Set(reviewDeps.map(r => r.addonID));
  const safeToUpdate = safeAll.filter(r => !reviewDepsIds.has(r.addonID));

  const updates = results.filter(r => r.hasUpdate && r.llmSeverity === null && !r.hasVersionBump && !r.hasKeywordFlag).sort(sort);
  const upToDate = results.filter(r => !r.hasUpdate).sort(sort);

  const scanResults = {
    metadata: { instanceName, mcVersion, loaderName, totalMods: allAddons.length, scannedMods: total },
    breaking,
    caution,
    reviewDeps,
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

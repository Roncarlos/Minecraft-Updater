/**
 * Builds a token-efficient JSON report from scan results for LLM consumption.
 */

import { FILE_SEVERITY_RULES } from './config.js';
import { htmlToText } from './html-to-text.js';

const CATEGORIES = ['breaking', 'caution', 'reviewDeps', 'safeToUpdate', 'updates', 'upToDate'];

// Map scan-result category keys to the report output keys
const CATEGORY_RENAMES = { updates: 'updatesAvailable' };

// ── Helpers ─────────────────────────────────────────────────────────────────

function classifyFileSeverity(relPath) {
  for (const rule of FILE_SEVERITY_RULES) {
    if (rule.pattern.test(relPath)) return rule.tier;
  }
  return 'medium';
}

/** Map<addonID, { name, url, hasUpdate, category }> across all categories. */
function buildAddonLookup(scanResults) {
  const lookup = new Map();
  for (const cat of CATEGORIES) {
    for (const mod of scanResults[cat] || []) {
      lookup.set(mod.addonID, { name: mod.name, url: mod.url, hasUpdate: mod.hasUpdate, category: CATEGORY_RENAMES[cat] || cat });
    }
  }
  return lookup;
}

/**
 * Merge llmChangelogs + flaggedChangelogs into a single plain-text array.
 * LLM entries take priority; keyword-only entries fill in gaps.
 */
function transformChangelogs(mod) {
  const seen = new Set();
  const entries = [];

  // LLM changelogs first
  if (mod.llmChangelogs) {
    for (const e of mod.llmChangelogs) {
      seen.add(e.fileId);
      const entry = {
        fileName: e.fileName,
        fileDate: e.fileDate ? e.fileDate.split('T')[0] : null,
        text: htmlToText(e.changelogHtml),
      };
      if (e.llmAnalysis) {
        entry.llmAnalysis = {};
        if (e.llmAnalysis.severity) entry.llmAnalysis.severity = e.llmAnalysis.severity;
        if (e.llmAnalysis.summary) entry.llmAnalysis.summary = e.llmAnalysis.summary;
        if (e.llmAnalysis.breakingItems?.length) entry.llmAnalysis.breakingItems = e.llmAnalysis.breakingItems;
        // Drop empty analysis object
        if (Object.keys(entry.llmAnalysis).length === 0) delete entry.llmAnalysis;
      }
      entries.push(entry);
    }
  }

  // Flagged (keyword) changelogs that weren't covered by LLM
  if (mod.flaggedChangelogs) {
    for (const e of mod.flaggedChangelogs) {
      if (seen.has(e.fileId)) continue;
      entries.push({
        fileName: e.fileName,
        fileDate: e.fileDate ? e.fileDate.split('T')[0] : null,
        text: htmlToText(e.changelogHtml),
      });
    }
  }

  return entries.length > 0 ? entries : null;
}

/** Collect unique keyword matches from flaggedChangelogs. */
function collectKeywordMatches(mod) {
  if (!mod.flaggedChangelogs) return null;
  const matches = [];
  const seen = new Set();
  for (const entry of mod.flaggedChangelogs) {
    if (!entry.snippets) continue;
    for (const s of entry.snippets) {
      const key = `${s.keyword}::${s.snippet}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ keyword: s.keyword, snippet: s.snippet });
    }
  }
  return matches.length > 0 ? matches : null;
}

/** Inline config refs for a mod, with file paths, line numbers, and tier. */
function transformConfigRefs(addonID, configRefs, refSeverity) {
  const fileMap = configRefs[addonID];
  const sevInfo = refSeverity[addonID];
  if (!fileMap || Object.keys(fileMap).length === 0) return null;

  const files = [];
  for (const [path, lines] of Object.entries(fileMap)) {
    files.push({ path, lines, tier: classifyFileSeverity(path) });
  }

  return {
    severity: sevInfo?.severity || 'medium',
    counts: {
      high: sevInfo?.high || 0,
      medium: sevInfo?.medium || 0,
      low: sevInfo?.low || 0,
    },
    files,
  };
}

/** Resolve dep IDs to { addonID, name, category } using the addon lookup. */
function transformDependencies(mod, graph, lookup) {
  const node = graph[mod.addonID];
  if (!node) return null;

  const requires = [];
  for (const depId of node.deps) {
    const info = lookup.get(depId);
    requires.push({
      addonID: depId,
      name: info?.name || `Unknown (${depId})`,
      category: info?.category || 'unknown',
    });
  }

  const requiredBy = [];
  for (const revId of node.reverseDeps) {
    const info = lookup.get(revId);
    requiredBy.push({
      addonID: revId,
      name: info?.name || `Unknown (${revId})`,
      category: info?.category || 'unknown',
    });
  }

  if (requires.length === 0 && requiredBy.length === 0) return null;

  const result = {};
  if (requires.length > 0) result.requires = requires;
  if (requiredBy.length > 0) result.requiredBy = requiredBy;
  return result;
}

/** Transform a single mod into the report format. */
function transformMod(mod, lookup, graph, configRefs, refSeverity) {
  const entry = {
    addonID: mod.addonID,
    name: mod.name,
    url: mod.url,
    installedVersion: mod.installedVersion,
    latestVersion: mod.latestVersion,
    installedFile: mod.installedFile,
    latestFile: mod.latestFile,
  };
  if (mod.breakingReason) entry.breakingReason = mod.breakingReason;
  if (mod.llmSeverity) entry.llmSeverity = mod.llmSeverity;

  // Changelogs — omit if empty
  const changelogs = transformChangelogs(mod);
  if (changelogs) entry.changelogs = changelogs;

  // Keyword matches — omit if empty
  const keywordMatches = collectKeywordMatches(mod);
  if (keywordMatches) entry.keywordMatches = keywordMatches;

  // Config refs — omit if none
  const refs = transformConfigRefs(mod.addonID, configRefs, refSeverity);
  if (refs) entry.configRefs = refs;

  // Dependencies — omit if empty
  const deps = transformDependencies(mod, graph, lookup);
  if (deps) entry.dependencies = deps;

  return entry;
}

// ── Main export ─────────────────────────────────────────────────────────────

export function buildReport(scanResults, configRefs, refSeverity) {
  const { metadata, dependencyGraph: graph, missingDeps, errors } = scanResults;
  const lookup = buildAddonLookup(scanResults);

  const transformCategory = (cat) =>
    (scanResults[cat] || []).map(mod => transformMod(mod, lookup, graph, configRefs, refSeverity));

  const report = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),

    instance: {
      name: metadata.instanceName,
      mcVersion: metadata.mcVersion,
      loader: metadata.loaderName,
      totalMods: metadata.totalMods,
      scannedMods: metadata.scannedMods,
    },

    summary: {
      breaking: (scanResults.breaking || []).length,
      caution: (scanResults.caution || []).length,
      reviewDeps: (scanResults.reviewDeps || []).length,
      safeToUpdate: (scanResults.safeToUpdate || []).length,
      updatesAvailable: (scanResults.updates || []).length,
      upToDate: (scanResults.upToDate || []).length,
      errors: (errors || []).length,
      missingDeps: (missingDeps || []).length,
    },

    mods: {
      breaking: transformCategory('breaking'),
      caution: transformCategory('caution'),
      reviewDeps: transformCategory('reviewDeps'),
      safeToUpdate: transformCategory('safeToUpdate'),
      updatesAvailable: transformCategory('updates'),
    },
  };

  // Missing deps — resolve neededBy to names
  if (missingDeps && missingDeps.length > 0) {
    report.missingDeps = missingDeps.map(d => ({
      addonID: d.addonId,
      neededBy: d.neededBy.map(id => {
        const info = lookup.get(id);
        return { addonID: id, name: info?.name || `Unknown (${id})` };
      }),
    }));
  }

  // Errors
  if (errors && errors.length > 0) {
    report.errors = errors.map(e => ({
      addonID: e.addonID,
      name: e.name,
      error: e.error,
    }));
  }

  return report;
}

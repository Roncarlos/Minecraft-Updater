import { useCallback } from 'react';
import { useAppContext } from '../context';
import {
  downloadMod,
  downloadBulk,
  applyBulk,
  rollbackMod as apiRollbackMod,
  rollbackBulk,
  fetchDownloadState,
} from '../api/endpoints';
import {
  buildUpdateLookup,
  buildAllModsLookup,
  resolveDependencyChain,
  topologicalSort,
} from '../utils/depGraph';
import type { ScanResults, ModItem, DownloadStateMap } from '../types';

function getSectionItems(results: ScanResults, sectionKey: string): ModItem[] {
  switch (sectionKey) {
    case 'breaking': return results.breaking;
    case 'caution': return results.caution;
    case 'review-deps': return results.reviewDeps;
    case 'safe': return results.safeToUpdate;
    case 'update': return results.updates;
    default: return [];
  }
}

export function useModActions() {
  const { state, dispatch } = useAppContext();

  const refreshDownloadState = useCallback(async () => {
    const dlState = await fetchDownloadState();
    dispatch({ type: 'SET_DOWNLOAD_STATE', state: dlState });
    return dlState;
  }, [dispatch]);

  const downloadOne = useCallback(async (addonId: number, downloadUrl: string, fileName: string) => {
    const result = await downloadMod(addonId, downloadUrl, fileName);
    if (result.success) {
      dispatch({
        type: 'MERGE_DOWNLOAD_STATE',
        state: { [String(addonId)]: { status: 'downloaded', fileName } },
      });
    }
    return result;
  }, [dispatch]);

  const downloadAllInSection = useCallback(async (sectionKey: string) => {
    const results = state.scanResults;
    if (!results) return [];

    const items = getSectionItems(results, sectionKey);
    const graph = results.dependencyGraph || {};
    const updateLookup = buildUpdateLookup(results);
    const allMods = buildAllModsLookup(results);
    const targetIds = items.filter(i => i.hasUpdate).map(i => i.addonID);
    const chainIds = resolveDependencyChain(targetIds, graph, updateLookup);

    const mods: { addonId: number; downloadUrl: string; fileName: string }[] = [];
    const seen = new Set<number>();
    for (const id of chainIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const item = allMods.get(id);
      if (item?.hasUpdate && item.downloadUrl && item.latestFile) {
        mods.push({ addonId: item.addonID, downloadUrl: item.downloadUrl, fileName: item.latestFile });
      }
    }

    if (mods.length === 0) return [];

    const bulkResults = await downloadBulk(mods);

    const newState: DownloadStateMap = {};
    for (const r of bulkResults) {
      if (r.success) {
        const mod = mods.find(m => m.addonId === r.addonId);
        newState[String(r.addonId)] = { status: 'downloaded', fileName: mod?.fileName };
      }
    }
    dispatch({ type: 'MERGE_DOWNLOAD_STATE', state: newState });

    return bulkResults;
  }, [state.scanResults, dispatch]);

  const applyOne = useCallback(async (addonId: number, _oldFileName: string, _newFileName: string) => {
    const results = state.scanResults;
    if (!results) return;

    const graph = results.dependencyGraph || {};
    const updateLookup = buildUpdateLookup(results);
    const allMods = buildAllModsLookup(results);
    const chainIds = resolveDependencyChain([addonId], graph, updateLookup);
    const sortedIds = topologicalSort(chainIds, graph);

    const allModsToApply = sortedIds
      .map(id => {
        const item = allMods.get(id);
        if (!item?.hasUpdate || !item.latestFile) return null;
        return { addonId: id, oldFileName: item.installedFile, newFileName: item.latestFile, downloadUrl: item.downloadUrl };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    // Download any not-yet-downloaded deps first
    const dlState = await fetchDownloadState();
    const needsDownload = allModsToApply.filter(m => {
      const s = dlState[String(m.addonId)];
      return (!s || (s.status !== 'downloaded' && s.status !== 'applied')) && m.downloadUrl;
    });

    if (needsDownload.length > 0) {
      const dlResults = await downloadBulk(needsDownload.map(m => ({
        addonId: m.addonId,
        downloadUrl: m.downloadUrl!,
        fileName: m.newFileName,
      })));
      const failed = dlResults.filter(r => !r.success);
      if (failed.length > 0) {
        console.error('Failed to download dependencies:', failed);
      }
    }

    // Apply in topological order
    const modsToApply = allModsToApply.map(m => ({
      addonId: m.addonId,
      oldFileName: m.oldFileName,
      newFileName: m.newFileName,
    }));

    const applyResults = await applyBulk(modsToApply);

    const newState: DownloadStateMap = {};
    for (const r of applyResults) {
      if (r.success) {
        newState[String(r.addonId)] = { status: 'applied', oldFileName: r.oldFileName, newFileName: r.newFileName };
      }
    }
    dispatch({ type: 'MERGE_DOWNLOAD_STATE', state: newState });

    return applyResults;
  }, [state.scanResults, dispatch]);

  const applyAllInSection = useCallback(async (sectionKey: string): Promise<{ mods: { addonId: number; oldFileName: string; newFileName: string }[]; extraDeps: ModItem[] }> => {
    const results = state.scanResults;
    if (!results) return { mods: [], extraDeps: [] };

    const items = getSectionItems(results, sectionKey);
    const graph = results.dependencyGraph || {};
    const updateLookup = buildUpdateLookup(results);
    const allMods = buildAllModsLookup(results);
    const targetIds = items.filter(i => i.hasUpdate && i.latestFile).map(i => i.addonID);
    const chainIds = resolveDependencyChain(targetIds, graph, updateLookup);
    const sortedIds = topologicalSort(chainIds, graph);

    const dlState = await fetchDownloadState();

    const mods: { addonId: number; oldFileName: string; newFileName: string }[] = [];
    const extraDeps: ModItem[] = [];
    for (const id of sortedIds) {
      const item = allMods.get(id);
      if (!item?.hasUpdate || !item.latestFile) continue;
      const s = dlState[String(id)];
      if (!s || (s.status !== 'downloaded' && s.status !== 'applied')) continue;
      mods.push({ addonId: item.addonID, oldFileName: item.installedFile, newFileName: item.latestFile });
      if (!targetIds.includes(id)) extraDeps.push(item);
    }

    return { mods, extraDeps };
  }, [state.scanResults]);

  const confirmApplyBulk = useCallback(async (mods: { addonId: number; oldFileName: string; newFileName: string }[]) => {
    const applyResults = await applyBulk(mods);

    const newState: DownloadStateMap = {};
    for (const r of applyResults) {
      if (r.success) {
        newState[String(r.addonId)] = { status: 'applied', oldFileName: r.oldFileName, newFileName: r.newFileName };
      }
    }
    dispatch({ type: 'MERGE_DOWNLOAD_STATE', state: newState });

    return applyResults;
  }, [dispatch]);

  const rollbackOne = useCallback(async (addonId: number, oldFileName: string, newFileName: string) => {
    const result = await apiRollbackMod(addonId, oldFileName, newFileName);
    if (result.success) {
      dispatch({ type: 'REMOVE_FROM_DOWNLOAD_STATE', addonIds: [String(addonId)] });
    }
    return result;
  }, [dispatch]);

  const rollbackAllInSection = useCallback(async (sectionKey: string) => {
    const results = state.scanResults;
    if (!results) return [];

    const items = getSectionItems(results, sectionKey);
    const dlState = await fetchDownloadState();

    const mods = items
      .filter(i => {
        const s = dlState[String(i.addonID)];
        return s && s.status === 'applied' && i.hasUpdate && i.latestFile;
      })
      .map(i => ({ addonId: i.addonID, oldFileName: i.installedFile, newFileName: i.latestFile! }));

    if (mods.length === 0) return [];

    const rbResults = await rollbackBulk(mods);

    const removedIds = rbResults.filter(r => r.success).map(r => String(r.addonId));
    if (removedIds.length > 0) {
      dispatch({ type: 'REMOVE_FROM_DOWNLOAD_STATE', addonIds: removedIds });
    }

    return rbResults;
  }, [state.scanResults, dispatch]);

  return {
    downloadState: state.downloadState,
    downloadOne,
    downloadAllInSection,
    applyOne,
    applyAllInSection,
    confirmApplyBulk,
    rollbackOne,
    rollbackAllInSection,
    refreshDownloadState,
  };
}

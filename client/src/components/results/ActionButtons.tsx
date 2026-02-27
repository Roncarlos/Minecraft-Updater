import { useState } from 'react';
import { useModActions } from '../../hooks/useModActions';
import { useAppContext } from '../../context';
import { buildUpdateLookup, buildAllModsLookup, resolveDependencyChain } from '../../utils/depGraph';
import Button from '../ui/Button';
import StatusBadge from './StatusBadge';
import type { ModItem } from '../../types';

interface ActionButtonsProps {
  item: ModItem;
}

export default function ActionButtons({ item }: ActionButtonsProps) {
  const { state, openModal } = useAppContext();
  const { downloadOne, applyOne, rollbackOne, downloadState } = useModActions();
  const [busy, setBusy] = useState<string | null>(null);

  const dlState = downloadState[String(item.addonID)];
  const status = dlState?.status;

  if (!item.hasUpdate || !item.latestFile) return null;

  // Rolled back state
  if (status === undefined && busy === 'rolled-back') {
    return <StatusBadge status="rolled-back" label="Rolled back" />;
  }

  // Applied state — show badge + rollback
  if (status === 'applied') {
    const handleRollback = () => {
      openModal({
        type: 'apply',
        title: 'Confirm Rollback',
        mods: [{ addonId: item.addonID, oldFileName: item.installedFile, newFileName: item.latestFile! }],
        extraDeps: [],
        onConfirm: async () => {
          setBusy('rolling-back');
          try {
            const result = await rollbackOne(item.addonID, item.installedFile, item.latestFile!);
            if (result.success) {
              setBusy('rolled-back');
            } else {
              setBusy(null);
            }
          } catch {
            setBusy(null);
          }
        },
      });
    };

    return (
      <div className="flex gap-1.5 items-center">
        <StatusBadge status="applied" />
        <Button variant="rollback" size="sm" onClick={handleRollback} disabled={busy === 'rolling-back'}>
          {busy === 'rolling-back' ? 'Rolling back...' : 'Rollback'}
        </Button>
      </div>
    );
  }

  // Downloaded state — show badge + apply button
  if (status === 'downloaded') {
    const handleApply = () => {
      const results = state.scanResults;
      if (!results) return;

      const graph = results.dependencyGraph || {};
      const updateLookup = buildUpdateLookup(results);
      const allMods = buildAllModsLookup(results);
      const chainIds = resolveDependencyChain([item.addonID], graph, updateLookup);
      const extraDepIds = chainIds.filter(id => id !== item.addonID);

      const extraDeps: ModItem[] = extraDepIds
        .map(id => allMods.get(id))
        .filter((m): m is ModItem => !!m);

      openModal({
        type: 'apply',
        title: 'Confirm Apply',
        mods: [{ addonId: item.addonID, oldFileName: item.installedFile, newFileName: item.latestFile! }],
        extraDeps,
        onConfirm: async () => {
          setBusy('applying');
          try {
            await applyOne(item.addonID, item.installedFile, item.latestFile!);
          } catch (err) {
            console.error('Apply failed:', err);
          }
          setBusy(null);
        },
      });
    };

    return (
      <div className="flex gap-1.5 items-center">
        <StatusBadge status="downloaded" />
        <Button variant="apply" size="sm" onClick={handleApply} disabled={busy === 'applying'}>
          {busy === 'applying' ? 'Applying...' : 'Apply'}
        </Button>
      </div>
    );
  }

  // Default state — download button
  if (!item.downloadUrl) {
    return <StatusBadge status="error" label="No URL" />;
  }

  const handleDownload = async () => {
    setBusy('downloading');
    try {
      await downloadOne(item.addonID, item.downloadUrl!, item.latestFile!);
    } catch (err) {
      console.error('Download failed:', err);
    }
    setBusy(null);
  };

  return (
    <Button variant="download" size="sm" onClick={handleDownload} disabled={busy === 'downloading'}>
      {busy === 'downloading' ? 'Downloading...' : 'Download'}
    </Button>
  );
}

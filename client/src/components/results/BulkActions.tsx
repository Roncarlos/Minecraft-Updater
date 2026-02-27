import { useState } from 'react';
import { useModActions } from '../../hooks/useModActions';
import { useAppContext } from '../../context';
import Button from '../ui/Button';

interface BulkActionsProps {
  sectionKey: string;
}

export default function BulkActions({ sectionKey }: BulkActionsProps) {
  const { openModal } = useAppContext();
  const { downloadAllInSection, applyAllInSection, rollbackAllInSection, confirmApplyBulk } = useModActions();
  const [busy, setBusy] = useState<string | null>(null);

  const handleDownloadAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy('downloading');
    try {
      await downloadAllInSection(sectionKey);
    } catch (err) { console.error('Bulk download failed:', err); }
    setBusy(null);
  };

  const handleApplyAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await applyAllInSection(sectionKey);
      if (!result || result.mods.length === 0) return;

      openModal({
        type: 'apply',
        title: `Apply ${result.mods.length} Updates`,
        mods: result.mods,
        extraDeps: result.extraDeps,
        onConfirm: async () => {
          setBusy('applying');
          try {
            await confirmApplyBulk(result.mods);
          } catch (err) { console.error('Bulk apply failed:', err); }
          setBusy(null);
        },
      });
    } catch (err) { console.error('Bulk apply setup failed:', err); }
  };

  const handleRollbackAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy('rolling-back');
    try {
      await rollbackAllInSection(sectionKey);
    } catch (err) { console.error('Bulk rollback failed:', err); }
    setBusy(null);
  };

  return (
    <span className="flex gap-1.5 ml-auto" onClick={e => e.stopPropagation()}>
      <Button variant="download" size="sm" onClick={handleDownloadAll} disabled={busy !== null}>
        {busy === 'downloading' ? 'Downloading...' : 'Download All'}
      </Button>
      <Button variant="apply" size="sm" onClick={handleApplyAll} disabled={busy !== null}>
        {busy === 'applying' ? 'Applying...' : 'Apply All'}
      </Button>
      <Button variant="rollback" size="sm" onClick={handleRollbackAll} disabled={busy !== null}>
        {busy === 'rolling-back' ? 'Rolling back...' : 'Rollback All'}
      </Button>
    </span>
  );
}

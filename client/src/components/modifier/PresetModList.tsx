import { useState } from 'react';
import { removePresetMod } from '../../api/modifier-endpoints';
import { useConfirm } from '../../hooks/useConfirm';
import type { PresetMod } from '../../types';

interface PresetModListProps {
  presetId: string;
  mods: PresetMod[];
  onRefresh: () => Promise<void>;
}

export default function PresetModList({ presetId, mods, onRefresh }: PresetModListProps) {
  const [removing, setRemoving] = useState<number | null>(null);
  const confirm = useConfirm();

  const handleRemove = async (addonId: number, modName: string) => {
    if (!await confirm(`Remove "${modName}" from this preset? This cannot be undone.`, { confirmLabel: 'Remove' })) return;
    setRemoving(addonId);
    try {
      await removePresetMod(presetId, addonId);
      await onRefresh();
    } catch {
      // ignore
    } finally {
      setRemoving(null);
    }
  };

  if (mods.length === 0) {
    return <div className="text-muted text-[0.8rem] py-2">No mods added yet. Use the search above to add mods.</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      {mods.map(mod => (
        <div key={mod.addonId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg group">
          {mod.thumbnailUrl ? (
            <img src={mod.thumbnailUrl} alt="" className="w-7 h-7 rounded" />
          ) : (
            <div className="w-7 h-7 rounded bg-border flex items-center justify-center text-muted text-[0.65rem]">M</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[0.85rem] font-medium truncate">{mod.name}</div>
            <div className="text-[0.75rem] text-muted truncate">{mod.fileName}</div>
          </div>
          <button
            onClick={() => handleRemove(mod.addonId, mod.name)}
            disabled={removing === mod.addonId}
            className="opacity-0 group-hover:opacity-100 text-danger text-[0.8rem] hover:text-danger cursor-pointer transition-opacity disabled:opacity-40"
            title="Remove mod"
          >
            {removing === mod.addonId ? '...' : 'Remove'}
          </button>
        </div>
      ))}
    </div>
  );
}

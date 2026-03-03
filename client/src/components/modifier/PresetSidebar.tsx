import { useState } from 'react';
import Button from '../ui/Button';
import { useConfirm } from '../../hooks/useConfirm';
import type { PresetSummary } from '../../types';

interface PresetSidebarProps {
  presets: PresetSummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loading: boolean;
}

export default function PresetSidebar({ presets, selectedId, onSelect, onCreate, onDelete, loading }: PresetSidebarProps) {
  const [creating, setCreating] = useState(false);
  const confirm = useConfirm();

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (await confirm(`Delete preset "${name}"? This cannot be undone.`, { confirmLabel: 'Delete' })) {
      onDelete(id);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreate('New Preset');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-[260px] shrink-0 bg-surface border border-border rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[0.9rem] font-semibold uppercase tracking-wide text-muted">Presets</h3>
        <Button variant="download" size="sm" onClick={handleCreate} disabled={creating}>
          + New
        </Button>
      </div>

      {loading ? (
        <div className="text-muted text-[0.85rem] text-center py-4">Loading...</div>
      ) : presets.length === 0 ? (
        <div className="text-muted text-[0.85rem] text-center py-4">No presets yet</div>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto flex-1">
          {presets.map(p => (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`px-3 py-2 rounded-lg cursor-pointer transition-colors group flex items-center justify-between ${
                selectedId === p.id
                  ? 'bg-info-bg border border-info text-text'
                  : 'hover:bg-surface-hover text-muted hover:text-text'
              }`}
            >
              <div className="min-w-0">
                <div className="text-[0.85rem] font-medium truncate">{p.name}</div>
                <div className="text-[0.75rem] text-muted">
                  {p.modCount} mods &middot; {p.configCount} configs
                  {p.kubejsCount > 0 && <> &middot; {p.kubejsCount} kubejs</>}
                  {p.resourcepackCount > 0 && <> &middot; {p.resourcepackCount} packs</>}
                  {p.disableModCount > 0 && <> &middot; {p.disableModCount} disabled</>}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, p.id, p.name)}
                className="opacity-0 group-hover:opacity-100 text-danger hover:text-danger cursor-pointer ml-2 shrink-0"
                title="Delete preset"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

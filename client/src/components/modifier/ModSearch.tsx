import { useModSearch } from '../../hooks/useModSearch';
import { formatDownloads } from '../../utils/format';
import type { CfSearchResult, ModalState } from '../../types';

interface ModSearchProps {
  presetId: string;
  mcVersion: string;
  loader: string;
  openModal: (m: ModalState) => void;
  onModAdded: () => Promise<void>;
}

export default function ModSearch({ presetId, mcVersion, loader, openModal, onModAdded }: ModSearchProps) {
  const { query, results, searching, search, clear } = useModSearch();

  const handlePickMod = (mod: CfSearchResult) => {
    openModal({ type: 'mod-file-picker', addonId: mod.id, modName: mod.name, presetId, mcVersion, loader, onAdded: () => { onModAdded(); clear(); } });
  };

  return (
    <div className="mb-4">
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={query}
          onChange={e => search(e.target.value, mcVersion, loader)}
          placeholder="Search CurseForge mods..."
          className="flex-1 bg-bg border border-border text-text px-3 py-2 rounded text-[0.85rem] font-[inherit] focus:outline-none focus:border-info"
        />
        {query && (
          <button onClick={clear} className="text-muted hover:text-text text-[0.85rem] cursor-pointer px-2">
            Clear
          </button>
        )}
      </div>

      {searching && <div className="text-muted text-[0.8rem] py-2">Searching...</div>}

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto">
          {results.map(mod => (
            <div
              key={mod.id}
              onClick={() => handlePickMod(mod)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors"
            >
              {mod.logo ? (
                <img src={mod.logo.thumbnailUrl} alt="" className="w-8 h-8 rounded" />
              ) : (
                <div className="w-8 h-8 rounded bg-border flex items-center justify-center text-muted text-[0.7rem]">?</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[0.85rem] font-medium truncate">{mod.name}</div>
                <div className="text-[0.75rem] text-muted truncate">
                  {mod.authors.map(a => a.name).join(', ')} &middot; {formatDownloads(mod.downloadCount)} downloads
                </div>
              </div>
              <span className="text-info text-[0.8rem] shrink-0">+ Add</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

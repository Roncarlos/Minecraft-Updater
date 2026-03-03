import { useState } from 'react';
import Button from '../ui/Button';
import ModSearch from './ModSearch';
import PresetModList from './PresetModList';
import ConfigManager from './ConfigManager';
import ConfigTree from './ConfigTree';
import KubejsManager from './KubejsManager';
import KubejsTree from './KubejsTree';
import ResourcepackManager from './ResourcepackManager';
import DisableModsEditor from './DisableModsEditor';
import ApplyPanel from './ApplyPanel';
import type { Preset, Instance, ModalState } from '../../types';

interface PresetEditorProps {
  preset: Preset;
  instances: Instance[];
  onUpdate: (updates: Partial<Pick<Preset, 'name' | 'description' | 'mcVersion' | 'loader' | 'disableMods'>>) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRefreshFiles: () => Promise<void>;
  openModal: (m: ModalState) => void;
}

export default function PresetEditor({ preset, instances, onUpdate, onRefresh, onRefreshFiles, openModal }: PresetEditorProps) {
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [name, setName] = useState(preset.name);
  const [description, setDescription] = useState(preset.description);
  const [mcVersion, setMcVersion] = useState(preset.mcVersion);
  const [loader, setLoader] = useState(preset.loader);

  const handleSave = async () => {
    await onUpdate({ name, description, mcVersion, loader });
    setEditing(false);
  };

  const handleRefreshFiles = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await onRefreshFiles();
    } catch {
      setRefreshError('Failed to refresh files from disk');
    } finally {
      setRefreshing(false);
    }
  };

  const fieldClass = "flex-1 bg-bg border border-border text-text px-2.5 py-1.5 rounded text-[0.85rem] font-[inherit] focus:outline-none focus:border-info";
  const detailsComplete = Boolean(preset.mcVersion && preset.loader);

  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-6">
      {/* Metadata Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-info text-[0.9rem] uppercase tracking-wide">Preset Details</h3>
          {!editing ? (
            <Button variant="settings" size="sm" onClick={() => setEditing(true)}>Edit</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="cancel" size="sm" onClick={() => { setEditing(false); setName(preset.name); setDescription(preset.description); setMcVersion(preset.mcVersion); setLoader(preset.loader); }}>Cancel</Button>
              <Button variant="confirm" size="sm" onClick={handleSave}>Save</Button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={fieldClass} />
            </div>
            <div className="flex items-center gap-3">
              <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Description</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={fieldClass} placeholder="Optional description" />
            </div>
            <div className="flex items-center gap-3">
              <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">MC Version</label>
              <input type="text" value={mcVersion} onChange={e => setMcVersion(e.target.value)} className={fieldClass} placeholder="e.g. 1.20.1" />
            </div>
            <div className="flex items-center gap-3">
              <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Loader</label>
              <select value={loader} onChange={e => setLoader(e.target.value)} className={fieldClass}>
                <option value="">Select loader</option>
                <option value="Forge">Forge</option>
                <option value="Fabric">Fabric</option>
                <option value="NeoForge">NeoForge</option>
                <option value="Quilt">Quilt</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.85rem]">
            <div><span className="text-muted">Name:</span> {preset.name}</div>
            <div><span className="text-muted">MC Version:</span> {preset.mcVersion || '—'}</div>
            <div><span className="text-muted">Description:</span> {preset.description || '—'}</div>
            <div><span className="text-muted">Loader:</span> {preset.loader || '—'}</div>
          </div>
        )}

        {!detailsComplete && !editing && (
          <div className="mt-3 text-warning text-[0.82rem] bg-warning/10 border border-warning/30 rounded px-3 py-2">
            Set the MC Version and Loader before adding mods or configs.
          </div>
        )}
      </div>

      {/* Mods / Configs / Apply — gated on complete details */}
      <div className="relative">
        {!detailsComplete && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/60 backdrop-blur-[2px] rounded-lg" />
        )}
        <div className={`flex flex-col gap-6${!detailsComplete ? ' pointer-events-none select-none' : ''}`}>
          {/* Mods Section */}
          <div>
            <div className="flex items-center justify-between mb-3 pb-1.5 border-b border-border">
              <h3 className="text-info text-[0.9rem] uppercase tracking-wide">
                Mods ({preset.mods.length})
              </h3>
              <div className="flex items-center gap-2">
                {refreshError && <span className="text-danger text-[0.8rem]">{refreshError}</span>}
                <Button variant="settings" size="sm" onClick={handleRefreshFiles} disabled={refreshing}>
                  {refreshing ? 'Refreshing...' : 'Refresh Files'}
                </Button>
              </div>
            </div>
            <ModSearch presetId={preset.id} mcVersion={preset.mcVersion} loader={preset.loader} openModal={openModal} onModAdded={onRefresh} />
            <PresetModList presetId={preset.id} mods={preset.mods} onRefresh={onRefresh} />
          </div>

          {/* Configs Section */}
          <div>
            <h3 className="text-info text-[0.9rem] uppercase tracking-wide mb-3 pb-1.5 border-b border-border">
              Configs ({preset.configs.length})
            </h3>
            <ConfigManager presetId={preset.id} onRefresh={onRefresh} />
            <ConfigTree presetId={preset.id} configs={preset.configs} onRefresh={onRefresh} openModal={openModal} />
          </div>

          {/* KubeJS Section */}
          <div>
            <h3 className="text-info text-[0.9rem] uppercase tracking-wide mb-3 pb-1.5 border-b border-border">
              KubeJS ({preset.kubejs.length})
            </h3>
            <KubejsManager presetId={preset.id} onRefresh={onRefresh} />
            <KubejsTree presetId={preset.id} kubejs={preset.kubejs} onRefresh={onRefresh} openModal={openModal} />
          </div>

          {/* Resource Packs Section */}
          <div>
            <h3 className="text-info text-[0.9rem] uppercase tracking-wide mb-3 pb-1.5 border-b border-border">
              Resource Packs ({preset.resourcepacks.length})
            </h3>
            <ResourcepackManager presetId={preset.id} resourcepacks={preset.resourcepacks} onRefresh={onRefresh} />
          </div>

          {/* Disable Mods Section */}
          <div>
            <h3 className="text-info text-[0.9rem] uppercase tracking-wide mb-3 pb-1.5 border-b border-border">
              Disable Mods ({(preset.disableMods ?? []).length} pattern{(preset.disableMods ?? []).length !== 1 ? 's' : ''})
            </h3>
            <DisableModsEditor presetId={preset.id} patterns={preset.disableMods ?? []} onUpdate={onUpdate} />
          </div>

          {/* Apply Section */}
          <div>
            <h3 className="text-info text-[0.9rem] uppercase tracking-wide mb-3 pb-1.5 border-b border-border">
              Apply to Instance
            </h3>
            <ApplyPanel presetId={preset.id} presetName={preset.name} mcVersion={preset.mcVersion} loader={preset.loader} instances={instances} openModal={openModal} />
          </div>
        </div>
      </div>
    </div>
  );
}

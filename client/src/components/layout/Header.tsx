import { useInstances } from '../../hooks/useInstances';
import { useAppContext } from '../../context';
import Select from '../ui/Select';

const STAT_CONFIG = [
  { key: 'breaking', label: 'Breaking Changes', cardClass: 'bg-danger-bg border-danger', numClass: 'text-danger' },
  { key: 'caution', label: 'Caution', cardClass: 'bg-orange-bg border-orange', numClass: 'text-orange' },
  { key: 'reviewDeps', label: 'Review Deps', cardClass: 'bg-purple-bg border-purple', numClass: 'text-purple' },
  { key: 'safeToUpdate', label: 'Safe to Update', cardClass: 'bg-cyan-bg border-cyan', numClass: 'text-cyan' },
  { key: 'updates', label: 'Updates Available', cardClass: 'bg-warning-bg border-warning', numClass: 'text-warning' },
  { key: 'upToDate', label: 'Up to Date', cardClass: 'bg-success-bg border-success', numClass: 'text-success' },
] as const;

export default function Header() {
  const { instances, selectedInstance, instanceMeta, switchInstance, browseFolder } = useInstances();
  const { state } = useAppContext();
  const results = state.scanResults;

  const isCustomFolder = selectedInstance != null && !instances.some(i => i.name === selectedInstance);
  const options = [
    ...instances.map(i => ({ value: i.name, label: i.name })),
    ...(isCustomFolder ? [{ value: selectedInstance, label: `${selectedInstance} (folder)` }] : []),
  ];

  return (
    <div className="text-center mb-8 p-8 bg-surface border border-border rounded-xl">
      <h1 className="text-3xl font-bold mb-2 bg-gradient-to-br from-info to-success bg-clip-text text-transparent">
        Mod Update Manager
      </h1>

      <div className="flex items-center justify-center gap-2.5 mb-3">
        <span className="text-muted text-[0.85rem] font-semibold uppercase tracking-wide">Profile:</span>
        <Select
          value={selectedInstance || ''}
          onChange={switchInstance}
          options={options}
          disabled={state.scanRunning}
        />
        <button
          onClick={browseFolder}
          disabled={state.scanRunning}
          className="px-3 py-1.5 text-[0.85rem] bg-surface-hover border border-border rounded-md text-muted hover:text-text hover:border-info cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Select a folder (e.g. server pack)"
        >
          Browse Folder...
        </button>
      </div>

      <div className="text-muted text-[0.9rem]">
        {instanceMeta ? (
          <>
            <strong>{instanceMeta.instanceName}</strong>
            <br />
            Minecraft {instanceMeta.mcVersion} &middot; {instanceMeta.loaderName} &middot; {instanceMeta.modCount} mods
          </>
        ) : (
          'Loading instance data...'
        )}
      </div>

      {results && (
        <div className="flex justify-center gap-8 mt-6 flex-wrap">
          {STAT_CONFIG.map(({ key, label, cardClass, numClass }) => {
            const count = (results[key] || []).length;
            return (
              <div key={key} className={`text-center px-6 py-3 rounded-lg min-w-[140px] border ${cardClass}`}>
                <div className={`text-3xl font-bold ${numClass}`}>{count}</div>
                <div className="text-[0.8rem] uppercase tracking-wide">{label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

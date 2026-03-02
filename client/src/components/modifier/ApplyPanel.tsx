import { useState, useMemo, useEffect } from 'react';
import { useApplyPreset } from '../../hooks/useApplyPreset';
import { useConfirm } from '../../hooks/useConfirm';
import Button from '../ui/Button';
import type { Instance, ModalState } from '../../types';

interface ApplyPanelProps {
  presetId: string;
  presetName: string;
  mcVersion: string;
  loader: string;
  instances: Instance[];
  openModal: (m: ModalState) => void;
}

export default function ApplyPanel({ presetId, presetName, mcVersion, loader, instances, openModal }: ApplyPanelProps) {
  const [instanceName, setInstanceName] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [backup, setBackup] = useState(true);
  const confirm = useConfirm();
  const {
    downloading, applying, downloadResults, error,
    download, apply,
    rollingBack, rollbackResult, rollback, clearRollbackResult,
    hasBackup, checkBackup,
  } = useApplyPreset();

  const lowerLoader = loader.toLowerCase();
  const matching = useMemo(() =>
    instances.filter(i =>
      i.mcVersion === mcVersion && i.loaderName.toLowerCase() === lowerLoader
    ), [instances, mcVersion, lowerLoader]);

  const mismatched = useMemo(() =>
    instances.filter(i =>
      i.mcVersion !== mcVersion || i.loaderName.toLowerCase() !== lowerLoader
    ), [instances, mcVersion, lowerLoader]);

  useEffect(() => {
    if (instanceName) {
      checkBackup(presetId, instanceName);
      clearRollbackResult();
    }
  }, [instanceName, presetId, checkBackup, clearRollbackResult]);

  const handleDownload = () => download(presetId);

  const handleApply = () => {
    if (!instanceName) return;
    apply(presetId, instanceName, backup, openModal);
  };

  const handleRollback = async () => {
    if (!instanceName) return;
    const confirmed = await confirm(
      `Rollback "${presetName}" on "${instanceName}"? This will restore backed-up files and remove files that were added by the preset.`,
      { confirmLabel: 'Rollback' },
    );
    if (!confirmed) return;
    await rollback(presetId, instanceName);
  };

  const downloadFailed = downloadResults?.some(r => !r.success);
  const downloadOk = downloadResults && !downloadFailed;

  const rollbackTotal = rollbackResult
    ? rollbackResult.mods + rollbackResult.configs + rollbackResult.kubejs + rollbackResult.resourcepacks
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <label className="text-muted text-[0.85rem] shrink-0">Instance:</label>
        <select
          value={instanceName}
          onChange={e => setInstanceName(e.target.value)}
          className="flex-1 bg-bg border border-border text-text px-2.5 py-1.5 rounded text-[0.85rem] font-[inherit] focus:outline-none focus:border-info"
        >
          <option value="">Select instance</option>
          {matching.length > 0 && (
            <optgroup label={`${mcVersion} / ${loader}`}>
              {matching.map(i => (
                <option key={i.name} value={i.name}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          )}
          {showAll && mismatched.length > 0 && (
            <optgroup label="Other instances">
              {mismatched.map(i => (
                <option key={i.name} value={i.name}>
                  {i.name} ({i.mcVersion} / {i.loaderName})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {mismatched.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-muted hover:text-text text-[0.8rem] cursor-pointer shrink-0"
          >
            {showAll ? 'Hide others' : 'Show all'}
          </button>
        )}
      </div>

      {matching.length === 0 && (
        <div className="text-muted text-[0.8rem]">
          No instances match {mcVersion} / {loader}.
          {mismatched.length > 0 && !showAll && <> Click &ldquo;Show all&rdquo; to see other instances.</>}
        </div>
      )}

      <label className="flex items-center gap-2 text-[0.85rem] text-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={backup}
          onChange={e => setBackup(e.target.checked)}
          className="accent-info"
        />
        Backup existing files before overwriting
      </label>

      <div className="flex items-center gap-3">
        <Button
          variant="download"
          size="sm"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? 'Downloading Mods...' : 'Download Mods'}
        </Button>

        <Button
          variant="apply"
          size="sm"
          onClick={handleApply}
          disabled={applying || !instanceName}
        >
          {applying ? 'Applying...' : 'Apply Preset'}
        </Button>

        {hasBackup && (
          <Button
            variant="danger"
            size="sm"
            onClick={handleRollback}
            disabled={rollingBack || !instanceName}
          >
            {rollingBack ? 'Rolling Back...' : 'Rollback'}
          </Button>
        )}

        {downloadOk && (
          <span className="text-success text-[0.8rem]">
            All {downloadResults.length} mods downloaded
          </span>
        )}
        {downloadFailed && downloadResults && (
          <span className="text-danger text-[0.8rem]">
            {downloadResults.filter(r => !r.success).length} mod(s) failed to download
          </span>
        )}
      </div>

      {rollbackResult && rollbackResult.errors.length === 0 && (
        <div className="text-success text-[0.85rem]">
          Rolled back {rollbackTotal} file(s) successfully.
          {rollbackResult.removed > 0 && ` Removed ${rollbackResult.removed} added file(s).`}
        </div>
      )}
      {rollbackResult && rollbackResult.errors.length > 0 && (
        <div className="text-danger text-[0.85rem]">
          <p>Rollback completed with {rollbackResult.errors.length} error(s). {rollbackTotal} file(s) restored.</p>
          <ul className="list-disc pl-4 mt-1">
            {rollbackResult.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="text-danger text-[0.85rem]">{error}</div>}
    </div>
  );
}

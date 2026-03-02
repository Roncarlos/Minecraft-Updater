import { useState, useMemo } from 'react';
import { useApplyPreset } from '../../hooks/useApplyPreset';
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

export default function ApplyPanel({ presetId, mcVersion, loader, instances, openModal }: ApplyPanelProps) {
  const [instanceName, setInstanceName] = useState('');
  const [showAll, setShowAll] = useState(false);
  const { downloading, applying, downloadResults, error, download, apply } = useApplyPreset();

  const lowerLoader = loader.toLowerCase();
  const matching = useMemo(() =>
    instances.filter(i =>
      i.mcVersion === mcVersion && i.loaderName.toLowerCase() === lowerLoader
    ), [instances, mcVersion, lowerLoader]);

  const mismatched = useMemo(() =>
    instances.filter(i =>
      i.mcVersion !== mcVersion || i.loaderName.toLowerCase() !== lowerLoader
    ), [instances, mcVersion, lowerLoader]);

  const handleDownload = () => download(presetId);

  const handleApply = () => {
    if (!instanceName) return;
    apply(presetId, instanceName, openModal);
  };

  const downloadFailed = downloadResults?.some(r => !r.success);
  const downloadOk = downloadResults && !downloadFailed;

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

      {error && <div className="text-danger text-[0.85rem]">{error}</div>}
    </div>
  );
}

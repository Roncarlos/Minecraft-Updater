import { useState, useEffect } from 'react';
import { useAppContext } from '../../context';
import { fetchModFiles, addPresetMod } from '../../api/modifier-endpoints';
import { formatBytes } from '../../utils/format';
import ModalShell from '../modals/ModalShell';
import Button from '../ui/Button';
import type { CfModFile } from '../../types';

interface ModFilePickerModalProps {
  addonId: number;
  modName: string;
  presetId: string;
  mcVersion: string;
  loader: string;
  onAdded: () => void;
}

export default function ModFilePickerModal({ addonId, modName, presetId, mcVersion, loader, onAdded }: ModFilePickerModalProps) {
  const { closeModal } = useAppContext();
  const [files, setFiles] = useState<CfModFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchModFiles(addonId, mcVersion, loader);
        setFiles(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load files');
      } finally {
        setLoading(false);
      }
    })();
  }, [addonId]);

  const handleSelect = async (file: CfModFile) => {
    setAdding(file.id);
    try {
      await addPresetMod(presetId, {
        addonId,
        name: modName,
        fileId: file.id,
        fileName: file.fileName,
        downloadUrl: file.downloadUrl,
      });
      onAdded();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add mod');
    } finally {
      setAdding(null);
    }
  };

  return (
    <ModalShell onClose={closeModal} maxWidth="650px">
      <h3 className="mb-1 text-text text-lg">Select Version</h3>
      <p className="text-muted text-[0.85rem] mb-4">{modName}</p>

      {loading && <div className="text-muted text-[0.85rem] py-4 text-center">Loading files...</div>}
      {error && <div className="text-danger text-[0.85rem] py-2">{error}</div>}

      {!loading && files.length === 0 && !error && (
        <div className="text-muted text-[0.85rem] py-4 text-center">No files found for this mod.</div>
      )}

      <div className="overflow-y-auto flex-1 flex flex-col gap-1">
        {files.map(file => (
          <div key={file.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover">
            <div className="flex-1 min-w-0">
              <div className="text-[0.85rem] font-medium truncate">{file.displayName}</div>
              <div className="text-[0.75rem] text-muted">
                {file.fileName} &middot; {formatBytes(file.fileLength)} &middot; {new Date(file.fileDate).toLocaleDateString()}
              </div>
              <div className="text-[0.7rem] text-muted truncate">
                {file.gameVersions.join(', ')}
              </div>
            </div>
            <Button
              variant="download"
              size="sm"
              onClick={() => handleSelect(file)}
              disabled={adding === file.id}
            >
              {adding === file.id ? 'Adding...' : 'Select'}
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-border">
        <Button variant="cancel" size="sm" onClick={closeModal}>Cancel</Button>
      </div>
    </ModalShell>
  );
}

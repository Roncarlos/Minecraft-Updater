import { useState, useRef } from 'react';
import Button from '../ui/Button';
import { useResourcepacks } from '../../hooks/useResourcepacks';
import { openResourcepackFile } from '../../api/modifier-endpoints';
import { formatBytes } from '../../utils/format';
import type { PresetConfigEntry } from '../../types';

interface ResourcepackManagerProps {
  presetId: string;
  resourcepacks: PresetConfigEntry[];
  onRefresh: () => Promise<void>;
}

export default function ResourcepackManager({ presetId, resourcepacks, onRefresh }: ResourcepackManagerProps) {
  const rp = useResourcepacks(presetId);
  const [mode, setMode] = useState<'import' | 'upload'>('import');
  const [folderPath, setFolderPath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'open' | 'delete' | null>(null);

  const handleImport = async () => {
    if (!folderPath.trim()) return;
    await rp.importFromFolder(folderPath.trim(), onRefresh);
    setFolderPath('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL returns "data:<mime>;base64,<data>"
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      setFileContent(base64);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!fileName || !fileContent) return;
    await rp.upload(fileName, fileContent, onRefresh);
    setFileName('');
    setFileContent('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [actionError, setActionError] = useState<string | null>(null);

  const handleOpen = async (targetPath: string) => {
    setBusyPath(targetPath);
    setBusyAction('open');
    setActionError(null);
    try {
      await openResourcepackFile(presetId, targetPath);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to open file');
    } finally {
      setBusyPath(null);
      setBusyAction(null);
    }
  };

  const handleDelete = async (targetPath: string) => {
    setBusyPath(targetPath);
    setBusyAction('delete');
    setActionError(null);
    try {
      await rp.deleteFile(targetPath, onRefresh);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setBusyPath(null);
      setBusyAction(null);
    }
  };

  const fieldClass = "flex-1 bg-bg border border-border text-text px-2.5 py-1.5 rounded text-[0.85rem] font-[inherit] focus:outline-none focus:border-info";

  return (
    <div>
      {/* Import / Upload panel */}
      <div className="mb-3">
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setMode('import')}
            className={`text-[0.8rem] px-3 py-1 rounded cursor-pointer transition-colors ${mode === 'import' ? 'bg-info-bg text-info' : 'text-muted hover:text-text'}`}
          >
            Import Folder
          </button>
          <button
            onClick={() => setMode('upload')}
            className={`text-[0.8rem] px-3 py-1 rounded cursor-pointer transition-colors ${mode === 'upload' ? 'bg-info-bg text-info' : 'text-muted hover:text-text'}`}
          >
            Upload .zip
          </button>
        </div>

        {mode === 'import' && (
          <div className="flex gap-2">
            <input
              type="text"
              value={folderPath}
              onChange={e => setFolderPath(e.target.value)}
              placeholder="Absolute folder path (e.g. C:\...\resourcepacks)"
              className={fieldClass}
            />
            <Button variant="download" size="sm" onClick={handleImport} disabled={rp.importing || !folderPath.trim()}>
              {rp.importing ? 'Importing...' : 'Import'}
            </Button>
          </div>
        )}

        {mode === 'upload' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                className="text-[0.8rem] text-muted file:mr-2 file:py-1 file:px-3 file:rounded file:border file:border-border file:bg-surface file:text-text file:text-[0.8rem] file:cursor-pointer"
              />
              {fileContent && (
                <Button variant="download" size="sm" onClick={handleUpload} disabled={rp.uploading}>
                  {rp.uploading ? 'Uploading...' : `Upload ${fileName}`}
                </Button>
              )}
            </div>
          </div>
        )}

        {rp.error && (
          <div className="text-danger text-[0.8rem] mt-1">{rp.error}</div>
        )}
      </div>

      {actionError && (
        <div className="text-danger text-[0.8rem] mt-1">{actionError}</div>
      )}

      {/* File list */}
      {resourcepacks.length === 0 ? (
        <div className="text-muted text-[0.8rem] py-2">No resource packs. Use import or upload above.</div>
      ) : (
        <div className="bg-bg rounded-lg p-3">
          {resourcepacks.map(pack => {
            const isBusy = busyPath === pack.targetPath;
            return (
              <div
                key={pack.targetPath}
                className={`flex items-center gap-2 py-1 group text-[0.83rem] ${isBusy ? 'opacity-50' : ''}`}
              >
                <span className="text-text">{pack.targetPath}</span>
                <span className="text-[0.75rem] text-muted">{formatBytes(pack.sizeBytes)}</span>
                <div className={`ml-auto flex gap-2 transition-opacity ${isBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  {isBusy ? (
                    <span className="text-muted text-[0.75rem]">{busyAction === 'delete' ? 'Deleting...' : 'Opening...'}</span>
                  ) : (
                    <>
                      <button onClick={() => handleOpen(pack.targetPath)} disabled={!!busyPath} className="text-success text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Open</button>
                      <button onClick={() => handleDelete(pack.targetPath)} disabled={!!busyPath} className="text-danger text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Delete</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

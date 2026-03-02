import { useState } from 'react';
import Button from '../ui/Button';
import { useBrowse } from '../../hooks/useBrowse';

interface ConfigImportPanelProps {
  onImportFolder: (folderPath: string) => Promise<void>;
  onImportFile: (filePath: string) => Promise<void>;
  importing: boolean;
}

export default function ConfigImportPanel({ onImportFolder, onImportFile, importing }: ConfigImportPanelProps) {
  const [mode, setMode] = useState<'folder' | 'file'>('folder');
  const [folderPath, setFolderPath] = useState('');
  const [filePath, setFilePath] = useState('');
  const { browsing, error: browseError, browse } = useBrowse();

  const handleImportFolder = async () => {
    if (!folderPath.trim()) return;
    await onImportFolder(folderPath.trim());
    setFolderPath('');
  };

  const handleImportFile = async () => {
    if (!filePath.trim()) return;
    await onImportFile(filePath.trim());
    setFilePath('');
  };

  const handleBrowse = async (type: 'file' | 'folder') => {
    const currentDir = type === 'folder' ? folderPath.trim() : filePath.trim();
    const path = await browse(type, currentDir || undefined);
    if (path) {
      if (type === 'folder') setFolderPath(path);
      else setFilePath(path);
    }
  };

  const fieldClass = "flex-1 bg-bg border border-border text-text px-2.5 py-1.5 rounded text-[0.85rem] font-[inherit] focus:outline-none focus:border-info";
  const tabClass = (active: boolean) =>
    `text-[0.8rem] px-3 py-1 rounded cursor-pointer transition-colors ${active ? 'bg-info-bg text-info' : 'text-muted hover:text-text'}`;

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <button onClick={() => setMode('folder')} className={tabClass(mode === 'folder')}>Import Folder</button>
        <button onClick={() => setMode('file')} className={tabClass(mode === 'file')}>Import File</button>
      </div>

      {mode === 'folder' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={folderPath}
            onChange={e => setFolderPath(e.target.value)}
            placeholder="Absolute folder path (e.g. C:\...\config)"
            className={fieldClass}
          />
          <Button variant="settings" size="sm" onClick={() => handleBrowse('folder')} disabled={importing || browsing}>
            {browsing ? 'Browsing...' : 'Browse'}
          </Button>
          <Button variant="download" size="sm" onClick={handleImportFolder} disabled={importing || browsing || !folderPath.trim()}>
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </div>
      )}

      {mode === 'file' && (
        <div>
          <div className="flex gap-2">
            <input
              type="text"
              value={filePath}
              onChange={e => setFilePath(e.target.value)}
              placeholder="Absolute file path (e.g. C:\...\instance\config\mymod.toml)"
              className={fieldClass}
            />
            <Button variant="settings" size="sm" onClick={() => handleBrowse('file')} disabled={importing || browsing}>
              {browsing ? 'Browsing...' : 'Browse'}
            </Button>
            <Button variant="download" size="sm" onClick={handleImportFile} disabled={importing || browsing || !filePath.trim()}>
              {importing ? 'Importing...' : 'Import'}
            </Button>
          </div>
          <div className="text-[0.75rem] text-muted mt-1">
            Paste the full path — target path is auto-detected from config/ in the path
          </div>
        </div>
      )}

      {browseError && (
        <div className="text-danger text-[0.8rem] mt-1">{browseError}</div>
      )}
    </div>
  );
}

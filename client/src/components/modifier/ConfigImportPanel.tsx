import { useState, useRef } from 'react';
import Button from '../ui/Button';

interface ConfigImportPanelProps {
  onImport: (folderPath: string) => Promise<void>;
  onUpload: (targetPath: string, content: string) => Promise<void>;
  importing: boolean;
  uploading: boolean;
}

export default function ConfigImportPanel({ onImport, onUpload, importing, uploading }: ConfigImportPanelProps) {
  const [mode, setMode] = useState<'import' | 'upload'>('import');
  const [folderPath, setFolderPath] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!folderPath.trim()) return;
    await onImport(folderPath.trim());
    setFolderPath('');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFileContent(text);
    if (!targetPath) setTargetPath(file.name);
  };

  const handleUpload = async () => {
    if (!targetPath.trim() || !fileContent) return;
    await onUpload(targetPath.trim(), fileContent);
    setTargetPath('');
    setFileContent('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fieldClass = "flex-1 bg-bg border border-border text-text px-2.5 py-1.5 rounded text-[0.85rem] font-[inherit] focus:outline-none focus:border-info";

  return (
    <div>
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
          Upload File
        </button>
      </div>

      {mode === 'import' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={folderPath}
            onChange={e => setFolderPath(e.target.value)}
            placeholder="Absolute folder path (e.g. C:\...\config)"
            className={fieldClass}
          />
          <Button variant="download" size="sm" onClick={handleImport} disabled={importing || !folderPath.trim()}>
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </div>
      )}

      {mode === 'upload' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={targetPath}
              onChange={e => setTargetPath(e.target.value)}
              placeholder="Target path (e.g. config/mymod.toml)"
              className={fieldClass}
            />
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="text-[0.8rem] text-muted file:mr-2 file:py-1 file:px-3 file:rounded file:border file:border-border file:bg-surface file:text-text file:text-[0.8rem] file:cursor-pointer"
            />
          </div>
          {fileContent && (
            <div className="flex items-center gap-2">
              <span className="text-[0.8rem] text-muted">{fileContent.length} chars loaded</span>
              <Button variant="download" size="sm" onClick={handleUpload} disabled={uploading || !targetPath.trim()}>
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

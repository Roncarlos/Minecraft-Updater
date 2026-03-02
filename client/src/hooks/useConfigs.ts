import { useState, useCallback } from 'react';
import * as api from '../api/modifier-endpoints';

export function useConfigs(presetId: string) {
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFromFolder = useCallback(async (folderPath: string, onDone: () => Promise<void>) => {
    setImporting(true);
    setError(null);
    try {
      await api.importConfigs(presetId, folderPath);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [presetId]);

  const upload = useCallback(async (targetPath: string, content: string, onDone: () => Promise<void>) => {
    setUploading(true);
    setError(null);
    try {
      await api.uploadConfig(presetId, targetPath, content);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [presetId]);

  const deleteFile = useCallback(async (targetPath: string, onDone: () => Promise<void>) => {
    setError(null);
    try {
      await api.deleteConfigFile(presetId, targetPath);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [presetId]);

  const readFile = useCallback(async (targetPath: string) => {
    const data = await api.fetchConfigContent(presetId, targetPath);
    return data.content;
  }, [presetId]);

  const saveFile = useCallback(async (targetPath: string, content: string, onDone: () => Promise<void>) => {
    setError(null);
    try {
      await api.saveConfigContent(presetId, targetPath, content);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [presetId]);

  return { importing, uploading, error, importFromFolder, upload, deleteFile, readFile, saveFile };
}

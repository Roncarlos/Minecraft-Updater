import { useState, useCallback } from 'react';
import * as api from '../api/modifier-endpoints';

export function useKubejs(presetId: string) {
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFromFolder = useCallback(async (folderPath: string, onDone: () => Promise<void>) => {
    setImporting(true);
    setError(null);
    try {
      await api.importKubejs(presetId, folderPath);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [presetId]);

  const importFile = useCallback(async (filePath: string, onDone: () => Promise<void>) => {
    setImporting(true);
    setError(null);
    try {
      await api.importSingleKubejs(presetId, filePath);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [presetId]);

  const upload = useCallback(async (targetPath: string, content: string, binary: boolean, onDone: () => Promise<void>) => {
    setUploading(true);
    setError(null);
    try {
      await api.uploadKubejs(presetId, targetPath, content, binary);
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
      await api.deleteKubejsFile(presetId, targetPath);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [presetId]);

  const readFile = useCallback(async (targetPath: string) => {
    const data = await api.fetchKubejsContent(presetId, targetPath);
    return data.content;
  }, [presetId]);

  return { importing, uploading, error, importFromFolder, importFile, upload, deleteFile, readFile };
}

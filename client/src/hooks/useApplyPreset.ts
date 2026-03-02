import { useState, useCallback } from 'react';
import { downloadPresetMods, applyPreset } from '../api/modifier-endpoints';
import type { ApplyModResult, ModalState } from '../types';

export function useApplyPreset() {
  const [downloading, setDownloading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [downloadResults, setDownloadResults] = useState<ApplyModResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async (presetId: string) => {
    setDownloading(true);
    setError(null);
    try {
      const results = await downloadPresetMods(presetId);
      setDownloadResults(results);
      return results;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      return null;
    } finally {
      setDownloading(false);
    }
  }, []);

  const apply = useCallback(async (presetId: string, instanceName: string, openModal: (m: ModalState) => void) => {
    setApplying(true);
    setError(null);
    try {
      const result = await applyPreset(presetId, instanceName);
      openModal({ type: 'apply-results', result });
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
      return null;
    } finally {
      setApplying(false);
    }
  }, []);

  return { downloading, applying, downloadResults, error, download, apply };
}

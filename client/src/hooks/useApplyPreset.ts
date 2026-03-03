import { useState, useCallback, useRef } from 'react';
import { downloadPresetMods, applyPreset, previewPreset as previewPresetApi, rollbackPreset as rollbackPresetApi, hasPresetBackup } from '../api/modifier-endpoints';
import type { ApplyModResult, ModalState, RollbackResult } from '../types';

export function useApplyPreset() {
  const [downloading, setDownloading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [downloadResults, setDownloadResults] = useState<ApplyModResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackResult, setRollbackResult] = useState<RollbackResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const checkBackupSeq = useRef(0);

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

  const apply = useCallback(async (presetId: string, instanceName: string, backup: boolean, openModal: (m: ModalState) => void) => {
    setApplying(true);
    setError(null);
    try {
      const result = await applyPreset(presetId, instanceName, backup);
      openModal({ type: 'apply-results', result });
      if (backup) setHasBackup(true);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
      return null;
    } finally {
      setApplying(false);
    }
  }, []);

  const preview = useCallback(async (presetId: string, instanceName: string, backup: boolean, openModal: (m: ModalState) => void) => {
    setPreviewing(true);
    setError(null);
    try {
      const result = await previewPresetApi(presetId, instanceName);
      openModal({
        type: 'preset-preview',
        preview: result,
        onConfirmApply: () => apply(presetId, instanceName, backup, openModal),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }, [apply]);

  const rollback = useCallback(async (presetId: string, instanceName: string) => {
    setRollingBack(true);
    setError(null);
    setRollbackResult(null);
    try {
      const result = await rollbackPresetApi(presetId, instanceName);
      setRollbackResult(result);
      // Backup is cleaned up on successful rollback (no errors)
      if (result.errors.length === 0) setHasBackup(false);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
      return null;
    } finally {
      setRollingBack(false);
    }
  }, []);

  const checkBackup = useCallback(async (presetId: string, instanceName: string) => {
    const seq = ++checkBackupSeq.current;
    try {
      const result = await hasPresetBackup(presetId, instanceName);
      if (seq === checkBackupSeq.current) {
        setHasBackup(result.hasBackup);
      }
    } catch {
      if (seq === checkBackupSeq.current) {
        setHasBackup(false);
      }
    }
  }, []);

  const clearRollbackResult = useCallback(() => setRollbackResult(null), []);

  return {
    downloading, applying, previewing, downloadResults, error,
    download, apply, preview,
    rollingBack, rollbackResult, rollback, clearRollbackResult,
    hasBackup, checkBackup,
  };
}

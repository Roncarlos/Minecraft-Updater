import { useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../context';
import { cancelScan as cancelScanApi } from '../api/endpoints';
import type { ScanProgress, ScanResults } from '../types';

interface ScanOptions {
  noCache: boolean;
  checkChangelogs: boolean;
  useLlm: boolean;
  limit: number;
}

export function useScanStream() {
  const { state, dispatch } = useAppContext();
  const esRef = useRef<EventSource | null>(null);
  const scanRunningRef = useRef(false);
  const lastProgressRef = useRef<{ current: number; total: number }>({ current: 0, total: 0 });

  // Keep ref in sync with state
  scanRunningRef.current = state.scanRunning;

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const startScan = useCallback((options: ScanOptions) => {
    if (scanRunningRef.current) return;

    dispatch({ type: 'SET_SCAN_RUNNING', value: true });
    dispatch({ type: 'SET_SCAN_RESULTS', results: null });
    dispatch({ type: 'SET_SCAN_PROGRESS', progress: null });
    lastProgressRef.current = { current: 0, total: 0 };

    const params = new URLSearchParams();
    if (options.noCache) params.set('noCache', 'true');
    if (options.checkChangelogs) params.set('checkChangelogs', 'true');
    if (options.useLlm) params.set('useLlm', 'true');
    if (options.limit > 0) params.set('limit', String(options.limit));

    const es = new EventSource(`/api/scan/stream?${params}`);
    esRef.current = es;

    es.addEventListener('progress', (e) => {
      const d = JSON.parse(e.data) as ScanProgress;
      lastProgressRef.current = { current: d.current, total: d.total };
      dispatch({ type: 'SET_SCAN_PROGRESS', progress: d });
    });

    es.addEventListener('status', (e) => {
      const d = JSON.parse(e.data) as { message: string };
      const { current, total } = lastProgressRef.current;
      dispatch({ type: 'SET_SCAN_PROGRESS', progress: { current, total, modName: d.message, source: '' } });
    });

    es.addEventListener('done', (e) => {
      es.close();
      esRef.current = null;
      const results = JSON.parse(e.data) as ScanResults;
      dispatch({ type: 'SET_SCAN_RESULTS', results });
      dispatch({ type: 'SET_SCAN_RUNNING', value: false });
      dispatch({ type: 'SET_SCAN_PROGRESS', progress: null });
    });

    es.addEventListener('cancelled', () => {
      es.close();
      esRef.current = null;
      dispatch({ type: 'SET_SCAN_RUNNING', value: false });
      dispatch({ type: 'SET_SCAN_PROGRESS', progress: null });
    });

    es.addEventListener('error', () => {
      es.close();
      esRef.current = null;
      dispatch({ type: 'SET_SCAN_RUNNING', value: false });
    });
  }, [dispatch]);

  const cancelScan = useCallback(async () => {
    // Show immediate feedback while waiting for server to finish current work
    const { current, total } = lastProgressRef.current;
    dispatch({ type: 'SET_SCAN_PROGRESS', progress: { current, total, modName: 'Cancelling...', source: '' } });
    try {
      await cancelScanApi();
      // Server will send 'cancelled' SSE event → handled by the listener above
    } catch {
      // POST failed (e.g. scan already finished) — force cleanup as fallback
      esRef.current?.close();
      esRef.current = null;
      dispatch({ type: 'SET_SCAN_RUNNING', value: false });
      dispatch({ type: 'SET_SCAN_PROGRESS', progress: null });
    }
  }, [dispatch]);

  return { startScan, cancelScan, scanRunning: state.scanRunning };
}

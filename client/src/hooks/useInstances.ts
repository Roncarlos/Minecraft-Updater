import { useCallback, useRef } from 'react';
import { useAppContext } from '../context';
import { selectInstance, selectInstanceFolder, browsePath } from '../api/endpoints';

export function useInstances() {
  const { state, dispatch } = useAppContext();
  const customFolderPath = useRef<string | null>(null);

  const clearStale = useCallback(() => {
    dispatch({ type: 'SET_INSTANCE_META', meta: null });
    dispatch({ type: 'SET_SCAN_RESULTS', results: null });
    dispatch({ type: 'SET_DOWNLOAD_STATE', state: {} });
  }, [dispatch]);

  const switchInstance = useCallback(async (name: string) => {
    clearStale();

    try {
      // If this name matches the current custom folder, re-select by path
      if (customFolderPath.current && name === customFolderPath.current.split(/[\\/]/).pop()) {
        const result = await selectInstanceFolder(customFolderPath.current);
        dispatch({ type: 'SET_SELECTED_INSTANCE', name: result.folderName });
        dispatch({ type: 'SET_INSTANCE_META', meta: result });
        return;
      }

      customFolderPath.current = null;
      const meta = await selectInstance(name);
      dispatch({ type: 'SET_SELECTED_INSTANCE', name });
      dispatch({ type: 'SET_INSTANCE_META', meta });
    } catch {
      // Failed to switch — keep null meta
    }
  }, [dispatch, clearStale]);

  const browseFolder = useCallback(async () => {
    try {
      const { path } = await browsePath('folder');
      if (!path) return; // user cancelled

      clearStale();

      const result = await selectInstanceFolder(path);
      customFolderPath.current = path;
      dispatch({ type: 'SET_SELECTED_INSTANCE', name: result.folderName });
      dispatch({ type: 'SET_INSTANCE_META', meta: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load folder';
      dispatch({ type: 'SET_SELECTED_INSTANCE', name: null });
      alert(msg);
    }
  }, [dispatch, clearStale]);

  return {
    instances: state.instances,
    selectedInstance: state.selectedInstance,
    instanceMeta: state.instanceMeta,
    switchInstance,
    browseFolder,
  };
}

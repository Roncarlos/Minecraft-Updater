import { useCallback } from 'react';
import { useAppContext } from '../context';
import { selectInstance } from '../api/endpoints';

export function useInstances() {
  const { state, dispatch } = useAppContext();

  const switchInstance = useCallback(async (name: string) => {
    dispatch({ type: 'SET_INSTANCE_META', meta: null });
    dispatch({ type: 'SET_SCAN_RESULTS', results: null });
    dispatch({ type: 'SET_DOWNLOAD_STATE', state: {} });

    try {
      const meta = await selectInstance(name);
      dispatch({ type: 'SET_SELECTED_INSTANCE', name });
      dispatch({ type: 'SET_INSTANCE_META', meta });
    } catch {
      // Failed to switch — keep null meta
    }
  }, [dispatch]);

  return {
    instances: state.instances,
    selectedInstance: state.selectedInstance,
    instanceMeta: state.instanceMeta,
    switchInstance,
  };
}

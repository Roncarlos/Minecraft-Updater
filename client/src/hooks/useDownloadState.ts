import { useCallback } from 'react';
import { useAppContext } from '../context';
import { fetchDownloadState } from '../api/endpoints';

export function useDownloadState() {
  const { state, dispatch } = useAppContext();

  const refresh = useCallback(async () => {
    const dlState = await fetchDownloadState();
    dispatch({ type: 'SET_DOWNLOAD_STATE', state: dlState });
    return dlState;
  }, [dispatch]);

  return {
    downloadState: state.downloadState,
    refresh,
  };
}

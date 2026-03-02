import { useEffect } from 'react';
import { checkLlmHealth } from '../api/endpoints';
import type { AppAction } from '../context';

const POLL_INTERVAL = 30_000;

export function useLlmHeartbeat(
  enabled: boolean,
  dispatch: React.Dispatch<AppAction>,
) {
  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    const poll = async () => {
      try {
        const data = await checkLlmHealth(controller.signal);
        dispatch({ type: 'SET_LLM_STATUS', status: data.status === 'online' ? 'online' : 'offline' });
      } catch {
        if (!controller.signal.aborted) {
          dispatch({ type: 'SET_LLM_STATUS', status: 'offline' });
        }
      }
    };

    poll();
    let id = setInterval(poll, POLL_INTERVAL);

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(id);
      } else {
        poll();
        id = setInterval(poll, POLL_INTERVAL);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      controller.abort();
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, dispatch]);
}

import { useState, useCallback } from 'react';
import { browsePath } from '../api/endpoints';

export function useBrowse() {
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(async (type: 'file' | 'folder', initialDir?: string): Promise<string | null> => {
    setBrowsing(true);
    setError(null);
    try {
      const { path } = await browsePath(type, initialDir);
      return path;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Browse failed');
      return null;
    } finally {
      setBrowsing(false);
    }
  }, []);

  return { browsing, error, browse };
}

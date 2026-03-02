import { useState, useRef, useCallback } from 'react';
import { searchMods } from '../api/modifier-endpoints';
import type { CfSearchResult } from '../types';

export function useModSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CfSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback((q: string, mcVersion?: string, loader?: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchMods(q, mcVersion, loader);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearching(false);
  }, []);

  return { query, results, searching, search, clear };
}

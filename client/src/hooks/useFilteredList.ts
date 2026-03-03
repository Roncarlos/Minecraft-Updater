import { useState, useMemo } from 'react';

const FILTER_THRESHOLD = 5;

export function useFilteredList<T>(items: T[], keys: (item: T) => string[]) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter(item => keys(item).some(k => k.toLowerCase().includes(q)));
  }, [items, search]);

  const showFilter = items.length > FILTER_THRESHOLD;

  return { search, setSearch, filtered, showFilter } as const;
}

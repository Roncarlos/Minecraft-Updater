import { useState } from 'react';
import { useAppContext } from '../../context';
import ResultSection from './ResultSection';

const SECTIONS = [
  { key: 'breaking', title: 'Breaking Changes', cssClass: 'breaking', showActions: true },
  { key: 'caution', title: 'Caution', cssClass: 'caution', showActions: true },
  { key: 'reviewDeps', title: 'Review Deps', cssClass: 'review-deps', showActions: true },
  { key: 'safeToUpdate', title: 'Safe to Update', cssClass: 'safe', showActions: true },
  { key: 'updates', title: 'Updates Available', cssClass: 'update', showActions: true },
  { key: 'upToDate', title: 'Up to Date', cssClass: 'ok', showActions: false },
] as const;

export default function ResultsContainer() {
  const { state } = useAppContext();
  const results = state.scanResults;
  const [search, setSearch] = useState('');

  if (!results) return null;

  const q = search.toLowerCase();

  const filteredErrors = results.errors.filter(
    err => !q || err.name.toLowerCase().includes(q),
  );

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Filter mods by name…"
        className="w-full mb-4 px-3 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted outline-none focus:border-accent"
      />

      {SECTIONS.map(({ key, title, cssClass, showActions }) => {
        const items = (results[key] || []).filter(
          item => !q || item.name.toLowerCase().includes(q),
        );
        if (items.length === 0) return null;
        return (
          <ResultSection
            key={key}
            title={title}
            cssClass={cssClass}
            items={items}
            showActions={showActions}
          />
        );
      })}

      {filteredErrors.length > 0 && (
        <div className="mt-8 p-4 bg-surface border border-border rounded-lg">
          <h3 className="text-muted mb-2">API Errors ({filteredErrors.length})</h3>
          <ul className="pl-6 text-muted text-[0.85rem]">
            {filteredErrors.map(err => (
              <li key={err.addonID}>
                <strong>{err.name}</strong> (ID {err.addonID}): {err.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

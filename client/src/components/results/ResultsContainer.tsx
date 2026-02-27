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

  if (!results) return null;

  return (
    <div>
      {SECTIONS.map(({ key, title, cssClass, showActions }) => {
        const items = results[key] || [];
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

      {results.errors.length > 0 && (
        <div className="mt-8 p-4 bg-surface border border-border rounded-lg">
          <h3 className="text-muted mb-2">API Errors ({results.errors.length})</h3>
          <ul className="pl-6 text-muted text-[0.85rem]">
            {results.errors.map(err => (
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

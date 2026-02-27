import { useState } from 'react';
import type { ModItem } from '../../types';
import ModTable from './ModTable';
import BulkActions from './BulkActions';

const sectionStyles: Record<string, { bg: string; text: string; border: string }> = {
  breaking: { bg: 'bg-danger-bg', text: 'text-danger', border: 'border-danger' },
  caution: { bg: 'bg-orange-bg', text: 'text-orange', border: 'border-orange' },
  'review-deps': { bg: 'bg-purple-bg', text: 'text-purple', border: 'border-purple' },
  safe: { bg: 'bg-cyan-bg', text: 'text-cyan', border: 'border-cyan' },
  update: { bg: 'bg-warning-bg', text: 'text-warning', border: 'border-warning' },
  ok: { bg: 'bg-success-bg', text: 'text-success', border: 'border-success' },
};

interface ResultSectionProps {
  title: string;
  cssClass: string;
  items: ModItem[];
  showActions: boolean;
}

export default function ResultSection({ title, cssClass, items, showActions }: ResultSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const styles = sectionStyles[cssClass] ?? sectionStyles['ok']!;
  const hasUpdates = showActions && items.some(i => i.hasUpdate && i.latestFile);

  return (
    <div className="mb-8">
      <h2
        className={`text-xl px-4 py-3 flex items-center gap-3 cursor-pointer select-none border ${styles.bg} ${styles.text} ${styles.border} ${collapsed ? 'rounded-lg' : 'rounded-t-lg border-b-0'}`}
        onClick={() => setCollapsed(c => !c)}
      >
        <span className={`inline-block text-[0.8rem] transition-transform ${collapsed ? '-rotate-90' : ''}`}>&#9660;</span>
        <span>{title} ({items.length})</span>
        {hasUpdates && <BulkActions sectionKey={cssClass} />}
      </h2>
      {!collapsed && (
        <ModTable items={items} cssClass={cssClass} showActions={showActions} />
      )}
    </div>
  );
}

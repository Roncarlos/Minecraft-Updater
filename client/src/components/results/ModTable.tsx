import type { ModItem } from '../../types';
import ModRow from './ModRow';

interface ModTableProps {
  items: ModItem[];
  cssClass: string;
  showActions: boolean;
}

export default function ModTable({ items, cssClass, showActions }: ModTableProps) {
  return (
    <table className="w-full border-separate border-spacing-0 bg-surface border border-border rounded-b-lg overflow-hidden">
      <thead>
        <tr>
          <th className="bg-surface-hover text-left px-4 py-2.5 text-[0.8rem] uppercase tracking-wide text-muted border-b border-border">Mod</th>
          <th className="bg-surface-hover text-left px-4 py-2.5 text-[0.8rem] uppercase tracking-wide text-muted border-b border-border">Installed</th>
          <th className="bg-surface-hover text-left px-4 py-2.5 text-[0.8rem] uppercase tracking-wide text-muted border-b border-border">Available</th>
          <th className="bg-surface-hover text-left px-4 py-2.5 text-[0.8rem] uppercase tracking-wide text-muted border-b border-border">Refs</th>
          <th className="bg-surface-hover text-left px-4 py-2.5 text-[0.8rem] uppercase tracking-wide text-muted border-b border-border">Deps</th>
          <th className="bg-surface-hover text-left px-4 py-2.5 text-[0.8rem] uppercase tracking-wide text-muted border-b border-border">Status</th>
          {showActions && <th className="bg-surface-hover text-left px-4 py-2.5 text-[0.8rem] uppercase tracking-wide text-muted border-b border-border">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <ModRow key={item.addonID} item={item} cssClass={cssClass} showActions={showActions} />
        ))}
      </tbody>
    </table>
  );
}

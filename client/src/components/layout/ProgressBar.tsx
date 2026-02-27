import { useAppContext } from '../../context';

export default function ProgressBar() {
  const { state } = useAppContext();
  const { scanRunning, scanProgress } = state;

  if (!scanRunning) return null;

  const pct = scanProgress && scanProgress.total > 0
    ? Math.floor((scanProgress.current / scanProgress.total) * 100)
    : 0;

  const text = scanProgress?.modName || 'Starting scan...';
  const count = scanProgress && scanProgress.total > 0
    ? `${scanProgress.current} / ${scanProgress.total}`
    : '';

  return (
    <div className="mb-6">
      <div className="flex justify-between mb-1 text-[0.85rem] text-muted">
        <span>{text}{scanProgress?.source ? ` (${scanProgress.source})` : ''}</span>
        <span>{count}</span>
      </div>
      <div className="h-2 bg-surface border border-border rounded overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-info to-success rounded transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

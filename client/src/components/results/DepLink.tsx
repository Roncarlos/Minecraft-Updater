import { useAppContext } from '../../context';
import { buildUpdateLookup } from '../../utils/depGraph';

interface DepLinkProps {
  addonId: number;
  deps: number[];
  onClick: () => void;
}

export default function DepLink({ addonId: _addonId, deps, onClick }: DepLinkProps) {
  const { state } = useAppContext();

  if (deps.length === 0) return <span>0</span>;

  const results = state.scanResults;
  let pendingCount = 0;
  let hasBreakingDep = false;
  let hasCautionDep = false;

  if (results) {
    const updateLookup = buildUpdateLookup(results);
    pendingCount = deps.filter(d => updateLookup.has(d)).length;

    const breakingIds = new Set((results.breaking || []).map(m => m.addonID));
    const cautionIds = new Set((results.caution || []).map(m => m.addonID));
    hasBreakingDep = deps.some(d => breakingIds.has(d));
    hasCautionDep = deps.some(d => cautionIds.has(d));
  }

  const label = pendingCount > 0 ? `${deps.length} (${pendingCount} pending)` : String(deps.length);

  return (
    <span>
      <span
        className="cursor-pointer border-b border-dotted border-success text-success hover:text-cyan"
        onClick={onClick}
      >
        {label}
      </span>
      {hasBreakingDep && <span className="text-danger text-[0.85rem] ml-0.5" title="Has dependency with breaking changes">&#9888;</span>}
      {hasCautionDep && <span className="text-orange text-[0.85rem] ml-0.5" title="Has dependency requiring caution">&#9670;</span>}
    </span>
  );
}

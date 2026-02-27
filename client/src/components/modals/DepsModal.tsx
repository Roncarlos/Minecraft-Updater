import { useAppContext } from '../../context';
import { buildAllModsLookup, buildUpdateLookup } from '../../utils/depGraph';
import ModalShell from './ModalShell';
import Button from '../ui/Button';

interface DepsModalProps {
  addonId: number;
  modName: string;
}

export default function DepsModal({ addonId, modName }: DepsModalProps) {
  const { state, closeModal } = useAppContext();
  const results = state.scanResults;

  if (!results || !results.dependencyGraph) {
    return (
      <ModalShell onClose={closeModal}>
        <h3 className="mb-4 text-text text-lg">Dependencies: {modName}</h3>
        <p className="text-muted">No dependency data available.</p>
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
          <Button variant="cancel" size="sm" onClick={closeModal}>Close</Button>
        </div>
      </ModalShell>
    );
  }

  const graph = results.dependencyGraph;
  const node = graph[addonId];
  const allMods = buildAllModsLookup(results);
  const updateLookup = buildUpdateLookup(results);

  const breakingIds = new Set((results.breaking || []).map(m => m.addonID));
  const cautionIds = new Set((results.caution || []).map(m => m.addonID));

  const depsToShow = node?.deps || [];
  const item = allMods.get(addonId);
  const rawDeps = item?.dependencies || [];

  // Deps not in graph (missing/uninstalled)
  const missingDeps = rawDeps.filter(depId => !depsToShow.includes(depId) && !allMods.has(depId));

  const relevantMissing = (results.missingDeps || []).filter(md => md.neededBy.includes(addonId));

  return (
    <ModalShell onClose={closeModal}>
      <h3 className="mb-4 text-text text-lg">Dependencies: {modName}</h3>
      <div className="overflow-y-auto flex-1">
        {depsToShow.length === 0 && missingDeps.length === 0 ? (
          <p className="text-muted">No required dependencies.</p>
        ) : (
          <ul className="list-none p-0">
            {depsToShow.map(depId => {
              const mod = allMods.get(depId);
              const name = mod ? mod.name : `Addon ${depId}`;
              const hasBreaking = breakingIds.has(depId);
              const hasCaution = cautionIds.has(depId);
              const hasUpdate = updateLookup.has(depId);
              const statusColor = hasUpdate ? 'text-warning' : mod ? 'text-success' : 'text-muted';
              const statusText = hasUpdate ? 'has update' : mod ? 'up to date' : 'unknown';

              return (
                <li key={depId} className="px-2.5 py-1.5 text-[0.8rem] text-muted border-b border-border last:border-b-0 hover:bg-bg font-mono">
                  {name}
                  {hasBreaking && <span className="text-danger text-[0.85rem] ml-1" title="Breaking changes">&#9888;</span>}
                  {hasCaution && <span className="text-orange text-[0.85rem] ml-1" title="Caution">&#9670;</span>}
                  {' '}&mdash; <span className={statusColor}>{statusText}</span>
                </li>
              );
            })}
            {missingDeps.map(depId => (
              <li key={depId} className="px-2.5 py-1.5 text-[0.8rem] text-muted border-b border-border last:border-b-0 hover:bg-bg font-mono">
                Addon {depId} &mdash; <span className="text-danger">not installed</span>
              </li>
            ))}
          </ul>
        )}
        {relevantMissing.length > 0 && (
          <p className="text-warning mt-3 text-[0.85rem]">
            Some required dependencies are not installed in this instance.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <Button variant="cancel" size="sm" onClick={closeModal}>Close</Button>
      </div>
    </ModalShell>
  );
}

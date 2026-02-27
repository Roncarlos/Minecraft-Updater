import { useEffect, useState } from 'react';
import { fetchConfigRefs } from '../../api/endpoints';
import { groupFilesByTier } from '../../utils/severityRules';
import { useAppContext } from '../../context';
import ModalShell from './ModalShell';
import Button from '../ui/Button';

interface RefsModalProps {
  addonId: number;
  modName: string;
}

export default function RefsModal({ addonId, modName }: RefsModalProps) {
  const { closeModal } = useAppContext();
  const [files, setFiles] = useState<string[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConfigRefs(addonId)
      .then(data => { if (!cancelled) setFiles(data.files); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [addonId]);

  const tiers = files ? groupFilesByTier(files) : null;

  return (
    <ModalShell onClose={closeModal}>
      <h3 className="mb-4 text-text text-lg">References: {modName}</h3>
      <div className="overflow-y-auto flex-1">
        {error && <p className="text-danger">Failed to load references.</p>}
        {files !== null && files.length === 0 && <p className="text-muted">No references found.</p>}
        {tiers && (
          <>
            {tiers.high.length > 0 && (
              <>
                <div className="text-[0.8rem] font-bold uppercase tracking-wide px-2.5 py-2 mt-2 first:mt-0 text-danger">
                  High Risk ({tiers.high.length} files)
                </div>
                <ul className="list-none p-0">
                  {tiers.high.map(f => (
                    <li key={f} className="px-2.5 py-1.5 font-mono text-[0.8rem] text-muted border-b border-border last:border-b-0 hover:bg-bg">{f}</li>
                  ))}
                </ul>
              </>
            )}
            {tiers.medium.length > 0 && (
              <>
                <div className="text-[0.8rem] font-bold uppercase tracking-wide px-2.5 py-2 mt-2 text-orange">
                  Medium Risk ({tiers.medium.length} files)
                </div>
                <ul className="list-none p-0">
                  {tiers.medium.map(f => (
                    <li key={f} className="px-2.5 py-1.5 font-mono text-[0.8rem] text-muted border-b border-border last:border-b-0 hover:bg-bg">{f}</li>
                  ))}
                </ul>
              </>
            )}
            {tiers.low.length > 0 && (
              <>
                <div className="text-[0.8rem] font-bold uppercase tracking-wide px-2.5 py-2 mt-2 text-muted">
                  Low Risk ({tiers.low.length} files)
                </div>
                <ul className="list-none p-0">
                  {tiers.low.map(f => (
                    <li key={f} className="px-2.5 py-1.5 font-mono text-[0.8rem] text-muted border-b border-border last:border-b-0 hover:bg-bg">{f}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        {files === null && !error && <p className="text-muted">Loading...</p>}
      </div>
      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <Button variant="cancel" size="sm" onClick={closeModal}>Close</Button>
      </div>
    </ModalShell>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { fetchConfigRefs, openFile } from '../../api/endpoints';
import { groupFilesByTier, type FileRefEntry } from '../../utils/severityRules';
import { useAppContext } from '../../context';
import ModalShell from './ModalShell';
import Button from '../ui/Button';

interface RefsModalProps {
  addonId: number;
  modName: string;
}

function LineLinks({ filePath, lines }: { filePath: string; lines: number[] }) {
  const [errorLine, setErrorLine] = useState<number | null>(null);
  const unique = [...new Set(lines)];
  const visible = unique.slice(0, 5);
  const extra = unique.length - visible.length;

  const handleClick = (line: number) => {
    setErrorLine(null);
    openFile(filePath, line).catch(() => setErrorLine(line));
  };

  return (
    <span className="shrink-0 flex items-baseline gap-1 flex-wrap justify-end">
      {visible.map((n, i) => (
        <span key={n}>
          <button
            type="button"
            onClick={() => handleClick(n)}
            className={`${errorLine === n ? 'text-danger' : 'text-muted hover:text-accent'} hover:underline cursor-pointer bg-transparent border-none p-0 font-mono text-[0.8rem]`}
            title={errorLine === n ? `Failed to open ${filePath} at line ${n}` : `Open ${filePath} at line ${n}`}
          >
            L{n}
          </button>
          {i < visible.length - 1 || extra > 0 ? ',' : ''}
        </span>
      ))}
      {extra > 0 && <span className="text-muted">+{extra} more</span>}
    </span>
  );
}

function FileEntry({ entry }: { entry: FileRefEntry }) {
  const [openError, setOpenError] = useState(false);

  const handleClick = () => {
    setOpenError(false);
    openFile(entry.filePath, entry.lines[0]).catch(() => setOpenError(true));
  };

  return (
    <li className="flex items-baseline justify-between gap-3 px-2.5 py-1.5 font-mono text-[0.8rem] border-b border-border last:border-b-0 hover:bg-bg">
      <button
        type="button"
        onClick={handleClick}
        className="text-left text-accent hover:underline cursor-pointer truncate bg-transparent border-none p-0 font-mono text-[0.8rem]"
        title={`Open ${entry.filePath}`}
      >
        {entry.filePath}
      </button>
      {openError && <span className="text-danger whitespace-nowrap shrink-0">Failed to open</span>}
      {!openError && entry.lines.length > 0 && (
        <LineLinks filePath={entry.filePath} lines={entry.lines} />
      )}
    </li>
  );
}

export default function RefsModal({ addonId, modName }: RefsModalProps) {
  const { closeModal } = useAppContext();
  const [files, setFiles] = useState<Record<string, number[]> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConfigRefs(addonId)
      .then(data => { if (!cancelled) setFiles(data.files); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [addonId]);

  const tiers = useMemo(() => files ? groupFilesByTier(files) : null, [files]);

  return (
    <ModalShell onClose={closeModal}>
      <h3 className="mb-4 text-text text-lg">References: {modName}</h3>
      <div className="overflow-y-auto flex-1">
        {error && <p className="text-danger">Failed to load references.</p>}
        {files !== null && Object.keys(files).length === 0 && <p className="text-muted">No references found.</p>}
        {tiers && (
          <>
            {tiers.high.length > 0 && (
              <>
                <div className="text-[0.8rem] font-bold uppercase tracking-wide px-2.5 py-2 mt-2 first:mt-0 text-danger">
                  High Risk ({tiers.high.length} files)
                </div>
                <ul className="list-none p-0">
                  {tiers.high.map(entry => (
                    <FileEntry key={entry.filePath} entry={entry} />
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
                  {tiers.medium.map(entry => (
                    <FileEntry key={entry.filePath} entry={entry} />
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
                  {tiers.low.map(entry => (
                    <FileEntry key={entry.filePath} entry={entry} />
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

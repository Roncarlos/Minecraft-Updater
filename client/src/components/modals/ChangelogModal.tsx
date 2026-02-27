import { useState } from 'react';
import DOMPurify from 'dompurify';
import { useAppContext } from '../../context';
import { buildAllModsLookup } from '../../utils/depGraph';
import ModalShell from './ModalShell';
import Button from '../ui/Button';
import type { ModItem } from '../../types';

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}

interface ChangelogModalProps {
  addonId: number;
  modName: string;
}

export default function ChangelogModal({ addonId, modName }: ChangelogModalProps) {
  const { state, closeModal } = useAppContext();
  const allMods = state.scanResults ? buildAllModsLookup(state.scanResults) : null;
  const item = allMods?.get(addonId) || null;

  // LLM mode
  if (item?.llmChangelogs && item.llmChangelogs.length > 0) {
    return (
      <ModalShell onClose={closeModal} maxWidth="800px">
        <h3 className="mb-4 text-text text-lg">LLM Analysis: {modName}</h3>
        <div className="overflow-y-auto flex-1">
          {item.llmChangelogs.map((entry, i) => (
            <ChangelogVersionLlm key={i} entry={entry} />
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
          <Button variant="cancel" size="sm" onClick={closeModal}>Close</Button>
        </div>
      </ModalShell>
    );
  }

  // Keyword mode
  const flagged = item?.flaggedChangelogs || [];

  return (
    <ModalShell onClose={closeModal} maxWidth="800px">
      <h3 className="mb-4 text-text text-lg">Flagged Changelogs: {modName}</h3>
      <div className="overflow-y-auto flex-1">
        {flagged.length === 0 ? (
          <p className="text-muted">No flagged changelogs found.</p>
        ) : (
          flagged.map((entry, i) => (
            <ChangelogVersionKeyword key={i} entry={entry} />
          ))
        )}
      </div>
      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <Button variant="cancel" size="sm" onClick={closeModal}>Close</Button>
      </div>
    </ModalShell>
  );
}

function ChangelogVersionLlm({ entry }: { entry: NonNullable<ModItem['llmChangelogs']>[number] }) {
  const [open, setOpen] = useState(false);
  const date = new Date(entry.fileDate).toLocaleDateString();
  const analysis = entry.llmAnalysis;
  const sev = analysis?.severity || 'safe';

  const sevColors = {
    safe: 'bg-success-bg text-success border-success',
    caution: 'bg-warning-bg text-warning border-warning',
    breaking: 'bg-danger-bg text-danger border-danger',
  };

  return (
    <div className="border border-border rounded-md mb-3 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-bg cursor-pointer text-[0.85rem] select-none hover:bg-surface-hover"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-text font-semibold">{entry.fileName}</span>
        <span className="text-muted text-[0.8rem]">{date}</span>
        <span className={`inline-block px-2 py-0.5 rounded text-[0.7rem] font-bold uppercase border ${sevColors[sev]}`}>
          {sev.toUpperCase()}
        </span>
      </div>
      {open && (
        <div className="px-3 py-3 text-[0.85rem] leading-relaxed text-muted border-t border-border max-h-[300px] overflow-y-auto">
          {analysis?.summary && (
            <div className="bg-bg border border-border rounded px-3 py-2 mb-2 text-[0.85rem] text-muted">
              {analysis.summary}
            </div>
          )}
          {analysis?.breakingItems && analysis.breakingItems.length > 0 && (
            <ul className="ml-5 mb-2">
              {analysis.breakingItems.map((bi, i) => (
                <li key={i} className="text-danger text-[0.85rem] py-0.5">{bi}</li>
              ))}
            </ul>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-muted text-[0.8rem]">Show changelog</summary>
            <div className="mt-1.5 [&_p]:mb-1.5 [&_ul]:pl-5 [&_ul]:mb-1.5 [&_li]:mb-0.5 [&_a]:text-info [&_a:hover]:underline" dangerouslySetInnerHTML={{ __html: sanitizeHtml(entry.changelogHtml) }} />
          </details>
        </div>
      )}
    </div>
  );
}

function ChangelogVersionKeyword({ entry }: { entry: NonNullable<ModItem['flaggedChangelogs']>[number] }) {
  const [open, setOpen] = useState(false);
  const date = new Date(entry.fileDate).toLocaleDateString();
  const uniqueKws = [...new Set(entry.keywords)];

  return (
    <div className="border border-border rounded-md mb-3 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-bg cursor-pointer text-[0.85rem] select-none hover:bg-surface-hover"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-text font-semibold">{entry.fileName}</span>
        <span className="text-muted text-[0.8rem]">{date}</span>
        {uniqueKws.map(kw => (
          <span key={kw} className="inline-block bg-danger-bg text-danger px-1.5 py-0.5 rounded text-[0.7rem] font-semibold">
            {kw}
          </span>
        ))}
      </div>
      {open && (
        <div
          className="px-3 py-3 text-[0.85rem] leading-relaxed text-muted border-t border-border max-h-[300px] overflow-y-auto [&_p]:mb-1.5 [&_ul]:pl-5 [&_ul]:mb-1.5"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(entry.changelogHtml) }}
        />
      )}
    </div>
  );
}

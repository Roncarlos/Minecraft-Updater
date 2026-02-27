import { useAppContext } from '../../context';
import ModalShell from './ModalShell';
import Button from '../ui/Button';
import type { ModItem } from '../../types';

interface ApplyConfirmModalProps {
  title: string;
  mods: { addonId: number; oldFileName: string; newFileName: string }[];
  extraDeps: ModItem[];
  onConfirm: () => void;
}

export default function ApplyConfirmModal({ title, mods, extraDeps, onConfirm }: ApplyConfirmModalProps) {
  const { closeModal } = useAppContext();

  const handleConfirm = () => {
    closeModal();
    onConfirm();
  };

  return (
    <ModalShell onClose={closeModal}>
      <h3 className="mb-4 text-text text-lg">{title}</h3>
      <div className="overflow-y-auto flex-1">
        {mods.length === 1 ? (
          <p>
            Replace <strong>{mods[0]!.oldFileName}</strong> with <strong>{mods[0]!.newFileName}</strong>?
          </p>
        ) : (
          <>
            <p>This will replace the following mods:</p>
            <ul className="mt-2 ml-5">
              {mods.map(m => (
                <li key={m.addonId}>{m.oldFileName} &rarr; {m.newFileName}</li>
              ))}
            </ul>
          </>
        )}

        {extraDeps.length > 0 && (
          <>
            <p className="text-warning mt-3 text-[0.85rem]">
              {mods.length === 1
                ? 'The following dependencies will also be updated:'
                : 'Includes dependencies from other sections:'}
            </p>
            <ul className="mt-1 ml-5">
              {extraDeps.map(d => (
                <li key={d.addonID}>{d.name}: {d.installedFile} &rarr; {d.latestFile}</li>
              ))}
            </ul>
          </>
        )}

        <p className="text-muted mt-2 text-[0.85rem]">
          The old jars will be backed up and can be rolled back.
        </p>
      </div>
      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <Button variant="cancel" size="sm" onClick={closeModal}>Cancel</Button>
        <Button variant="confirm" size="sm" onClick={handleConfirm}>Apply</Button>
      </div>
    </ModalShell>
  );
}

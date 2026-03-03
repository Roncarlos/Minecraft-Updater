import { useAppContext } from '../../context';
import ModalShell from '../modals/ModalShell';
import Button from '../ui/Button';
import type { PresetPreviewResult } from '../../types';

interface PresetPreviewModalProps {
  preview: PresetPreviewResult;
  onConfirmApply: () => void;
}

interface PreviewSectionProps {
  title: string;
  items: { targetPath?: string; fileName?: string; action: string; downloaded?: boolean }[];
  actionColors: Record<string, string>;
}

function PreviewSection({ title, items, actionColors }: PreviewSectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className="text-info text-[0.85rem] uppercase tracking-wide mb-2">
        {title} ({items.length})
      </h4>
      {items.map((item, i) => (
        <div key={`${item.targetPath ?? item.fileName}-${i}`} className="text-[0.8rem] mt-0.5 flex items-baseline gap-1.5">
          <span className={actionColors[item.action] ?? 'text-muted'}>
            {item.action}
          </span>
          <span className="text-muted">{item.targetPath ?? item.fileName}</span>
          {item.downloaded === false && (
            <span className="text-danger text-[0.75rem]">(not downloaded)</span>
          )}
        </div>
      ))}
    </div>
  );
}

const MOD_COLORS: Record<string, string> = { add: 'text-info', overwrite: 'text-warning' };
const CONFIG_COLORS: Record<string, string> = { created: 'text-info', merged: 'text-success', replaced: 'text-warning' };

export default function PresetPreviewModal({ preview, onConfirmApply }: PresetPreviewModalProps) {
  const { closeModal } = useAppContext();

  const totalFiles =
    preview.mods.length +
    preview.configs.length +
    preview.kubejs.length +
    preview.resourcepacks.length;

  const handleConfirm = () => {
    closeModal();
    onConfirmApply();
  };

  return (
    <ModalShell onClose={closeModal} maxWidth="600px">
      <h3 className="mb-1 text-text text-lg">Preview Changes</h3>
      <p className="text-muted text-[0.85rem] mb-4">
        Applying <strong>{preview.presetName}</strong> to <strong>{preview.instanceName}</strong> will
        affect {totalFiles} file(s)
      </p>

      <div className="overflow-y-auto flex-1">
        {totalFiles === 0 ? (
          <p className="text-muted text-[0.85rem]">This preset has no files to apply.</p>
        ) : (
          <>
            <PreviewSection title="Mods" items={preview.mods} actionColors={MOD_COLORS} />
            <PreviewSection title="Configs" items={preview.configs} actionColors={CONFIG_COLORS} />
            <PreviewSection title="KubeJS" items={preview.kubejs} actionColors={MOD_COLORS} />
            <PreviewSection title="Resource Packs" items={preview.resourcepacks} actionColors={MOD_COLORS} />
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <Button variant="cancel" size="sm" onClick={closeModal}>Cancel</Button>
        <Button variant="apply" size="sm" onClick={handleConfirm} disabled={totalFiles === 0}>Apply Preset</Button>
      </div>
    </ModalShell>
  );
}

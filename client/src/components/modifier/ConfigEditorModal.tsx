import { useState } from 'react';
import { useAppContext } from '../../context';
import ModalShell from '../modals/ModalShell';
import Button from '../ui/Button';

interface ConfigEditorModalProps {
  targetPath: string;
  content: string;
  onSave: (content: string) => Promise<void>;
}

export default function ConfigEditorModal({ targetPath, content: initialContent, onSave }: ConfigEditorModalProps) {
  const { closeModal } = useAppContext();
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(content);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={closeModal} maxWidth="750px">
      <h3 className="mb-1 text-text text-lg">Edit Config</h3>
      <p className="text-muted text-[0.85rem] mb-3">{targetPath}</p>

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        className="flex-1 bg-bg border border-border text-text px-3 py-2 rounded text-[0.8rem] font-mono resize-none focus:outline-none focus:border-info min-h-[300px]"
        spellCheck={false}
      />

      {error && <p className="text-danger text-[0.85rem] mt-2">{error}</p>}

      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <Button variant="cancel" size="sm" onClick={closeModal} disabled={saving}>Cancel</Button>
        <Button variant="confirm" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </ModalShell>
  );
}

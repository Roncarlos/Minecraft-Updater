import { useState } from 'react';
import Button from '../ui/Button';
import type { Preset } from '../../types';

interface DisableModsEditorProps {
  presetId: string;
  patterns: string[];
  onUpdate: (updates: Partial<Pick<Preset, 'disableMods'>>) => Promise<void>;
}

export default function DisableModsEditor({ patterns, onUpdate }: DisableModsEditorProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Validate regex
    try {
      new RegExp(trimmed);
    } catch {
      setError('Invalid regular expression');
      return;
    }

    if (patterns.includes(trimmed)) {
      setError('Pattern already exists');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onUpdate({ disableMods: [...patterns, trimmed] });
      setInput('');
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (index: number) => {
    setSaving(true);
    try {
      await onUpdate({ disableMods: patterns.filter((_, i) => i !== index) });
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted text-[0.8rem]">
        Regex patterns matched against mod filenames in the target instance. Matching mods will be renamed to <code>.disabled</code> on apply.
      </p>

      {patterns.length > 0 && (
        <div className="flex flex-col gap-1">
          {patterns.map((pattern, i) => (
            <div key={pattern} className="flex items-center gap-2 bg-bg rounded px-2.5 py-1.5 text-[0.82rem] font-mono group">
              <span className="flex-1 text-text truncate">{pattern}</span>
              <button
                onClick={() => handleRemove(i)}
                disabled={saving}
                className="opacity-0 group-hover:opacity-100 text-danger hover:text-danger cursor-pointer shrink-0 text-sm"
                title="Remove pattern"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. ^OptiFine.*"
          className="flex-1 bg-bg border border-border text-text px-2.5 py-1.5 rounded text-[0.85rem] font-mono focus:outline-none focus:border-info"
        />
        <Button variant="download" size="sm" onClick={handleAdd} disabled={saving || !input.trim()}>
          Add
        </Button>
      </div>

      {error && <div className="text-danger text-[0.8rem]">{error}</div>}
    </div>
  );
}

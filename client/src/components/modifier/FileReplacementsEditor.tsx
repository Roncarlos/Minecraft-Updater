import { useState } from 'react';
import Button from '../ui/Button';
import type { Preset, FileReplacementRule, FileReplacement } from '../../types';

interface FileReplacementsEditorProps {
  rules: FileReplacementRule[];
  onUpdate: (updates: Partial<Pick<Preset, 'fileReplacements'>>) => Promise<void>;
}

export default function FileReplacementsEditor({ rules, onUpdate }: FileReplacementsEditorProps) {
  const [targetPath, setTargetPath] = useState('');
  const [pattern, setPattern] = useState('');
  const [replacement, setReplacement] = useState('');
  const [flagI, setFlagI] = useState(false);
  const [flagM, setFlagM] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAddRule = async () => {
    const path = targetPath.trim();
    const pat = pattern.trim();
    if (!path) { setError('Target path is required'); return; }
    if (!pat) { setError('Pattern is required'); return; }

    // Validate regex syntax and basic ReDoS safety
    try {
      new RegExp(pat);
    } catch {
      setError('Invalid regular expression');
      return;
    }
    if (/([+*]|\{\d)[^)]*\)\s*[+*{]/.test(pat)) {
      setError('Potentially unsafe regex (nested quantifiers)');
      return;
    }

    const flags = (flagI ? 'i' : '') + (flagM ? 'm' : '');
    const newReplacement: FileReplacement = {
      pattern: pat,
      replacement,
      ...(flags ? { flags } : {}),
    };

    // Check if there's already a rule for this target path
    const existingIdx = rules.findIndex(r => r.targetPath === path);
    let newRules: FileReplacementRule[];

    if (existingIdx !== -1) {
      // Add replacement to existing rule
      newRules = rules.map((r, i) =>
        i === existingIdx
          ? { ...r, replacements: [...r.replacements, newReplacement] }
          : r
      );
    } else {
      // Create new rule
      newRules = [...rules, { targetPath: path, replacements: [newReplacement] }];
    }

    setError(null);
    setSaving(true);
    try {
      await onUpdate({ fileReplacements: newRules });
      setPattern('');
      setReplacement('');
      setFlagI(false);
      setFlagM(false);
      // Keep targetPath so user can add more replacements to the same file
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRule = async (ruleIndex: number) => {
    setError(null);
    setSaving(true);
    try {
      await onUpdate({ fileReplacements: rules.filter((_, i) => i !== ruleIndex) });
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveReplacement = async (ruleIndex: number, repIndex: number) => {
    const rule = rules[ruleIndex]!;
    if (rule.replacements.length <= 1) {
      // Last replacement — remove the whole rule
      return handleRemoveRule(ruleIndex);
    }
    const newRules = rules.map((r, i) =>
      i === ruleIndex
        ? { ...r, replacements: r.replacements.filter((_, j) => j !== repIndex) }
        : r
    );
    setError(null);
    setSaving(true);
    try {
      await onUpdate({ fileReplacements: newRules });
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddRule();
    }
  };

  const inputClass = "flex-1 bg-bg border border-border text-text px-2.5 py-1.5 rounded text-[0.85rem] font-mono focus:outline-none focus:border-info";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted text-[0.8rem]">
        Regex replacements applied to files in the target instance after config merging.
        The <code>g</code> (global) flag is always applied.
      </p>

      {/* Existing rules */}
      {rules.length > 0 && (
        <div className="flex flex-col gap-2">
          {rules.map((rule, ri) => (
            <div key={`${rule.targetPath}-${ri}`} className="bg-bg rounded px-3 py-2 group">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-info text-[0.82rem] font-mono flex-1 truncate" title={rule.targetPath}>
                  {rule.targetPath}
                </span>
                <button
                  onClick={() => handleRemoveRule(ri)}
                  disabled={saving}
                  className="opacity-0 group-hover:opacity-100 text-danger hover:text-danger cursor-pointer shrink-0 text-sm"
                  title="Remove all replacements for this file"
                >
                  &times;
                </button>
              </div>
              {rule.replacements.map((rep, repi) => (
                <div key={`${rep.pattern}-${repi}`} className="flex items-start gap-2 ml-3 mt-1 text-[0.8rem] group/rep">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-muted shrink-0">/{rep.pattern}/</span>
                      {rep.flags && <span className="text-warning text-[0.75rem]">{rep.flags}</span>}
                      <span className="text-muted shrink-0">&rarr;</span>
                      <span className="text-text truncate">{rep.replacement || <span className="text-muted italic">empty</span>}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveReplacement(ri, repi)}
                    disabled={saving}
                    className="opacity-0 group-hover/rep:opacity-100 text-danger hover:text-danger cursor-pointer shrink-0 text-sm mt-0.5"
                    title="Remove this replacement"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Add new replacement form */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-center gap-2">
          <label className="text-muted text-[0.8rem] min-w-[60px] shrink-0">File</label>
          <input
            type="text"
            value={targetPath}
            onChange={e => { setTargetPath(e.target.value); setError(null); }}
            placeholder="e.g. config/mymod.toml"
            className={inputClass}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-muted text-[0.8rem] min-w-[60px] shrink-0">Pattern</label>
          <input
            type="text"
            value={pattern}
            onChange={e => { setPattern(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="regex pattern"
            className={inputClass}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-muted text-[0.8rem] min-w-[60px] shrink-0">Replace</label>
          <input
            type="text"
            value={replacement}
            onChange={e => { setReplacement(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="replacement text"
            className={inputClass}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-muted text-[0.8rem] min-w-[60px] shrink-0">Flags</label>
          <label className="flex items-center gap-1 text-[0.82rem] text-muted cursor-pointer">
            <input type="checkbox" checked={flagI} onChange={e => setFlagI(e.target.checked)} className="accent-info" />
            <span>i</span>
            <span className="text-[0.75rem]">(case-insensitive)</span>
          </label>
          <label className="flex items-center gap-1 text-[0.82rem] text-muted cursor-pointer ml-2">
            <input type="checkbox" checked={flagM} onChange={e => setFlagM(e.target.checked)} className="accent-info" />
            <span>m</span>
            <span className="text-[0.75rem]">(multiline)</span>
          </label>
          <div className="flex-1" />
          <Button variant="download" size="sm" onClick={handleAddRule} disabled={saving || !targetPath.trim() || !pattern.trim()}>
            Add
          </Button>
        </div>
      </div>

      {error && <div className="text-danger text-[0.8rem]">{error}</div>}
    </div>
  );
}

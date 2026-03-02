import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSettings } from '../../hooks/useSettings';
import { useAppContext } from '../../context';
import ModalShell from './ModalShell';
import Button from '../ui/Button';
import type { Settings } from '../../types';

export default function SettingsModal() {
  const { state, closeModal } = useAppContext();
  const { saveSettings, testLlm, detectConcurrency } = useSettings();
  const [testResult, setTestResult] = useState<{ text: string; color: string } | null>(null);
  const [detectResult, setDetectResult] = useState<{ text: string; color: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const llm = state.settings?.llm;
  const cache = state.settings?.cache;

  const { register, handleSubmit, setValue, getValues } = useForm<Settings>({
    defaultValues: {
      llm: {
        enabled: llm?.enabled ?? false,
        endpoint: llm?.endpoint ?? '',
        apiKey: llm?.apiKey ?? '',
        model: llm?.model ?? '',
        maxTokens: llm?.maxTokens ?? 1024,
        temperature: llm?.temperature ?? 0.1,
        concurrency: llm?.concurrency ?? 2,
      },
      cache: {
        maxAgeHours: cache?.maxAgeHours ?? 24,
        pruneDays: cache?.pruneDays ?? 7,
      },
    },
  });

  const handleSave = handleSubmit(async (data) => {
    setSaveError(null);
    setSaving(true);
    try {
      await saveSettings(data);
      closeModal();
    } catch (err) {
      setSaveError('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  });

  const handleTestConnection = async () => {
    setTestResult({ text: 'Testing...', color: 'text-muted' });
    // Save first so backend has latest config
    try {
      await saveSettings(getValues());
    } catch (err) {
      setTestResult({ text: 'Save failed: ' + (err instanceof Error ? err.message : ''), color: 'text-danger' });
      return;
    }

    try {
      const data = await testLlm();
      if (data.success) {
        setTestResult({ text: 'Connected! Response: ' + data.response, color: 'text-success' });
      } else {
        setTestResult({ text: 'Failed: ' + data.error, color: 'text-danger' });
      }
    } catch (err) {
      setTestResult({ text: 'Error: ' + (err instanceof Error ? err.message : ''), color: 'text-danger' });
    }
  };

  const handleDetectConcurrency = async () => {
    setDetectResult({ text: 'Detecting...', color: 'text-muted' });
    // Save first so backend has latest config
    try {
      await saveSettings(getValues());
    } catch (err) {
      setDetectResult({ text: 'Save failed: ' + (err instanceof Error ? err.message : ''), color: 'text-danger' });
      return;
    }

    try {
      const data = await detectConcurrency();
      if (data.success && data.instances !== undefined) {
        setValue('llm.concurrency', data.instances);
        const label = data.instances === 1 ? 'instance' : 'instances';
        setDetectResult({ text: `Detected ${data.instances} ${label}`, color: 'text-success' });
      } else {
        setDetectResult({ text: data.error || 'Detection failed', color: 'text-danger' });
      }
    } catch (err) {
      setDetectResult({ text: 'Error: ' + (err instanceof Error ? err.message : ''), color: 'text-danger' });
    }
  };

  const fieldClass = "flex-1 bg-bg border border-border text-text px-2.5 py-1.5 rounded text-[0.85rem] font-[inherit] focus:outline-none focus:border-info";

  return (
    <ModalShell onClose={closeModal} maxWidth="550px">
      <h3 className="mb-4 text-text text-lg">Settings</h3>
      <div className="overflow-y-auto flex-1">
        {/* ── Cache Section ──────────────────────────────────────── */}
        <div className="mb-6">
          <h4 className="text-info text-[0.9rem] uppercase tracking-wide mb-3 pb-1.5 border-b border-border">
            Cache
          </h4>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Max Age</label>
            <input type="number" {...register('cache.maxAgeHours', { valueAsNumber: true, min: 1, max: 720 })} min={1} max={720} className={fieldClass} />
            <span className="text-muted text-[0.8rem] shrink-0">hours</span>
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Prune After</label>
            <input type="number" {...register('cache.pruneDays', { valueAsNumber: true, min: 1, max: 90 })} min={1} max={90} className={fieldClass} />
            <span className="text-muted text-[0.8rem] shrink-0">days</span>
          </div>
        </div>

        {/* ── LLM Section ───────────────────────────────────────── */}
        <div>
          <h4 className="text-info text-[0.9rem] uppercase tracking-wide mb-3 pb-1.5 border-b border-border">
            LLM Analysis
          </h4>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Enabled</label>
            <input type="checkbox" {...register('llm.enabled')} className="accent-info" />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Endpoint</label>
            <input type="text" {...register('llm.endpoint')} placeholder="http://localhost:1234/v1" className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">API Key</label>
            <input type="password" {...register('llm.apiKey')} placeholder="Optional" className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Model</label>
            <input type="text" {...register('llm.model')} placeholder="Model name" className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Max Tokens</label>
            <input type="number" {...register('llm.maxTokens', { valueAsNumber: true })} min={64} max={4096} className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Temperature</label>
            <input type="number" {...register('llm.temperature', { valueAsNumber: true })} min={0} max={2} step={0.1} className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Concurrency</label>
            <input type="number" {...register('llm.concurrency', { valueAsNumber: true })} min={1} max={10} className={fieldClass} />
            <Button variant="download" size="sm" onClick={handleDetectConcurrency}>Detect</Button>
            {detectResult && <span className={`text-[0.85rem] ${detectResult.color}`}>{detectResult.text}</span>}
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] shrink-0" />
            <Button variant="download" size="sm" onClick={handleTestConnection}>Test Connection</Button>
            {testResult && <span className={`text-[0.85rem] ${testResult.color}`}>{testResult.text}</span>}
          </div>
        </div>
      </div>
      {saveError && <p className="text-danger text-[0.85rem] mt-2">{saveError}</p>}
      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
        <Button variant="cancel" size="sm" onClick={closeModal} disabled={saving}>Cancel</Button>
        <Button variant="confirm" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </ModalShell>
  );
}

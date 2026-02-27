import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSettings } from '../../hooks/useSettings';
import { useAppContext } from '../../context';
import ModalShell from './ModalShell';
import Button from '../ui/Button';
import type { LlmSettings } from '../../types';

export default function SettingsModal() {
  const { state, closeModal } = useAppContext();
  const { saveSettings, testLlm, detectConcurrency } = useSettings();
  const [testResult, setTestResult] = useState<{ text: string; color: string } | null>(null);
  const [detectResult, setDetectResult] = useState<{ text: string; color: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const llm = state.settings?.llm;

  const { register, handleSubmit, setValue, getValues } = useForm<LlmSettings>({
    defaultValues: {
      enabled: llm?.enabled ?? false,
      endpoint: llm?.endpoint ?? '',
      apiKey: llm?.apiKey ?? '',
      model: llm?.model ?? '',
      maxTokens: llm?.maxTokens ?? 1024,
      temperature: llm?.temperature ?? 0.1,
      concurrency: llm?.concurrency ?? 2,
    },
  });

  const handleSave = handleSubmit(async (data) => {
    setSaveError(null);
    try {
      await saveSettings({ llm: data });
      closeModal();
    } catch (err) {
      setSaveError('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  });

  const handleTestConnection = async () => {
    setTestResult({ text: 'Testing...', color: 'text-muted' });
    // Save first so backend has latest config
    try {
      await saveSettings({ llm: getValues() });
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
    // Save first
    try {
      await saveSettings({ llm: getValues() });
    } catch (err) {
      setDetectResult({ text: 'Save failed: ' + (err instanceof Error ? err.message : ''), color: 'text-danger' });
      return;
    }

    try {
      const data = await detectConcurrency();
      if (data.success && data.instances !== undefined) {
        setValue('concurrency', data.instances);
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
        <div>
          <h4 className="text-info text-[0.9rem] uppercase tracking-wide mb-3 pb-1.5 border-b border-border">
            LLM Analysis
          </h4>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Enabled</label>
            <input type="checkbox" {...register('enabled')} className="accent-info" />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Endpoint</label>
            <input type="text" {...register('endpoint')} placeholder="http://localhost:1234/v1/chat/completions" className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">API Key</label>
            <input type="password" {...register('apiKey')} placeholder="Optional" className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Model</label>
            <input type="text" {...register('model')} placeholder="Model name" className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Max Tokens</label>
            <input type="number" {...register('maxTokens', { valueAsNumber: true })} min={64} max={4096} className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Temperature</label>
            <input type="number" {...register('temperature', { valueAsNumber: true })} min={0} max={2} step={0.1} className={fieldClass} />
          </div>

          <div className="flex items-center gap-3 mb-2.5">
            <label className="min-w-[100px] text-muted text-[0.85rem] shrink-0">Concurrency</label>
            <input type="number" {...register('concurrency', { valueAsNumber: true })} min={1} max={10} className={fieldClass} />
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
        <Button variant="cancel" size="sm" onClick={closeModal}>Cancel</Button>
        <Button variant="confirm" size="sm" onClick={handleSave}>Save</Button>
      </div>
    </ModalShell>
  );
}

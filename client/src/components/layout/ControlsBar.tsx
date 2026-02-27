import { useState } from 'react';
import { useScanStream } from '../../hooks/useScanStream';
import { useAppContext } from '../../context';
import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import NumberInput from '../ui/NumberInput';

export default function ControlsBar() {
  const { state, openModal } = useAppContext();
  const { startScan, cancelScan, scanRunning } = useScanStream();
  const [noCache, setNoCache] = useState(false);
  const [checkChangelogs, setCheckChangelogs] = useState(false);
  const [useLlm, setUseLlm] = useState(false);
  const [limit, setLimit] = useState(0);

  const handleScan = () => {
    startScan({ noCache, checkChangelogs, useLlm: useLlm && state.llmConfigured, limit });
  };

  return (
    <div className="flex items-center gap-6 mb-6 px-6 py-4 bg-surface border border-border rounded-lg flex-wrap">
      <Button onClick={handleScan} disabled={scanRunning}>
        Scan for Updates
      </Button>
      {scanRunning && (
        <Button variant="danger" onClick={cancelScan}>
          Cancel
        </Button>
      )}
      <Checkbox label="No Cache" checked={noCache} onChange={setNoCache} />
      <Checkbox label="Check Changelogs" checked={checkChangelogs} onChange={setCheckChangelogs} />
      <NumberInput label="Limit:" value={limit} onChange={setLimit} min={0} placeholder="0=all" />
      <Checkbox label="LLM Analysis" checked={useLlm} onChange={setUseLlm} disabled={!state.llmConfigured} />
      <Button
        variant="settings"
        size="md"
        className="ml-auto text-lg leading-none px-3 py-1.5"
        onClick={() => openModal({ type: 'settings' })}
      >
        &#9881;
      </Button>
    </div>
  );
}

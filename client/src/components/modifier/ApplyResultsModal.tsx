import { useAppContext } from '../../context';
import ModalShell from '../modals/ModalShell';
import Button from '../ui/Button';
import type { ApplyPresetResult } from '../../types';

interface ApplyResultsModalProps {
  result: ApplyPresetResult;
}

export default function ApplyResultsModal({ result }: ApplyResultsModalProps) {
  const { closeModal } = useAppContext();

  const modSuccessCount = result.mods.filter(m => m.success).length;
  const modFailCount = result.mods.filter(m => !m.success).length;
  const configSuccessCount = result.configs.filter(c => c.success).length;
  const configFailCount = result.configs.filter(c => !c.success).length;

  const hasErrors = result.errors.length > 0;

  return (
    <ModalShell onClose={closeModal} maxWidth="600px">
      <h3 className="mb-1 text-text text-lg">Apply Results</h3>
      <p className="text-muted text-[0.85rem] mb-4">
        Preset <strong>{result.presetName}</strong> applied to <strong>{result.instanceName}</strong>
      </p>

      <div className="overflow-y-auto flex-1">
        {/* Mod results summary */}
        <div className="mb-4">
          <h4 className="text-info text-[0.85rem] uppercase tracking-wide mb-2">Mods</h4>
          <div className="text-[0.85rem]">
            <span className="text-success">{modSuccessCount} copied</span>
            {modFailCount > 0 && <span className="text-danger ml-3">{modFailCount} failed</span>}
          </div>
          {result.mods.filter(m => !m.success).map(m => (
            <div key={m.addonId} className="text-danger text-[0.8rem] mt-1">
              {m.fileName}: {m.error}
            </div>
          ))}
        </div>

        {/* Config results */}
        <div className="mb-4">
          <h4 className="text-info text-[0.85rem] uppercase tracking-wide mb-2">Configs</h4>
          <div className="text-[0.85rem]">
            <span className="text-success">{configSuccessCount} applied</span>
            {configFailCount > 0 && <span className="text-danger ml-3">{configFailCount} failed</span>}
          </div>
          {result.configs.filter(c => c.success).map(c => (
            <div key={c.targetPath} className="text-[0.8rem] text-muted mt-0.5">
              {c.targetPath}: <span className={c.action === 'merged' ? 'text-success' : c.action === 'created' ? 'text-info' : 'text-warning'}>{c.action}</span>
              {c.backedUp && <span className="text-[0.75rem] ml-1">(backed up)</span>}
            </div>
          ))}
          {result.configs.filter(c => !c.success).map(c => (
            <div key={c.targetPath} className="text-danger text-[0.8rem] mt-1">
              {c.targetPath}: {c.error}
            </div>
          ))}
        </div>

        {/* Errors */}
        {hasErrors && (
          <div>
            <h4 className="text-danger text-[0.85rem] uppercase tracking-wide mb-2">Errors</h4>
            {result.errors.map((err, i) => (
              <div key={i} className="text-danger text-[0.8rem]">{err}</div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-border">
        <Button variant="confirm" size="sm" onClick={closeModal}>Close</Button>
      </div>
    </ModalShell>
  );
}

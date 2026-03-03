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
  const kubejsSuccessCount = result.kubejs.filter(k => k.success).length;
  const kubejsFailCount = result.kubejs.filter(k => !k.success).length;
  const rpSuccessCount = result.resourcepacks.filter(r => r.success).length;
  const rpFailCount = result.resourcepacks.filter(r => !r.success).length;
  const disabledMods = result.disabledMods ?? [];
  const disableSuccessCount = disabledMods.filter(d => d.success).length;
  const disableFailCount = disabledMods.filter(d => !d.success).length;
  const fileReplacements = result.fileReplacements ?? [];
  const frSuccessCount = fileReplacements.filter(f => f.success).length;
  const frFailCount = fileReplacements.filter(f => !f.success).length;
  const frTotalMatches = fileReplacements.reduce((sum, f) => sum + f.matchCount, 0);

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

        {/* KubeJS results */}
        {result.kubejs.length > 0 && (
          <div className="mb-4">
            <h4 className="text-info text-[0.85rem] uppercase tracking-wide mb-2">KubeJS</h4>
            <div className="text-[0.85rem]">
              <span className="text-success">{kubejsSuccessCount} copied</span>
              {kubejsFailCount > 0 && <span className="text-danger ml-3">{kubejsFailCount} failed</span>}
            </div>
            {result.kubejs.filter(k => !k.success).map(k => (
              <div key={k.targetPath} className="text-danger text-[0.8rem] mt-1">
                {k.targetPath}: {k.error}
              </div>
            ))}
          </div>
        )}

        {/* Resource Pack results */}
        {result.resourcepacks.length > 0 && (
          <div className="mb-4">
            <h4 className="text-info text-[0.85rem] uppercase tracking-wide mb-2">Resource Packs</h4>
            <div className="text-[0.85rem]">
              <span className="text-success">{rpSuccessCount} copied</span>
              {rpFailCount > 0 && <span className="text-danger ml-3">{rpFailCount} failed</span>}
            </div>
            {result.resourcepacks.filter(r => !r.success).map(r => (
              <div key={r.targetPath} className="text-danger text-[0.8rem] mt-1">
                {r.targetPath}: {r.error}
              </div>
            ))}
          </div>
        )}

        {/* Disabled Mods results */}
        {disabledMods.length > 0 && (
          <div className="mb-4">
            <h4 className="text-info text-[0.85rem] uppercase tracking-wide mb-2">Disabled Mods</h4>
            <div className="text-[0.85rem]">
              <span className="text-success">{disableSuccessCount} disabled</span>
              {disableFailCount > 0 && <span className="text-danger ml-3">{disableFailCount} failed</span>}
            </div>
            {disabledMods.filter(d => !d.success).map(d => (
              <div key={d.fileName} className="text-danger text-[0.8rem] mt-1">
                {d.fileName}: {d.error}
              </div>
            ))}
          </div>
        )}

        {/* File Replacement results */}
        {fileReplacements.length > 0 && (
          <div className="mb-4">
            <h4 className="text-info text-[0.85rem] uppercase tracking-wide mb-2">File Replacements</h4>
            <div className="text-[0.85rem]">
              <span className="text-success">{frSuccessCount} processed ({frTotalMatches} match{frTotalMatches !== 1 ? 'es' : ''})</span>
              {frFailCount > 0 && <span className="text-danger ml-3">{frFailCount} failed</span>}
            </div>
            {fileReplacements.filter(f => f.success).map(f => (
              <div key={f.targetPath} className="text-[0.8rem] text-muted mt-0.5">
                {f.targetPath}: <span className="text-success">{f.matchCount} match{f.matchCount !== 1 ? 'es' : ''}</span>
              </div>
            ))}
            {fileReplacements.filter(f => !f.success).map(f => (
              <div key={f.targetPath} className="text-danger text-[0.8rem] mt-1">
                {f.targetPath}: {f.error}
              </div>
            ))}
          </div>
        )}

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

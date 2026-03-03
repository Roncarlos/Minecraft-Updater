import type { ModalState } from '../../types';
import RefsModal from './RefsModal';
import DepsModal from './DepsModal';
import ChangelogModal from './ChangelogModal';
import ApplyConfirmModal from './ApplyConfirmModal';
import SettingsModal from './SettingsModal';
import ModFilePickerModal from '../modifier/ModFilePickerModal';
import ConfigEditorModal from '../modifier/ConfigEditorModal';
import ApplyResultsModal from '../modifier/ApplyResultsModal';
import PresetPreviewModal from '../modifier/PresetPreviewModal';

interface ModalHostProps {
  modal: ModalState;
}

export default function ModalHost({ modal }: ModalHostProps) {
  switch (modal.type) {
    case 'none':
      return null;
    case 'refs':
      return <RefsModal addonId={modal.addonId} modName={modal.modName} />;
    case 'deps':
      return <DepsModal addonId={modal.addonId} modName={modal.modName} />;
    case 'changelog':
      return <ChangelogModal addonId={modal.addonId} modName={modal.modName} />;
    case 'apply':
      return <ApplyConfirmModal title={modal.title} mods={modal.mods} extraDeps={modal.extraDeps} onConfirm={modal.onConfirm} />;
    case 'settings':
      return <SettingsModal />;
    case 'mod-file-picker':
      return <ModFilePickerModal addonId={modal.addonId} modName={modal.modName} presetId={modal.presetId} mcVersion={modal.mcVersion} loader={modal.loader} onAdded={modal.onAdded} />;
    case 'config-editor':
      return <ConfigEditorModal targetPath={modal.targetPath} content={modal.content} onSave={modal.onSave} />;
    case 'apply-results':
      return <ApplyResultsModal result={modal.result} />;
    case 'preset-preview':
      return <PresetPreviewModal preview={modal.preview} onConfirmApply={modal.onConfirmApply} />;
  }
}

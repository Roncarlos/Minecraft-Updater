import type { ModalState } from '../../types';
import RefsModal from './RefsModal';
import DepsModal from './DepsModal';
import ChangelogModal from './ChangelogModal';
import ApplyConfirmModal from './ApplyConfirmModal';
import SettingsModal from './SettingsModal';

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
  }
}

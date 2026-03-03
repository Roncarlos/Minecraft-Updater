import { useState } from 'react';
import { useConfigs } from '../../hooks/useConfigs';
import { saveConfigContent, openConfigFile } from '../../api/modifier-endpoints';
import { useConfirm } from '../../hooks/useConfirm';
import { useFilteredList } from '../../hooks/useFilteredList';
import { buildTree } from '../../utils/buildTree';
import FileTreeItem from './FileTreeItem';
import FilterInput from '../ui/FilterInput';
import type { PresetConfigEntry, ModalState } from '../../types';

interface ConfigTreeProps {
  presetId: string;
  configs: PresetConfigEntry[];
  onRefresh: () => Promise<void>;
  openModal: (m: ModalState) => void;
}

export default function ConfigTree({ presetId, configs, onRefresh, openModal }: ConfigTreeProps) {
  const { readFile, deleteFile } = useConfigs(presetId);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'open' | 'edit' | 'delete' | null>(null);
  const confirm = useConfirm();
  const { search, setSearch, filtered, showFilter } = useFilteredList(configs, c => [c.targetPath]);

  const handleOpen = async (targetPath: string) => {
    setBusyPath(targetPath);
    setBusyAction('open');
    try {
      await openConfigFile(presetId, targetPath);
    } catch {
      // ignore — file may not have an associated editor
    } finally {
      setBusyPath(null);
      setBusyAction(null);
    }
  };

  const handleEdit = async (targetPath: string) => {
    setBusyPath(targetPath);
    setBusyAction('edit');
    try {
      const content = await readFile(targetPath);
      openModal({
        type: 'config-editor',
        presetId,
        targetPath,
        content,
        onSave: async (newContent: string) => {
          await saveConfigContent(presetId, targetPath, newContent);
          await onRefresh();
        },
      });
    } catch {
      // ignore
    } finally {
      setBusyPath(null);
      setBusyAction(null);
    }
  };

  const handleDelete = async (targetPath: string, isDir = false, fileCount = 0) => {
    const msg = isDir
      ? `Delete folder "${targetPath}" and all its contents (${fileCount} file${fileCount !== 1 ? 's' : ''})? This cannot be undone.`
      : `Delete "${targetPath}"? This cannot be undone.`;
    if (!await confirm(msg, { confirmLabel: 'Delete' })) return;
    setBusyPath(targetPath);
    setBusyAction('delete');
    try {
      await deleteFile(targetPath, onRefresh);
    } finally {
      setBusyPath(null);
      setBusyAction(null);
    }
  };

  if (configs.length === 0) {
    return <div className="text-muted text-[0.8rem] py-2">No config files. Use import or upload above.</div>;
  }

  const tree = buildTree(filtered);

  return (
    <div className="bg-bg rounded-lg p-3 mt-2">
      {showFilter && <FilterInput value={search} onChange={setSearch} placeholder="Filter config files..." />}
      {filtered.length === 0 ? (
        <div className="text-muted text-[0.8rem] py-1">No matches.</div>
      ) : (
        tree.map(node => (
          <FileTreeItem key={node.fullPath} node={node} depth={0} onOpen={handleOpen} onEdit={handleEdit} onDelete={handleDelete} busyPath={busyPath} busyAction={busyAction} />
        ))
      )}
    </div>
  );
}

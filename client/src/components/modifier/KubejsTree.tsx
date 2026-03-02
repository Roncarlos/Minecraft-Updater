import { useState } from 'react';
import { useKubejs } from '../../hooks/useKubejs';
import { saveKubejsContent, openKubejsFile } from '../../api/modifier-endpoints';
import { useConfirm } from '../../hooks/useConfirm';
import { buildTree } from '../../utils/buildTree';
import FileTreeItem from './FileTreeItem';
import type { PresetConfigEntry, ModalState } from '../../types';

interface KubejsTreeProps {
  presetId: string;
  kubejs: PresetConfigEntry[];
  onRefresh: () => Promise<void>;
  openModal: (m: ModalState) => void;
}

export default function KubejsTree({ presetId, kubejs, onRefresh, openModal }: KubejsTreeProps) {
  const { readFile, deleteFile } = useKubejs(presetId);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'open' | 'edit' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const handleOpen = async (targetPath: string) => {
    setBusyPath(targetPath);
    setBusyAction('open');
    setError(null);
    try {
      await openKubejsFile(presetId, targetPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open file');
    } finally {
      setBusyPath(null);
      setBusyAction(null);
    }
  };

  const handleEdit = async (targetPath: string) => {
    setBusyPath(targetPath);
    setBusyAction('edit');
    setError(null);
    try {
      const content = await readFile(targetPath);
      openModal({
        type: 'config-editor',
        presetId,
        targetPath,
        content,
        onSave: async (newContent: string) => {
          await saveKubejsContent(presetId, targetPath, newContent);
          await onRefresh();
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
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
    setError(null);
    try {
      await deleteFile(targetPath, onRefresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setBusyPath(null);
      setBusyAction(null);
    }
  };

  if (kubejs.length === 0) {
    return <div className="text-muted text-[0.8rem] py-2">No KubeJS files. Use import or upload above.</div>;
  }

  const tree = buildTree(kubejs);

  return (
    <div className="bg-bg rounded-lg p-3 mt-2">
      {error && <div className="text-danger text-[0.8rem] mb-2">{error}</div>}
      {tree.map(node => (
        <FileTreeItem key={node.fullPath} node={node} depth={0} onOpen={handleOpen} onEdit={handleEdit} onDelete={handleDelete} busyPath={busyPath} busyAction={busyAction} canEdit />
      ))}
    </div>
  );
}

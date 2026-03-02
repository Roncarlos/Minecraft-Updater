import { useState } from 'react';
import { useKubejs } from '../../hooks/useKubejs';
import { saveKubejsContent, openKubejsFile } from '../../api/modifier-endpoints';
import { useConfirm } from '../../hooks/useConfirm';
import { formatBytes } from '../../utils/format';
import { buildTree, type TreeNode } from '../../utils/buildTree';
import type { PresetConfigEntry, ModalState } from '../../types';

interface KubejsTreeProps {
  presetId: string;
  kubejs: PresetConfigEntry[];
  onRefresh: () => Promise<void>;
  openModal: (m: ModalState) => void;
}

function TreeItem({ node, depth, onOpen, onEdit, onDelete, busyPath, busyAction }: {
  node: TreeNode; depth: number;
  onOpen: (path: string) => void; onEdit: (path: string) => void; onDelete: (path: string) => void;
  busyPath: string | null; busyAction: 'open' | 'edit' | 'delete' | null;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isBusy = busyPath === node.fullPath;
  const canEdit = node.isText !== false;

  if (node.isDir) {
    return (
      <div>
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 py-0.5 cursor-pointer text-[0.83rem] hover:text-text text-muted"
          style={{ paddingLeft: depth * 16 }}
        >
          <span className="text-[0.7rem]">{expanded ? '\u25BC' : '\u25B6'}</span>
          <span>{node.name}/</span>
        </div>
        {expanded && node.children.map(child => (
          <TreeItem key={child.fullPath} node={child} depth={depth + 1} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} busyPath={busyPath} busyAction={busyAction} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 py-0.5 group text-[0.83rem] ${isBusy ? 'opacity-50' : ''}`}
      style={{ paddingLeft: depth * 16 }}
    >
      <span className="text-text">{node.name}</span>
      {node.sizeBytes !== undefined && (
        <span className="text-[0.75rem] text-muted">{formatBytes(node.sizeBytes)}</span>
      )}
      {!canEdit && (
        <span className="text-[0.7rem] text-warning/70">(binary)</span>
      )}
      <div className={`ml-auto flex gap-2 transition-opacity ${isBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {isBusy ? (
          <span className="text-muted text-[0.75rem]">{busyAction === 'delete' ? 'Deleting...' : busyAction === 'open' ? 'Opening...' : 'Loading...'}</span>
        ) : (
          <>
            <button onClick={() => onOpen(node.fullPath)} disabled={!!busyPath} className="text-success text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Open</button>
            {canEdit && (
              <button onClick={() => onEdit(node.fullPath)} disabled={!!busyPath} className="text-info text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Edit</button>
            )}
            <button onClick={() => onDelete(node.fullPath)} disabled={!!busyPath} className="text-danger text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Delete</button>
          </>
        )}
      </div>
    </div>
  );
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

  const handleDelete = async (targetPath: string) => {
    if (!await confirm(`Delete "${targetPath}"? This cannot be undone.`, { confirmLabel: 'Delete' })) return;
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
        <TreeItem key={node.fullPath} node={node} depth={0} onOpen={handleOpen} onEdit={handleEdit} onDelete={handleDelete} busyPath={busyPath} busyAction={busyAction} />
      ))}
    </div>
  );
}

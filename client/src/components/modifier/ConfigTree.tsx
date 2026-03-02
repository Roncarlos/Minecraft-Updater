import { useState } from 'react';
import { useConfigs } from '../../hooks/useConfigs';
import { saveConfigContent, openConfigFile } from '../../api/modifier-endpoints';
import { useConfirm } from '../../hooks/useConfirm';
import { formatBytes } from '../../utils/format';
import { buildTree, type TreeNode } from '../../utils/buildTree';
import type { PresetConfigEntry, ModalState } from '../../types';

interface ConfigTreeProps {
  presetId: string;
  configs: PresetConfigEntry[];
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
      <div className={`ml-auto flex gap-2 transition-opacity ${isBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {isBusy ? (
          <span className="text-muted text-[0.75rem]">{busyAction === 'delete' ? 'Deleting...' : busyAction === 'open' ? 'Opening...' : 'Loading...'}</span>
        ) : (
          <>
            <button onClick={() => onOpen(node.fullPath)} disabled={!!busyPath} className="text-success text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Open</button>
            <button onClick={() => onEdit(node.fullPath)} disabled={!!busyPath} className="text-info text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Edit</button>
            <button onClick={() => onDelete(node.fullPath)} disabled={!!busyPath} className="text-danger text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ConfigTree({ presetId, configs, onRefresh, openModal }: ConfigTreeProps) {
  const { readFile, deleteFile } = useConfigs(presetId);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'open' | 'edit' | 'delete' | null>(null);
  const confirm = useConfirm();

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

  const handleDelete = async (targetPath: string) => {
    if (!await confirm(`Delete "${targetPath}"? This cannot be undone.`, { confirmLabel: 'Delete' })) return;
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

  const tree = buildTree(configs);

  return (
    <div className="bg-bg rounded-lg p-3 mt-2">
      {tree.map(node => (
        <TreeItem key={node.fullPath} node={node} depth={0} onOpen={handleOpen} onEdit={handleEdit} onDelete={handleDelete} busyPath={busyPath} busyAction={busyAction} />
      ))}
    </div>
  );
}

import { useState, type MouseEvent } from 'react';
import { formatBytes } from '../../utils/format';
import { countFiles, type TreeNode } from '../../utils/buildTree';

export interface FileTreeItemProps {
  node: TreeNode;
  depth: number;
  onOpen: (path: string) => void;
  onEdit: (path: string) => void;
  onDelete: (path: string, isDir?: boolean, fileCount?: number) => void;
  busyPath: string | null;
  busyAction: 'open' | 'edit' | 'delete' | null;
  canEdit?: boolean;
}

export default function FileTreeItem({ node, depth, onOpen, onEdit, onDelete, busyPath, busyAction, canEdit = true }: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isBusy = busyPath === node.fullPath;

  if (node.isDir) {
    const fileCount = countFiles(node);
    const handleRowClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      setExpanded(!expanded);
    };

    return (
      <div>
        <div
          onClick={handleRowClick}
          className="flex items-center gap-1.5 py-0.5 cursor-pointer text-[0.83rem] hover:text-text text-muted group"
          style={{ paddingLeft: depth * 16 }}
        >
          <span className="text-[0.7rem]">{expanded ? '\u25BC' : '\u25B6'}</span>
          <span className="flex-1">{node.name}/</span>
          <div className={`flex gap-2 transition-opacity ${isBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            {isBusy ? (
              <span className="text-muted text-[0.75rem]">Deleting...</span>
            ) : (
              <button onClick={() => onDelete(node.fullPath, true, fileCount)} disabled={!!busyPath} className="text-danger text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Delete</button>
            )}
          </div>
        </div>
        {expanded && node.children.map(child => (
          <FileTreeItem key={child.fullPath} node={child} depth={depth + 1} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} busyPath={busyPath} busyAction={busyAction} canEdit={canEdit} />
        ))}
      </div>
    );
  }

  const isEditable = canEdit && node.isText !== false;

  return (
    <div
      className={`flex items-center gap-2 py-0.5 group text-[0.83rem] ${isBusy ? 'opacity-50' : ''}`}
      style={{ paddingLeft: depth * 16 }}
    >
      <span className="text-text">{node.name}</span>
      {node.sizeBytes !== undefined && (
        <span className="text-[0.75rem] text-muted">{formatBytes(node.sizeBytes)}</span>
      )}
      {!isEditable && !node.isDir && (
        <span className="text-[0.7rem] text-warning/70">(binary)</span>
      )}
      <div className={`ml-auto flex gap-2 transition-opacity ${isBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {isBusy ? (
          <span className="text-muted text-[0.75rem]">{busyAction === 'delete' ? 'Deleting...' : busyAction === 'open' ? 'Opening...' : 'Loading...'}</span>
        ) : (
          <>
            <button onClick={() => onOpen(node.fullPath)} disabled={!!busyPath} className="text-success text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Open</button>
            {isEditable && (
              <button onClick={() => onEdit(node.fullPath)} disabled={!!busyPath} className="text-info text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Edit</button>
            )}
            <button onClick={() => onDelete(node.fullPath)} disabled={!!busyPath} className="text-danger text-[0.75rem] cursor-pointer hover:underline disabled:opacity-40 disabled:cursor-default">Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

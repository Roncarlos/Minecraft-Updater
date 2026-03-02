import type { PresetConfigEntry } from '../types';

export interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  children: TreeNode[];
  sizeBytes?: number;
  isText?: boolean;
}

interface InternalNode extends TreeNode {
  childMap: Map<string, InternalNode>;
}

export function countFiles(node: TreeNode): number {
  if (!node.isDir) return 1;
  return node.children.reduce((sum, child) => sum + countFiles(child), 0);
}

export function buildTree(entries: PresetConfigEntry[]): TreeNode[] {
  const root: InternalNode[] = [];
  const rootMap = new Map<string, InternalNode>();

  for (const entry of entries) {
    const parts = entry.targetPath.split('/');
    let current = root;
    let currentMap = rootMap;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      const existing = currentMap.get(name);
      if (existing) {
        current = existing.children as InternalNode[];
        currentMap = existing.childMap;
      } else {
        const newNode: InternalNode = {
          name,
          fullPath,
          isDir: !isLast,
          children: [],
          childMap: new Map(),
          sizeBytes: isLast ? entry.sizeBytes : undefined,
          isText: isLast ? entry.isText : undefined,
        };
        current.push(newNode);
        currentMap.set(name, newNode);
        current = newNode.children as InternalNode[];
        currentMap = newNode.childMap;
      }
    }
  }

  return root;
}

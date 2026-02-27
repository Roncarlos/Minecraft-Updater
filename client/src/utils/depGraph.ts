import type { ScanResults, DependencyGraph, ModItem } from '../types';

const CATEGORIES = ['breaking', 'caution', 'reviewDeps', 'safeToUpdate', 'updates', 'upToDate'] as const;

function iterAllMods(results: ScanResults): ModItem[] {
  const all: ModItem[] = [];
  for (const cat of CATEGORIES) {
    for (const item of results[cat] || []) {
      all.push(item);
    }
  }
  return all;
}

export function buildUpdateLookup(results: ScanResults): Map<number, ModItem> {
  const lookup = new Map<number, ModItem>();
  for (const item of iterAllMods(results)) {
    if (item.hasUpdate) lookup.set(item.addonID, item);
  }
  return lookup;
}

export function buildAllModsLookup(results: ScanResults): Map<number, ModItem> {
  const lookup = new Map<number, ModItem>();
  for (const item of iterAllMods(results)) {
    lookup.set(item.addonID, item);
  }
  return lookup;
}

export function resolveDependencyChain(
  targetIds: number[],
  graph: DependencyGraph,
  updateLookup: Map<number, ModItem>,
): number[] {
  const result = new Set(targetIds);
  const visited = new Set<number>();
  const queue = [...targetIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const node = graph[current];
    if (!node) continue;

    for (const depId of node.deps) {
      if (!result.has(depId) && updateLookup.has(depId)) {
        result.add(depId);
        queue.push(depId);
      }
    }
  }

  return [...result];
}

export function topologicalSort(nodeIds: number[], graph: DependencyGraph): number[] {
  const nodeSet = new Set(nodeIds);
  const inDegree = new Map<number, number>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }

  for (const id of nodeIds) {
    const node = graph[id];
    if (!node) continue;
    for (const depId of node.deps) {
      if (nodeSet.has(depId)) {
        inDegree.set(id, (inDegree.get(id) || 0) + 1);
      }
    }
  }

  const queue: number[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: number[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const node = graph[current];
    if (!node) continue;
    for (const dependentId of node.reverseDeps) {
      if (!nodeSet.has(dependentId)) continue;
      const newDeg = (inDegree.get(dependentId) || 1) - 1;
      inDegree.set(dependentId, newDeg);
      if (newDeg === 0) queue.push(dependentId);
    }
  }

  // Append any remaining (cycles) in original order
  const sortedSet = new Set(sorted);
  for (const id of nodeIds) {
    if (!sortedSet.has(id)) sorted.push(id);
  }

  return sorted;
}

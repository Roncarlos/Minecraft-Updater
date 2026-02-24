/**
 * Dependency graph utilities for mod dependency detection and resolution.
 */

/**
 * Build a dependency graph from scan results.
 * @param {Array} allResults - All scan result objects (must have addonID and dependencies fields)
 * @returns {{ graph: Map<number, { deps: number[], reverseDeps: number[] }>, missingDeps: Array<{ addonId: number, neededBy: number[] }> }}
 */
export function buildDependencyGraph(allResults) {
  const installedIds = new Set(allResults.map(r => r.addonID));
  const graph = new Map();

  // Initialize nodes for every installed mod
  for (const r of allResults) {
    graph.set(r.addonID, { deps: [], reverseDeps: [] });
  }

  // Track deps that aren't installed
  const missingMap = new Map(); // addonId -> Set of neededBy

  for (const r of allResults) {
    const deps = r.dependencies || [];
    for (const depId of deps) {
      if (installedIds.has(depId)) {
        graph.get(r.addonID).deps.push(depId);
        graph.get(depId).reverseDeps.push(r.addonID);
      } else {
        if (!missingMap.has(depId)) missingMap.set(depId, new Set());
        missingMap.get(depId).add(r.addonID);
      }
    }
  }

  const missingDeps = [];
  for (const [addonId, neededBySet] of missingMap) {
    missingDeps.push({ addonId, neededBy: [...neededBySet] });
  }

  return { graph, missingDeps };
}

/**
 * Resolve the full dependency chain for a set of target mods.
 * Walks deps recursively and collects all that also have pending updates.
 * @param {number[]} targetIds - Addon IDs the user wants to update
 * @param {Map} graph - Dependency graph from buildDependencyGraph
 * @param {Map<number, object>} updateLookup - addonID -> scan result for mods with pending updates
 * @returns {number[]} Full set of addon IDs to update (targets + their deps with pending updates)
 */
export function resolveDependencyChain(targetIds, graph, updateLookup) {
  const result = new Set(targetIds);
  const visited = new Set();
  const queue = [...targetIds];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const node = graph.get(current);
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

/**
 * Topological sort using Kahn's algorithm — returns addon IDs in dependency-first order.
 * If cycles are detected, remaining nodes are appended (safe fallback).
 * @param {number[]} nodeIds - Subset of addon IDs to sort
 * @param {Map} graph - Dependency graph from buildDependencyGraph
 * @returns {number[]} Sorted addon IDs
 */
export function topologicalSort(nodeIds, graph) {
  const nodeSet = new Set(nodeIds);
  // Build in-degree map scoped to the subgraph
  const inDegree = new Map();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }

  for (const id of nodeIds) {
    const node = graph.get(id);
    if (!node) continue;
    for (const depId of node.deps) {
      if (nodeSet.has(depId)) {
        inDegree.set(id, (inDegree.get(id) || 0) + 1);
      }
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);

    const node = graph.get(current);
    if (!node) continue;
    // current is a dependency — reduce in-degree of mods that depend on it
    for (const dependentId of node.reverseDeps) {
      if (!nodeSet.has(dependentId)) continue;
      const newDeg = (inDegree.get(dependentId) || 1) - 1;
      inDegree.set(dependentId, newDeg);
      if (newDeg === 0) queue.push(dependentId);
    }
  }

  // Append any remaining nodes (cycle fallback)
  for (const id of nodeIds) {
    if (!sorted.includes(id)) sorted.push(id);
  }

  return sorted;
}

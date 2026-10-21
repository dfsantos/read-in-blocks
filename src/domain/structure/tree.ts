import { deriveReading } from "@/domain/reading/derived";
import type { ReadingState } from "@/domain/reading/status";

import type { NodeKind } from "./hierarchy";

// The book's structure as stored (one row per node, ADR-0009) and as shown (a tree). Built in
// memory per book: a book has hundreds of nodes at most.

export type FlatNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  position: number;
  // US-011: plain text summary and goal in pages, both optional.
  summary: string | null;
  goalPages: number | null;
} & ReadingState;

// A node with children carries its derived reading state (US-014), never the one stored in its row.
export type TreeNode = FlatNode & { children: TreeNode[] };

// Roots and children ordered by position, every node with children holding the reading state
// derived from them, so every screen shows the same one. A node whose parent is not in the list is
// left out: the database cannot hold one (composite foreign key), so it can only come from a
// partial list.
export function buildTree(nodes: readonly FlatNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const node of nodes) byId.set(node.id, { ...node, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      byId.get(node.parentId)?.children.push(node);
    }
  }

  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.position - b.position);
    for (const node of list) {
      sort(node.children);
      // Children first: their own state is already the effective one.
      if (node.children.length > 0) {
        Object.assign(node, deriveReading(node.children));
      }
    }
    return list;
  };
  return sort(roots);
}

// How many nodes go away with `node` (its whole subtree, itself excluded).
export function countDescendants(node: TreeNode): number {
  return node.children.reduce(
    (total, child) => total + 1 + countDescendants(child),
    0,
  );
}

// The nodes from a root down to the node with `id` (itself last), or an empty list when it is not in
// the tree.
export function pathTo(roots: readonly TreeNode[], id: string): TreeNode[] {
  for (const node of roots) {
    if (node.id === id) return [node];
    const below = pathTo(node.children, id);
    if (below.length > 0) return [node, ...below];
  }
  return [];
}

import { canPlace } from "./hierarchy";
import type { TreeNode } from "./tree";

// Reordering and moving nodes (US-012, ADR-0009). Pure planning: which ids end up in which order;
// the repository writes the positions in one transaction.

export type MovePlan = {
  // Final order of the node's old siblings (without it), or of its group when it stays in it.
  source: string[];
  // Final order of the new siblings (with it); empty when the node stays in its group.
  target: string[];
};

// Places `nodeId` at `index` (clamped) among `targetIds`, taking it out of `sourceIds`. With
// `targetIds` null the node stays among its siblings and is only reordered. `index` counts the
// siblings without the node, so dropping a node on a sibling puts it where that sibling was.
export function planMove(
  sourceIds: readonly string[],
  targetIds: readonly string[] | null,
  nodeId: string,
  index: number,
): MovePlan {
  const source = sourceIds.filter((id) => id !== nodeId);
  const group =
    targetIds === null ? source : targetIds.filter((id) => id !== nodeId);
  const at = Math.min(Math.max(Math.trunc(index), 0), group.length);
  const placed = [...group.slice(0, at), nodeId, ...group.slice(at)];
  return targetIds === null
    ? { source: placed, target: [] }
    : { source, target: placed };
}

export type MoveTarget = {
  // null: the book's root.
  parentId: string | null;
  title: string | null;
};

// Where a node may go, besides its current parent: the root and every part for a chapter (D-06),
// every chapter for a topic. A part only reorders at the root. The kinds alone rule out cycles: a
// chapter's descendants are topics and a topic has none, so a node never lands in its own subtree.
export function moveTargets(
  roots: readonly TreeNode[],
  node: Pick<TreeNode, "id" | "kind" | "parentId">,
): MoveTarget[] {
  const targets: MoveTarget[] = [];
  if (canPlace(node.kind, null) && node.parentId !== null) {
    targets.push({ parentId: null, title: null });
  }
  const visit = (nodes: readonly TreeNode[]) => {
    for (const candidate of nodes) {
      if (
        candidate.id !== node.id &&
        candidate.id !== node.parentId &&
        canPlace(node.kind, candidate.kind)
      ) {
        targets.push({ parentId: candidate.id, title: candidate.title });
      }
      visit(candidate.children);
    }
  };
  visit(roots);
  return targets;
}

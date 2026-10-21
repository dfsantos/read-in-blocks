import type { ReadingStatus } from "@/domain/reading/status";
import type { NodeKind } from "@/domain/structure/hierarchy";

import { effectiveWeights, weightShares } from "./weight";

// Weighted progress of a book (US-016, ADR-0009, RF-008, PRD §6.2). Only completed leaves count
// (D-03): a leaf is 1 when completed and 0 otherwise, "in progress" included. A node with children
// is the average of its children weighted by their goals in pages (effective weights, D-16), and
// the book is the same average over its roots. Pure: the tree comes in, numbers come out.

// A node of the tree, as far as progress is concerned. A parent's own status is ignored.
export type ProgressNode = {
  id: string;
  status: ReadingStatus;
  goalPages: number | null;
  children: readonly ProgressNode[];
};

export type Progress = {
  // The whole book, from 0 to 1.
  overall: number;
  // Every node's own progress, from 0 to 1.
  byNode: ReadonlyMap<string, number>;
  // How many nodes take the default weight in a group of two or more siblings: there, the missing
  // goal changes the result, and the reader is told so. A node alone in its group weighs 100%
  // whatever its goal.
  defaultWeighted: number;
};

export function computeProgress(roots: readonly ProgressNode[]): Progress {
  const byNode = new Map<string, number>();
  let defaultWeighted = 0;

  const average = (siblings: readonly ProgressNode[]): number => {
    if (siblings.length === 0) return 0;
    if (siblings.length > 1) {
      defaultWeighted += effectiveWeights(siblings).filter(
        (weight) => weight.isDefault,
      ).length;
    }
    const shares = weightShares(siblings);
    return siblings.reduce(
      (total, node, index) => total + shares[index] * visit(node),
      0,
    );
  };

  const visit = (node: ProgressNode): number => {
    const progress =
      node.children.length === 0
        ? node.status === "completed"
          ? 1
          : 0
        : average(node.children);
    byNode.set(node.id, progress);
    return progress;
  };

  const overall = average(roots);
  return { overall, byNode, defaultWeighted };
}

// A share from 0 to 1 as a whole percent, rounded down: a book is only shown at 100% when it is
// complete. The epsilon absorbs float noise (0.29 * 100 is 28.999…).
export function wholePercent(share: number): number {
  return Math.min(100, Math.max(0, Math.floor(share * 100 + 1e-9)));
}

// A node with its kind, for the chapter count.
export type KindNode = {
  kind: NodeKind;
  status: ReadingStatus;
  children: readonly KindNode[];
};

// The simple count next to the weighted percentage: how many chapters there are and how many are
// completed (a chapter's status is the derived one when it has topics, US-014).
export function countChapters(roots: readonly KindNode[]): {
  completed: number;
  total: number;
} {
  let completed = 0;
  let total = 0;
  const walk = (nodes: readonly KindNode[]) => {
    for (const node of nodes) {
      if (node.kind === "chapter") {
        total += 1;
        if (node.status === "completed") completed += 1;
      } else {
        walk(node.children);
      }
    }
  };
  walk(roots);
  return { completed, total };
}

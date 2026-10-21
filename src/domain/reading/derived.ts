import { NOT_STARTED, type ReadingState } from "./status";

// Reading state of a node with children (US-014, ADR-0009, D-07): always derived from its children,
// never stored or read from its own row. A node without children is a leaf and keeps its stored
// state (US-013).

// A node of a tree, as far as the derivation is concerned.
export type ReadingNode = ReadingState & {
  id: string;
  children: readonly ReadingNode[];
};

// The state of a parent from the (already effective) states of its children:
// - completed only when every child is completed, completed on the latest child completion;
// - in progress when at least one child is started or completed;
// - not started otherwise.
// It starts on the earliest child start. Dates are "YYYY-MM-DD", so they compare as strings.
export function deriveReading(children: readonly ReadingState[]): ReadingState {
  if (children.length === 0) return NOT_STARTED;
  const started = children
    .map((child) => child.startedAt)
    .filter((day): day is string => day !== null);
  if (started.length === 0) return NOT_STARTED;
  const startedAt = started.reduce((min, day) => (day < min ? day : min));

  if (children.every((child) => child.status === "completed")) {
    // Every completed child has a completion date (CHECK book_node_reading_dates).
    const completedAt = children
      .map((child) => child.completedAt ?? startedAt)
      .reduce((max, day) => (day > max ? day : max));
    return { status: "completed", startedAt, completedAt };
  }
  return { status: "in_progress", startedAt, completedAt: null };
}

// The node's effective state: its stored one when it is a leaf, derived from its children
// (recursively) otherwise.
export function resolveReading(node: ReadingNode): ReadingState {
  if (node.children.length === 0) {
    return {
      status: node.status,
      startedAt: node.startedAt,
      completedAt: node.completedAt,
    };
  }
  return deriveReading(node.children.map(resolveReading));
}

// The leaves under `node` that "complete all" changes: every leaf descendant not yet completed, in
// tree order. Empty for a leaf (it has its own control) and when everything is already completed.
export function leavesToComplete(node: ReadingNode): string[] {
  return node.children.flatMap((child) =>
    child.children.length === 0
      ? child.status === "completed"
        ? []
        : [child.id]
      : leavesToComplete(child),
  );
}

export type LeafCount = { completed: number; total: number };

// How many leaves under `node` there are and how many are completed: the simple progress of a
// section in the table of contents (US-015). A leaf counts itself.
export function countLeaves(node: ReadingNode): LeafCount {
  if (node.children.length === 0) {
    return { completed: node.status === "completed" ? 1 : 0, total: 1 };
  }
  return node.children.reduce<LeafCount>(
    (sum, child) => {
      const count = countLeaves(child);
      return {
        completed: sum.completed + count.completed,
        total: sum.total + count.total,
      };
    },
    { completed: 0, total: 0 },
  );
}

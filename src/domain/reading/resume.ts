import type { ReadingStatus } from "@/domain/reading/status";

// Where to pick a book back up (US-021, RF-009): walking the leaves in reading order (the order of
// the table of contents), the first one in progress; with none, the first one not started. A book
// whose leaves are all completed is done; a book without structure has nowhere to resume. Pure.

export type ResumeNode = {
  id: string;
  status: ReadingStatus;
  children: readonly ResumeNode[];
};

export type ResumePoint<Node extends ResumeNode> =
  | { kind: "empty" }
  | { kind: "completed" }
  | { kind: "resume"; node: Node; started: boolean };

// The leaves in reading order: a parent's children come right after it, before its next sibling.
function* leaves<Node extends ResumeNode>(
  nodes: readonly Node[],
): Generator<Node> {
  for (const node of nodes) {
    if (node.children.length === 0) yield node;
    else yield* leaves(node.children as readonly Node[]);
  }
}

export function resumePoint<Node extends ResumeNode>(
  roots: readonly Node[],
): ResumePoint<Node> {
  let firstNotStarted: Node | undefined;
  let any = false;
  for (const leaf of leaves(roots)) {
    any = true;
    if (leaf.status === "in_progress") {
      return { kind: "resume", node: leaf, started: true };
    }
    if (leaf.status === "not_started") firstNotStarted ??= leaf;
  }
  if (!any) return { kind: "empty" };
  return firstNotStarted
    ? { kind: "resume", node: firstNotStarted, started: false }
    : { kind: "completed" };
}

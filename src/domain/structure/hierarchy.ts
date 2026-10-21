// The shape of a book's structure (US-010, ADR-0009, D-06): part → chapter → topic, three levels at
// most. Parts are optional: chapters may sit at the book's root, next to parts (a preface before
// Part I, for instance). Topics only live inside chapters.

export const NODE_KINDS = ["part", "chapter", "topic"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

// null stands for the book's root.
const CHILD_KINDS: Record<NodeKind | "root", readonly NodeKind[]> = {
  root: ["part", "chapter"],
  part: ["chapter"],
  chapter: ["topic"],
  topic: [],
};

// The kinds a node may have under `parentKind` (null: the book's root), in the order the UI offers
// them.
export function allowedChildKinds(
  parentKind: NodeKind | null,
): readonly NodeKind[] {
  return CHILD_KINDS[parentKind ?? "root"];
}

// Whether a node of `kind` may sit under `parentKind` (null: the book's root).
export function canPlace(kind: NodeKind, parentKind: NodeKind | null): boolean {
  return allowedChildKinds(parentKind).includes(kind);
}

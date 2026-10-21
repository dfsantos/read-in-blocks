import type { NodeKind } from "@/domain/structure/hierarchy";

// Note density (US-024, RF-014): where the reader wrote the most. A chapter counts its own notes and
// its topics'; its level compares it with the book's most noted chapter. Pure.

export type DensityNode = {
  id: string;
  kind: NodeKind;
  children: readonly DensityNode[];
};

// 0: no notes; 1 to 3: up to a third, two thirds or more of the most noted chapter's notes.
export const DENSITY_LEVELS = [0, 1, 2, 3] as const;
export type DensityLevel = (typeof DENSITY_LEVELS)[number];

export type ChapterNotes<Node extends DensityNode> = {
  chapter: Node;
  notes: number;
  level: DensityLevel;
};

const subtreeNotes = (
  node: DensityNode,
  counts: Readonly<Record<string, number>>,
): number =>
  (counts[node.id] ?? 0) +
  node.children.reduce(
    (total, child) => total + subtreeNotes(child, counts),
    0,
  );

function chapters<Node extends DensityNode>(nodes: readonly Node[]): Node[] {
  return nodes.flatMap((node) =>
    node.kind === "chapter"
      ? [node]
      : chapters(node.children as readonly Node[]),
  );
}

// Every chapter of the book in reading order, with its notes (its topics' included) and its level.
export function chapterDensity<Node extends DensityNode>(
  roots: readonly Node[],
  counts: Readonly<Record<string, number>>,
): ChapterNotes<Node>[] {
  const totals = chapters(roots).map((chapter) => ({
    chapter,
    notes: subtreeNotes(chapter, counts),
  }));
  const most = Math.max(0, ...totals.map((entry) => entry.notes));
  return totals.map(({ chapter, notes }) => ({
    chapter,
    notes,
    level:
      notes === 0
        ? 0
        : (Math.min(3, Math.ceil((notes / most) * 3)) as DensityLevel),
  }));
}

// The `limit` chapters with the most notes, most first; ties keep reading order. Chapters without
// notes are left out.
export function mostNoted<Node extends DensityNode>(
  density: readonly ChapterNotes<Node>[],
  limit: number,
): ChapterNotes<Node>[] {
  return density
    .filter((entry) => entry.notes > 0)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.notes - a.entry.notes || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

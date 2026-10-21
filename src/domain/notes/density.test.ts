import { describe, expect, it } from "vitest";

import { chapterDensity, mostNoted, type DensityNode } from "./density";

const node = (
  id: string,
  kind: DensityNode["kind"],
  children: DensityNode[] = [],
): DensityNode => ({ id, kind, children });

// Prefácio, Parte I (Um (1.1, 1.2), Dois), Parte II (Três), Epílogo
const TREE = [
  node("pre", "chapter"),
  node("p1", "part", [
    node("c1", "chapter", [node("t1", "topic"), node("t2", "topic")]),
    node("c2", "chapter"),
  ]),
  node("p2", "part", [node("c3", "chapter")]),
  node("epi", "chapter"),
];

const summary = (counts: Record<string, number>) =>
  chapterDensity(TREE, counts).map(({ chapter, notes, level }) => [
    chapter.id,
    notes,
    level,
  ]);

describe("chapterDensity", () => {
  it.each<[string, Record<string, number>, [string, number, number][]]>([
    [
      "no notes at all",
      {},
      [
        ["pre", 0, 0],
        ["c1", 0, 0],
        ["c2", 0, 0],
        ["c3", 0, 0],
        ["epi", 0, 0],
      ],
    ],
    [
      "a chapter counts its topics' notes; a part's own notes count for no chapter",
      { c1: 1, t1: 2, t2: 3, p1: 9, c2: 3, c3: 1 },
      [
        ["pre", 0, 0],
        ["c1", 6, 3],
        ["c2", 3, 2],
        ["c3", 1, 1],
        ["epi", 0, 0],
      ],
    ],
    [
      "levels by thirds of the most noted chapter",
      { pre: 9, c1: 7, c2: 4, c3: 3, epi: 1 },
      [
        ["pre", 9, 3],
        ["c1", 7, 3],
        ["c2", 4, 2],
        ["c3", 3, 1],
        ["epi", 1, 1],
      ],
    ],
    [
      "one note anywhere is the most",
      { epi: 1 },
      [
        ["pre", 0, 0],
        ["c1", 0, 0],
        ["c2", 0, 0],
        ["c3", 0, 0],
        ["epi", 1, 3],
      ],
    ],
  ])("%s", (_name, counts, expected) => {
    expect(summary(counts)).toEqual(expected);
  });

  it("finds nothing in a book without chapters", () => {
    expect(chapterDensity([node("p", "part")], { p: 3 })).toEqual([]);
  });
});

describe("mostNoted", () => {
  it.each<[string, Record<string, number>, number, string[]]>([
    ["nothing noted", {}, 5, []],
    [
      "most first, ties in reading order, chapters without notes left out",
      { pre: 2, t1: 1, c2: 5, epi: 2 },
      5,
      ["c2", "pre", "epi", "c1"],
    ],
    ["at most the limit", { pre: 2, c1: 3, c2: 5, epi: 2 }, 2, ["c2", "c1"]],
  ])("%s", (_name, counts, limit, expected) => {
    expect(
      mostNoted(chapterDensity(TREE, counts), limit).map(
        (entry) => entry.chapter.id,
      ),
    ).toEqual(expected);
  });
});

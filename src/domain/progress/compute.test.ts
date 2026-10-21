import { describe, expect, it } from "vitest";

import type { ReadingStatus } from "@/domain/reading/status";

import {
  computeProgress,
  countChapters,
  wholePercent,
  type KindNode,
  type ProgressNode,
} from "./compute";

let ids = 0;
const leaf = (
  status: ReadingStatus,
  goalPages: number | null = null,
  id = `leaf-${++ids}`,
): ProgressNode => ({ id, status, goalPages, children: [] });
const parent = (
  children: ProgressNode[],
  goalPages: number | null = null,
  id = `parent-${++ids}`,
): ProgressNode => ({
  id,
  // A parent's status never counts: only its leaves do.
  status: "completed",
  goalPages,
  children,
});

const done = (goal: number | null = null) => leaf("completed", goal);
const reading = (goal: number | null = null) => leaf("in_progress", goal);
const todo = (goal: number | null = null) => leaf("not_started", goal);

describe("computeProgress", () => {
  it.each<[string, ProgressNode[], number]>([
    ["nothing in an empty book", [], 0],
    ["a completed leaf is 100%", [done()], 1],
    // D-03: only completed leaves count.
    ["a leaf in progress counts as 0%", [reading()], 0],
    ["a leaf not started counts as 0%", [todo()], 0],
    [
      "siblings without goals weigh the same",
      [done(), todo(), todo(), done()],
      0.5,
    ],
    ["goals weigh siblings", [done(30), todo(10)], 0.75],
    // PRD §6.2: completing a part that is 40% of the book moves the book 40%.
    [
      "completing a part of 40% moves the book 40% (PRD example)",
      [parent([done(), done()], 40), parent([todo(), todo()], 60)],
      0.4,
    ],
    [
      "a part's progress is its children's, weighted",
      [parent([done(10), todo(30)], 50), parent([done(), done()], 50)],
      0.125 + 0.5,
    ],
    [
      "three levels: part, chapter, topic",
      [
        parent(
          [parent([done(), done(), todo(), todo()], 20), parent([done()], 20)],
          100,
        ),
      ],
      0.25 + 0.5,
    ],
    [
      "a node without goal takes the mean of its measured siblings (D-16)",
      [done(10), todo(30), done()],
      (10 + 20) / 60,
    ],
    [
      "in progress never counts, at any depth",
      [parent([reading(), reading()], 50), parent([done()], 50)],
      0.5,
    ],
  ])("%s", (_, roots, expected) => {
    expect(computeProgress(roots).overall).toBeCloseTo(expected, 10);
  });

  it("gives every node its own progress", () => {
    const chapter = parent([done(), todo()], null, "chapter");
    const part = parent([chapter, done()], null, "part");
    const { byNode } = computeProgress([
      part,
      leaf("not_started", null, "loose"),
    ]);

    expect(byNode.get("chapter")).toBeCloseTo(0.5);
    expect(byNode.get("part")).toBeCloseTo(0.75);
    expect(byNode.get("loose")).toBe(0);
  });

  it.each<[string, ProgressNode[], number]>([
    ["no group without goals in an all-measured book", [done(10), todo(20)], 0],
    // Every node weighs the same: no goal changes the result.
    ["a single node without goal", [done()], 0],
    ["a node without goal among measured siblings", [done(10), todo()], 1],
    [
      "every node of a group without goal",
      [parent([done(), todo()], 10), parent([todo()], 10)],
      2,
    ],
    [
      "only nodes whose weight counts: a node alone in its group never does",
      [parent([todo()], 10), parent([done()], 30)],
      0,
    ],
  ])(
    "counts the nodes whose default weight affects the result: %s",
    (_, roots, expected) => {
      expect(computeProgress(roots).defaultWeighted).toBe(expected);
    },
  );
});

describe("wholePercent", () => {
  it.each<[number, number]>([
    [0, 0],
    [0.29, 29],
    [0.999, 99],
    [1, 100],
    [0.4, 40],
    [1 / 3, 33],
    [-0.1, 0],
    [1.2, 100],
  ])("%s is %s%%", (share, expected) => {
    expect(wholePercent(share)).toBe(expected);
  });
});

describe("countChapters", () => {
  const k = (
    kind: KindNode["kind"],
    status: ReadingStatus,
    ...children: KindNode[]
  ): KindNode => ({ kind, status, children });

  it.each<[string, KindNode[], { completed: number; total: number }]>([
    ["no chapters in an empty book", [], { completed: 0, total: 0 }],
    [
      "chapters at the root and inside parts, never parts or topics",
      [
        k("chapter", "completed"),
        k(
          "part",
          "in_progress",
          k("chapter", "completed", k("topic", "completed")),
          k(
            "chapter",
            "in_progress",
            k("topic", "completed"),
            k("topic", "not_started"),
          ),
        ),
        k("part", "not_started"),
      ],
      { completed: 2, total: 3 },
    ],
  ])("%s", (_, roots, expected) => {
    expect(countChapters(roots)).toEqual(expected);
  });
});

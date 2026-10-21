import { describe, expect, it } from "vitest";

import type { ReadingStatus } from "./status";
import { resumePoint, type ResumeNode } from "./resume";

const leaf = (
  id: string,
  status: ReadingStatus = "not_started",
): ResumeNode => ({
  id,
  status,
  children: [],
});
// A parent's own status is ignored: here it always says something misleading.
const parent = (id: string, children: ResumeNode[]): ResumeNode => ({
  id,
  status: "completed",
  children,
});

describe("resumePoint", () => {
  it.each<[string, ResumeNode[], ReturnType<typeof resumePoint>]>([
    ["a book without structure", [], { kind: "empty" }],
    [
      "a book with every leaf completed",
      [leaf("a", "completed"), parent("p", [leaf("b", "completed")])],
      { kind: "completed" },
    ],
    [
      "nothing started: the first leaf",
      [leaf("a"), leaf("b")],
      { kind: "resume", node: leaf("a"), started: false },
    ],
    [
      "the first leaf in progress, even after a not started one",
      [leaf("a"), leaf("b", "in_progress"), leaf("c", "in_progress")],
      { kind: "resume", node: leaf("b", "in_progress"), started: true },
    ],
    [
      "the first not started leaf after the completed ones",
      [leaf("a", "completed"), leaf("b"), leaf("c")],
      { kind: "resume", node: leaf("b"), started: false },
    ],
    [
      "leaves in reading order: a part's topics before the next root",
      [
        parent("p1", [
          parent("c1", [leaf("t1", "completed"), leaf("t2")]),
          leaf("c2"),
        ]),
        leaf("c3", "in_progress"),
      ],
      { kind: "resume", node: leaf("c3", "in_progress"), started: true },
    ],
    [
      "a topic in progress deep in a part",
      [
        leaf("pre", "completed"),
        parent("p1", [parent("c1", [leaf("t1", "in_progress")])]),
      ],
      { kind: "resume", node: leaf("t1", "in_progress"), started: true },
    ],
  ])("%s", (_name, roots, expected) => {
    expect(resumePoint(roots)).toEqual(expected);
  });
});

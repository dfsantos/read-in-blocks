import { describe, expect, it } from "vitest";

import {
  deriveReading,
  leavesToComplete,
  resolveReading,
  type ReadingNode,
} from "./derived";
import { NOT_STARTED, type ReadingState, type ReadingStatus } from "./status";

const state = (
  status: ReadingStatus,
  startedAt: string | null = null,
  completedAt: string | null = null,
): ReadingState => ({ status, startedAt, completedAt });

const notStarted = state("not_started");
const reading = (start: string) => state("in_progress", start);
const done = (start: string, end: string) => state("completed", start, end);

let ids = 0;
// A leaf with its stored state.
const leaf = (stored: ReadingState, id = `leaf-${++ids}`): ReadingNode => ({
  id,
  ...stored,
  children: [],
});
// A parent: what its row stores is ignored, so it always stores something misleading here.
const parent = (
  children: ReadingNode[],
  id = `parent-${++ids}`,
): ReadingNode => ({
  id,
  ...done("1999-01-01", "1999-01-02"),
  children,
});

describe("deriveReading", () => {
  it.each<[string, ReadingState[], ReadingState]>([
    ["no children", [], NOT_STARTED],
    ["one child not started", [notStarted], NOT_STARTED],
    ["every child not started", [notStarted, notStarted], NOT_STARTED],
    [
      "one child in progress",
      [notStarted, reading("2026-10-03")],
      reading("2026-10-03"),
    ],
    [
      "one child completed and another not started",
      [done("2026-10-01", "2026-10-02"), notStarted],
      reading("2026-10-01"),
    ],
    [
      "one child completed and another in progress",
      [done("2026-10-05", "2026-10-06"), reading("2026-10-02")],
      reading("2026-10-02"),
    ],
    [
      "every child completed: earliest start, latest completion",
      [done("2026-10-04", "2026-10-09"), done("2026-10-01", "2026-10-07")],
      done("2026-10-01", "2026-10-09"),
    ],
    [
      "a single completed child",
      [done("2026-10-01", "2026-10-01")],
      done("2026-10-01", "2026-10-01"),
    ],
    [
      "dates across years compare as days",
      [done("2025-12-31", "2026-01-02"), done("2026-01-01", "2026-01-01")],
      done("2025-12-31", "2026-01-02"),
    ],
  ])("%s", (_, children, expected) => {
    expect(deriveReading(children)).toEqual(expected);
  });
});

describe("resolveReading", () => {
  it.each<[string, ReadingNode, ReadingState]>([
    // 1 level: a leaf, including a parent that lost its children.
    [
      "a leaf keeps its stored state",
      leaf(reading("2026-10-03")),
      reading("2026-10-03"),
    ],
    [
      "a node without children is a leaf, whatever its kind",
      { id: "chapter", ...done("2026-10-01", "2026-10-02"), children: [] },
      done("2026-10-01", "2026-10-02"),
    ],
    // 2 levels.
    [
      "a chapter whose topics are all completed",
      parent([
        leaf(done("2026-10-01", "2026-10-02")),
        leaf(done("2026-10-02", "2026-10-04")),
      ]),
      done("2026-10-01", "2026-10-04"),
    ],
    [
      "a chapter with one topic left ignores its own stored state",
      parent([leaf(done("2026-10-01", "2026-10-02")), leaf(notStarted)]),
      reading("2026-10-01"),
    ],
    [
      "a chapter whose topics are not started",
      parent([leaf(notStarted), leaf(notStarted)]),
      NOT_STARTED,
    ],
    // 3 levels.
    [
      "a part whose chapters are completed through their topics",
      parent([
        parent([
          leaf(done("2026-09-10", "2026-09-12")),
          leaf(done("2026-09-11", "2026-09-20")),
        ]),
        leaf(done("2026-09-21", "2026-09-25")),
      ]),
      done("2026-09-10", "2026-09-25"),
    ],
    [
      "a part is in progress when a topic deep down is started",
      parent([
        parent([leaf(notStarted), leaf(reading("2026-10-07"))]),
        leaf(notStarted),
      ]),
      reading("2026-10-07"),
    ],
    [
      "a part is not completed while a chapter has a topic left",
      parent([
        parent([leaf(done("2026-10-01", "2026-10-02")), leaf(notStarted)]),
        leaf(done("2026-09-01", "2026-09-30")),
      ]),
      reading("2026-09-01"),
    ],
    [
      "a part whose chapters are all not started",
      parent([parent([leaf(notStarted)]), leaf(notStarted)]),
      NOT_STARTED,
    ],
  ])("%s", (_, node, expected) => {
    expect(resolveReading(node)).toEqual(expected);
  });
});

describe("leavesToComplete", () => {
  it.each<[string, ReadingNode, string[]]>([
    ["nothing under a leaf", leaf(notStarted, "a"), []],
    [
      "every topic not yet completed, in order",
      parent([
        leaf(notStarted, "t1"),
        leaf(done("2026-10-01", "2026-10-01"), "t2"),
        leaf(reading("2026-10-02"), "t3"),
      ]),
      ["t1", "t3"],
    ],
    [
      "leaves at every depth of a part, never a parent",
      parent([
        parent([leaf(notStarted, "t1"), leaf(notStarted, "t2")], "c1"),
        leaf(reading("2026-10-02"), "c2"),
      ]),
      ["t1", "t2", "c2"],
    ],
    [
      "nothing when everything is completed",
      parent([parent([leaf(done("2026-10-01", "2026-10-01"), "t1")], "c1")]),
      [],
    ],
  ])("%s", (_, node, expected) => {
    expect(leavesToComplete(node)).toEqual(expected);
  });
});

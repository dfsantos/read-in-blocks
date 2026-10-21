import { describe, expect, it } from "vitest";

import type { ReadingStatus } from "@/domain/reading/status";

import { readingPace, type Pace, type PaceNode } from "./pace";

const TODAY = "2026-10-21";

const leaf = (
  status: ReadingStatus,
  completedAt: string | null = null,
  goalPages: number | null = null,
): PaceNode => ({ status, completedAt, goalPages, children: [] });
const done = (day: string, goalPages: number | null = null) =>
  leaf("completed", day, goalPages);
const todo = (goalPages: number | null = null) =>
  leaf("not_started", null, goalPages);
const part = (children: PaceNode[], goalPages: number | null = null) => ({
  status: "not_started" as const,
  completedAt: null,
  goalPages,
  children,
});

describe("readingPace", () => {
  it.each<[string, PaceNode[], Pace]>([
    ["a book without structure", [], { kind: "empty" }],
    [
      "a finished book",
      [done("2026-10-01"), done("2026-10-20")],
      { kind: "completed" },
    ],
    [
      "nothing completed yet",
      [todo(), todo()],
      { kind: "insufficient", completions: 0, days: 0 },
    ],
    [
      "a single completion",
      [done("2026-10-01"), todo(), todo()],
      { kind: "insufficient", completions: 1, days: 21 },
    ],
    [
      "two completions within less than a week of the first",
      [done("2026-10-16"), done("2026-10-20"), todo()],
      { kind: "insufficient", completions: 2, days: 6 },
    ],
    [
      "completions older than the window do not count for the pace",
      [done("2026-08-01"), done("2026-09-01"), done("2026-10-20"), todo()],
      { kind: "insufficient", completions: 1, days: 28 },
    ],
    [
      // 4 equal leaves; 2 done over 7 days: 2/4 a week; 2/4 left at 1/14 a day: 7 days.
      "equal chapters, one week",
      [done("2026-10-15"), done("2026-10-21"), todo(), todo()],
      {
        kind: "forecast",
        sharePerWeek: 0.5,
        leavesPerWeek: 2,
        completions: 2,
        days: 7,
        finishOn: "2026-10-28",
      },
    ],
    [
      // Weighted (RF-008): 10 + 30 of 100 pages done over 28 days; 60 left at 40/28 a day = 42 days.
      "weighted by goals, over the whole window",
      [
        done("2026-09-24", 10),
        done("2026-10-10", 30),
        done("2026-09-01", 1),
        todo(59),
      ],
      {
        kind: "forecast",
        sharePerWeek: 0.1,
        leavesPerWeek: 0.5,
        completions: 2,
        days: 28,
        finishOn: "2026-12-02",
      },
    ],
    [
      // The PRD example: a part worth 40% done counts 40% of the book.
      "a part's share flows down to its leaves",
      [
        part([done("2026-10-08"), done("2026-10-14")], 40),
        part([todo(), todo()], 60),
      ],
      {
        kind: "forecast",
        sharePerWeek: 0.2,
        leavesPerWeek: 1,
        completions: 2,
        days: 14,
        finishOn: "2026-11-11",
      },
    ],
  ])("%s", (_name, roots, expected) => {
    const pace = readingPace(roots, TODAY);
    if (expected.kind === "forecast" && pace.kind === "forecast") {
      expect(pace.sharePerWeek).toBeCloseTo(expected.sharePerWeek, 9);
      expect(pace.leavesPerWeek).toBeCloseTo(expected.leavesPerWeek, 9);
      expect({ ...pace, sharePerWeek: 0, leavesPerWeek: 0 }).toEqual({
        ...expected,
        sharePerWeek: 0,
        leavesPerWeek: 0,
      });
    } else {
      expect(pace).toEqual(expected);
    }
  });

  it("ignores completions dated after today", () => {
    expect(
      readingPace([done("2026-10-10"), done("2026-10-30"), todo()], TODAY),
    ).toEqual({ kind: "insufficient", completions: 1, days: 12 });
  });

  it("counts an in-progress leaf as remaining work", () => {
    const pace = readingPace(
      [done("2026-10-15"), done("2026-10-21"), leaf("in_progress"), todo()],
      TODAY,
    );
    expect(pace).toMatchObject({ kind: "forecast", finishOn: "2026-10-28" });
  });
});

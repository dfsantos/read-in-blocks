import type { ReadingStatus } from "@/domain/reading/status";

import { weightShares } from "./weight";

// Reading pace and expected finish (US-023, RF-013, D-23). Weighted like the progress (RF-008,
// US-016): each completed leaf is worth its share of the book (the product of its weight shares from
// the root down, D-16), so a long chapter moves the pace more than a short one. The pace is the
// share completed per day over a recent window; the finish is the remaining share at that pace.
// Pure: "today" comes in as a calendar day (D-19), never from the clock.

// The window the pace looks at: the last four weeks, or less when the first completion is newer.
export const PACE_WINDOW_DAYS = 28;
// Below this, a number would mislead more than help (the story's own example).
export const MIN_COMPLETIONS = 2;
export const MIN_SPAN_DAYS = 7;

export type PaceNode = {
  status: ReadingStatus;
  completedAt: string | null;
  goalPages: number | null;
  children: readonly PaceNode[];
};

export type Pace =
  // No structure: nothing to measure.
  | { kind: "empty" }
  | { kind: "completed" }
  | {
      kind: "insufficient";
      // Completions inside the window, and days since the first completion (0 without any).
      completions: number;
      days: number;
    }
  | {
      kind: "forecast";
      // Share of the book completed per week (0 to 1) and leaves completed per week, over the window.
      sharePerWeek: number;
      leavesPerWeek: number;
      // How many leaves were completed in the window, and how many days it spans.
      completions: number;
      days: number;
      // The expected finish, a calendar day (YYYY-MM-DD).
      finishOn: string;
    };

type Leaf = {
  share: number;
  status: ReadingStatus;
  completedAt: string | null;
};

function leaves(nodes: readonly PaceNode[], share: number): Leaf[] {
  const shares = weightShares(nodes);
  return nodes.flatMap((node, index) =>
    node.children.length === 0
      ? [
          {
            share: share * shares[index],
            status: node.status,
            completedAt: node.completedAt,
          },
        ]
      : leaves(node.children, share * shares[index]),
  );
}

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;
const fromDayNumber = (value: number) =>
  new Date(value * DAY_MS).toISOString().slice(0, 10);

const inRange = (value: number, from: number, to: number) =>
  from <= value && value <= to;

export function readingPace(roots: readonly PaceNode[], today: string): Pace {
  const all = leaves(roots, 1);
  if (all.length === 0) return { kind: "empty" };
  if (all.every((leaf) => leaf.status === "completed")) {
    return { kind: "completed" };
  }

  const now = dayNumber(today);
  const done = all.filter(
    (leaf): leaf is Leaf & { completedAt: string } =>
      leaf.status === "completed" && leaf.completedAt !== null,
  );
  const first = Math.min(...done.map((leaf) => dayNumber(leaf.completedAt)));
  // Days from the first completion to today, both included, capped at the window.
  const days =
    done.length === 0 ? 0 : Math.min(PACE_WINDOW_DAYS, now - first + 1);
  // Completed within the last PACE_WINDOW_DAYS days, today included; never after today.
  const windowStart = now - PACE_WINDOW_DAYS + 1;
  const recent = done.filter((leaf) =>
    inRange(dayNumber(leaf.completedAt), windowStart, now),
  );
  if (recent.length < MIN_COMPLETIONS || days < MIN_SPAN_DAYS) {
    return { kind: "insufficient", completions: recent.length, days };
  }

  const perDay = recent.reduce((total, leaf) => total + leaf.share, 0) / days;
  const remaining = all
    .filter((leaf) => leaf.status !== "completed")
    .reduce((total, leaf) => total + leaf.share, 0);
  return {
    kind: "forecast",
    sharePerWeek: perDay * 7,
    leavesPerWeek: (recent.length / days) * 7,
    completions: recent.length,
    days,
    finishOn: fromDayNumber(now + Math.ceil(remaining / perDay)),
  };
}

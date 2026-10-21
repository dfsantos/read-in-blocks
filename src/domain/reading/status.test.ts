import { describe, expect, it } from "vitest";

import { readingDatesSchema, readingStatusSchema } from "./reading-input";
import {
  calendarDay,
  changeStatus,
  editDates,
  NOT_STARTED,
  type ReadingState,
  type ReadingStatus,
} from "./status";

const TODAY = "2026-10-20";
const state = (
  status: ReadingStatus,
  startedAt: string | null = null,
  completedAt: string | null = null,
): ReadingState => ({ status, startedAt, completedAt });

describe("changeStatus", () => {
  it.each<[string, ReadingState, ReadingStatus, ReadingState]>([
    ["starts today", NOT_STARTED, "in_progress", state("in_progress", TODAY)],
    [
      "fills both dates when going straight to completed",
      NOT_STARTED,
      "completed",
      state("completed", TODAY, TODAY),
    ],
    [
      "completes today and keeps the start",
      state("in_progress", "2026-10-01"),
      "completed",
      state("completed", "2026-10-01", TODAY),
    ],
    [
      "clears the completion when going back to in progress",
      state("completed", "2026-10-01", "2026-10-05"),
      "in_progress",
      state("in_progress", "2026-10-01"),
    ],
    [
      "clears both dates when going back to not started",
      state("completed", "2026-10-01", "2026-10-05"),
      "not_started",
      NOT_STARTED,
    ],
    [
      "clears the start when an in-progress node goes back",
      state("in_progress", "2026-10-01"),
      "not_started",
      NOT_STARTED,
    ],
    [
      "changes nothing for the current state",
      state("completed", "2026-10-01", "2026-10-05"),
      "completed",
      state("completed", "2026-10-01", "2026-10-05"),
    ],
  ])("%s", (_name, current, next, expected) => {
    expect(changeStatus(current, next, TODAY)).toEqual(expected);
  });
});

describe("editDates", () => {
  it.each<[string, ReadingState, [string | null, string | null], ReadingState]>(
    [
      [
        "logs a past reading",
        state("completed", TODAY, TODAY),
        ["2025-01-10", "2025-02-01"],
        state("completed", "2025-01-10", "2025-02-01"),
      ],
      [
        "accepts a reading started and completed the same day",
        state("completed", TODAY, TODAY),
        ["2026-10-19", "2026-10-19"],
        state("completed", "2026-10-19", "2026-10-19"),
      ],
      [
        "moves the start of an in-progress node",
        state("in_progress", TODAY),
        ["2026-09-01", null],
        state("in_progress", "2026-09-01"),
      ],
      [
        "keeps a not-started node without dates",
        NOT_STARTED,
        [null, null],
        NOT_STARTED,
      ],
    ],
  )("%s", (_name, current, [startedAt, completedAt], expected) => {
    expect(editDates(current, { startedAt, completedAt }, TODAY)).toEqual({
      ok: true,
      state: expected,
    });
  });

  it.each<
    [string, ReadingState, [string | null, string | null], string, string]
  >([
    [
      "dates on a not-started node",
      NOT_STARTED,
      ["2026-10-01", null],
      "datesNotAllowed",
      "startedAt",
    ],
    [
      "a completion on a not-started node",
      NOT_STARTED,
      [null, "2026-10-01"],
      "datesNotAllowed",
      "completedAt",
    ],
    [
      "no start",
      state("in_progress", TODAY),
      [null, null],
      "startRequired",
      "startedAt",
    ],
    [
      "a start after today",
      state("in_progress", TODAY),
      ["2026-10-21", null],
      "dateInFuture",
      "startedAt",
    ],
    [
      "a completion on an in-progress node",
      state("in_progress", TODAY),
      ["2026-10-01", "2026-10-02"],
      "completionNotAllowed",
      "completedAt",
    ],
    [
      "no completion",
      state("completed", TODAY, TODAY),
      ["2026-10-01", null],
      "completionRequired",
      "completedAt",
    ],
    [
      "a completion after today",
      state("completed", TODAY, TODAY),
      ["2026-10-01", "2026-10-21"],
      "dateInFuture",
      "completedAt",
    ],
    [
      "a completion before the start",
      state("completed", TODAY, TODAY),
      ["2026-10-10", "2026-10-09"],
      "datesOutOfOrder",
      "completedAt",
    ],
  ])("refuses %s", (_name, current, [startedAt, completedAt], error, field) => {
    expect(editDates(current, { startedAt, completedAt }, TODAY)).toEqual({
      ok: false,
      error,
      field,
    });
  });
});

describe("calendarDay", () => {
  it.each([
    // 01:30 UTC is still the previous evening in São Paulo (UTC−3).
    ["2026-10-21T01:30:00Z", "America/Sao_Paulo", "2026-10-20"],
    ["2026-10-21T03:00:00Z", "America/Sao_Paulo", "2026-10-21"],
    ["2026-10-21T01:30:00Z", "UTC", "2026-10-21"],
  ])("gives the day of %s in %s", (instant, timeZone, day) => {
    expect(calendarDay(new Date(instant), timeZone)).toBe(day);
  });
});

describe("reading input", () => {
  it.each(["not_started", "in_progress", "completed"])(
    "accepts the status %s",
    (status) => {
      expect(readingStatusSchema.parse({ status })).toEqual({ status });
    },
  );

  it.each(["done", "", null, "COMPLETED"])(
    "refuses the status %j",
    (status) => {
      expect(readingStatusSchema.safeParse({ status }).success).toBe(false);
    },
  );

  it.each([
    [
      { startedAt: "2026-10-01", completedAt: "" },
      { startedAt: "2026-10-01", completedAt: null },
    ],
    [{}, { startedAt: null, completedAt: null }],
    [
      { startedAt: null, completedAt: "1900-01-01" },
      { startedAt: null, completedAt: "1900-01-01" },
    ],
  ])("reads the dates %j", (input, expected) => {
    expect(readingDatesSchema.parse(input)).toEqual(expected);
  });

  it.each([
    ["a malformed day", "2026-13-01"],
    ["a day that does not exist", "2026-02-30"],
    ["a day with a time", "2026-10-01T10:00"],
    ["a day before 1900", "0202-10-01"],
    ["a number", 20261001],
  ])("refuses %s", (_name, startedAt) => {
    const result = readingDatesSchema.safeParse({ startedAt, completedAt: "" });
    expect(result.success ? undefined : result.error.issues[0].message).toBe(
      "dateInvalid",
    );
  });
});

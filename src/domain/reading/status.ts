// Reading state of a leaf node (US-013, ADR-0009, RF-003): stored for leaves, derived for nodes with
// children (US-014). Dates are calendar days (YYYY-MM-DD) in the app's time zone, so a reading
// logged late at night never lands on the next day. Pure: "today" is always a parameter.

export const READING_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export type ReadingState = {
  status: ReadingStatus;
  // Calendar days, "YYYY-MM-DD"; ISO dates compare correctly as strings.
  startedAt: string | null;
  completedAt: string | null;
};

export const NOT_STARTED: ReadingState = {
  status: "not_started",
  startedAt: null,
  completedAt: null,
};

// The state after the reader picks `next` on `today` (ADR-0009, "Datas"):
// - not started clears both dates;
// - in progress keeps the start it already had (or starts today) and clears the completion;
// - completed keeps the start (or starts today, when going straight to completed) and completes
//   today, unless it was already completed;
// - picking the current state changes nothing.
export function changeStatus(
  current: ReadingState,
  next: ReadingStatus,
  today: string,
): ReadingState {
  if (next === current.status) return current;
  switch (next) {
    case "not_started":
      return NOT_STARTED;
    case "in_progress":
      return {
        status: "in_progress",
        startedAt: current.startedAt ?? today,
        completedAt: null,
      };
    case "completed":
      return {
        status: "completed",
        startedAt: current.startedAt ?? today,
        completedAt: today,
      };
  }
}

export const readingDateErrors = {
  datesNotAllowed: "datesNotAllowed",
  startRequired: "startRequired",
  completionNotAllowed: "completionNotAllowed",
  completionRequired: "completionRequired",
  datesOutOfOrder: "datesOutOfOrder",
  dateInFuture: "dateInFuture",
} as const;

export type ReadingDateError =
  (typeof readingDateErrors)[keyof typeof readingDateErrors];

// The state with dates the reader typed (to log a past reading), or why they do not fit its
// status: the same rules the database checks (book_node_reading_dates), plus no day after today.
export function editDates(
  current: ReadingState,
  dates: { startedAt: string | null; completedAt: string | null },
  today: string,
):
  | { ok: true; state: ReadingState }
  | { ok: false; error: ReadingDateError; field: "startedAt" | "completedAt" } {
  const { startedAt, completedAt } = dates;
  if (current.status === "not_started") {
    return startedAt === null && completedAt === null
      ? { ok: true, state: current }
      : {
          ok: false,
          error: readingDateErrors.datesNotAllowed,
          field: startedAt === null ? "completedAt" : "startedAt",
        };
  }
  if (startedAt === null) {
    return {
      ok: false,
      error: readingDateErrors.startRequired,
      field: "startedAt",
    };
  }
  if (startedAt > today) {
    return {
      ok: false,
      error: readingDateErrors.dateInFuture,
      field: "startedAt",
    };
  }
  if (current.status === "in_progress") {
    return completedAt === null
      ? {
          ok: true,
          state: { status: "in_progress", startedAt, completedAt: null },
        }
      : {
          ok: false,
          error: readingDateErrors.completionNotAllowed,
          field: "completedAt",
        };
  }
  if (completedAt === null) {
    return {
      ok: false,
      error: readingDateErrors.completionRequired,
      field: "completedAt",
    };
  }
  if (completedAt > today) {
    return {
      ok: false,
      error: readingDateErrors.dateInFuture,
      field: "completedAt",
    };
  }
  if (completedAt < startedAt) {
    return {
      ok: false,
      error: readingDateErrors.datesOutOfOrder,
      field: "completedAt",
    };
  }
  return { ok: true, state: { status: "completed", startedAt, completedAt } };
}

// The calendar day of `instant` in `timeZone`, as "YYYY-MM-DD".
export function calendarDay(instant: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

import { z } from "zod";

import { READING_STATUSES } from "./status";

// What the reader sends to change a node's reading state (US-013). Shared by the forms and the
// Server Actions: the server always parses again. Error messages are i18n keys under
// `structure.errors`.

export const readingInputErrors = {
  dateInvalid: "dateInvalid",
} as const;

// Older than any reading the app will log; keeps typos like 0202 out.
const EARLIEST_DAY = "1900-01-01";

// A calendar day from a date input ("YYYY-MM-DD"); blank (or missing) means no date.
const readingDaySchema = z
  .union(
    [
      z.literal(""),
      z.iso.date({ error: readingInputErrors.dateInvalid }),
      z.null(),
    ],
    {
      error: readingInputErrors.dateInvalid,
    },
  )
  .optional()
  .transform((day) => (day ? day : null))
  .refine((day) => day === null || day >= EARLIEST_DAY, {
    error: readingInputErrors.dateInvalid,
  });

export const readingStatusSchema = z.object({
  status: z.enum(READING_STATUSES),
});

export const readingDatesSchema = z.object({
  startedAt: readingDaySchema,
  completedAt: readingDaySchema,
});

export type ReadingDatesFormValues = z.input<typeof readingDatesSchema>;
export type ReadingDates = z.output<typeof readingDatesSchema>;

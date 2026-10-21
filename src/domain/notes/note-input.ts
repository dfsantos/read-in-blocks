import { z } from "zod";

import { visibleMultilineText } from "@/domain/text";

// What a reader writes in a node's notebook (US-018, RF-005): plain text, line breaks allowed. Rich
// formatting arrives in US-019. Shared by the forms (client) and the Server Actions (server): the
// server always parses again, the client check is only UX.
//
// Error messages are i18n keys under `notes.errors`, never UI text (rule i18n).

export const NOTE_BODY_MAX = 10_000;
// Far beyond what a reader writes about one chapter, and a bound on what one notebook renders.
export const MAX_NOTES_PER_NODE = 500;

export const noteInputErrors = {
  bodyRequired: "bodyRequired",
  bodyTooLong: "bodyTooLong",
  invalidCharacters: "invalidCharacters",
} as const;

export type NoteInputError =
  (typeof noteInputErrors)[keyof typeof noteInputErrors];

// Trimmed at both ends; inner line breaks and tabs are kept. Other control characters and
// bidirectional overrides are refused, like in a node's summary.
export const noteInputSchema = z.object({
  body: z
    .string({ error: noteInputErrors.bodyRequired })
    .trim()
    .min(1, { error: noteInputErrors.bodyRequired })
    .max(NOTE_BODY_MAX, { error: noteInputErrors.bodyTooLong })
    .refine(visibleMultilineText, {
      error: noteInputErrors.invalidCharacters,
    }),
});

// Note ids are UUIDs; anything else is answered like a missing note, without a query.
export const noteIdSchema = z.uuid();

export type NoteFormValues = z.input<typeof noteInputSchema>;
export type NoteInput = z.output<typeof noteInputSchema>;

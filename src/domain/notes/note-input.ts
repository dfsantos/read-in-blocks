import { z } from "zod";

import {
  noteContentErrors,
  parseNoteContent,
  type NoteContentError,
} from "@/domain/notes/rich-text";

// What a reader writes in a node's notebook: rich content since US-019 (ProseMirror JSON from the
// editor, see rich-text.ts), whose plain text keeps US-018's limits. Shared by the editor (client)
// and the Server Actions (server): the server always parses again, the client check is only UX.
//
// Error messages are i18n keys under `notes.errors`, never UI text (rule i18n).

// Far beyond what a reader writes about one chapter, and a bound on what one notebook renders.
export const MAX_NOTES_PER_NODE = 500;

export const noteInputErrors = noteContentErrors;
export type NoteInputError = NoteContentError;

// The output is the rebuilt document and its plain text, never what the client sent.
export const noteInputSchema = z
  .object(
    { content: z.unknown().optional() },
    { error: noteInputErrors.bodyRequired },
  )
  .transform((input, ctx) => {
    const parsed = parseNoteContent(input.content);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error });
      return z.NEVER;
    }
    return { content: parsed.content, text: parsed.text };
  });

// Note ids are UUIDs; anything else is answered like a missing note, without a query.
export const noteIdSchema = z.uuid();

export type NoteFormValues = z.input<typeof noteInputSchema>;
export type NoteInput = z.output<typeof noteInputSchema>;

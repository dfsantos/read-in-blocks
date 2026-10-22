import { z } from "@/domain/zod";

import {
  noteTypeErrors,
  parseNoteKind,
  type NoteTypeError,
} from "@/domain/notes/note-type";
import {
  noteContentErrors,
  parseNoteContent,
  type NoteContentError,
} from "@/domain/notes/rich-text";

// What a reader writes in a node's notebook: rich content since US-019 (ProseMirror JSON from the
// editor, see rich-text.ts), whose plain text keeps US-018's limits, and its kind since US-020 (a
// quote with its reference, see note-type.ts). Shared by the editor (client)
// and the Server Actions (server): the server always parses again, the client check is only UX.
//
// Error messages are i18n keys under `notes.errors`, never UI text (rule i18n).

// Far beyond what a reader writes about one chapter, and a bound on what one notebook renders.
export const MAX_NOTES_PER_NODE = 500;

export const noteInputErrors = { ...noteContentErrors, ...noteTypeErrors };
export type NoteInputError = NoteContentError | NoteTypeError;

// The output is the rebuilt document and its plain text, never what the client sent.
export const noteInputSchema = z
  .object(
    {
      content: z.unknown().optional(),
      type: z.unknown().optional(),
      reference: z.unknown().optional(),
    },
    { error: noteInputErrors.bodyRequired },
  )
  .transform((input, ctx) => {
    // The kind first: its field sits above the editor.
    const kind = parseNoteKind(input.type, input.reference);
    if (!kind.ok) {
      ctx.addIssue({ code: "custom", message: kind.error });
      return z.NEVER;
    }
    const parsed = parseNoteContent(input.content);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error });
      return z.NEVER;
    }
    return { content: parsed.content, text: parsed.text, ...kind.kind };
  });

// Note ids are UUIDs; anything else is answered like a missing note, without a query.
export const noteIdSchema = z.uuid();

export type NoteFormValues = z.input<typeof noteInputSchema>;
export type NoteInput = z.output<typeof noteInputSchema>;

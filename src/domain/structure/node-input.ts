import { z } from "zod";

import { visibleText } from "@/domain/text";

import { NODE_KINDS } from "./hierarchy";

// What a reader sends to build a book's structure (US-010). Shared by the forms (client) and the
// Server Actions (server): the server always parses again, the client check is only UX.
//
// Error messages are i18n keys under `structure.errors`, never UI text (rule i18n).

export const NODE_TITLE_MAX = 200;
// One paste of a table of contents; a long book takes a few.
export const MAX_TITLES_PER_ADD = 100;
// Far beyond any real book (hundreds of nodes, ADR-0009), and a bound on what one page renders.
export const MAX_NODES_PER_BOOK = 2000;
// Every line at its longest plus its line break, with room for \r\n.
const TITLES_TEXT_MAX = MAX_TITLES_PER_ADD * (NODE_TITLE_MAX + 2);

export const nodeInputErrors = {
  titleRequired: "titleRequired",
  titleTooLong: "titleTooLong",
  invalidCharacters: "invalidCharacters",
  titlesRequired: "titlesRequired",
  tooManyTitles: "tooManyTitles",
} as const;

export type NodeInputError =
  (typeof nodeInputErrors)[keyof typeof nodeInputErrors];

// One node title: what a rename sends, and what each pasted line must be.
export const nodeTitleSchema = z
  .string({ error: nodeInputErrors.titleRequired })
  .trim()
  .min(1, { error: nodeInputErrors.titleRequired })
  .max(NODE_TITLE_MAX, { error: nodeInputErrors.titleTooLong })
  .refine(visibleText, { error: nodeInputErrors.invalidCharacters });

// Pasted text, one title per line: blank lines are skipped, tabs (common when copying a table of
// contents) become spaces and each line is trimmed. Any other hidden character is refused.
export const nodeTitlesSchema = z
  .string({ error: nodeInputErrors.titlesRequired })
  .max(TITLES_TEXT_MAX, { error: nodeInputErrors.tooManyTitles })
  .transform((text, context) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replaceAll("\t", " ").trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      context.addIssue({
        code: "custom",
        message: nodeInputErrors.titlesRequired,
      });
      return z.NEVER;
    }
    if (lines.length > MAX_TITLES_PER_ADD) {
      context.addIssue({
        code: "custom",
        message: nodeInputErrors.tooManyTitles,
      });
      return z.NEVER;
    }
    for (const line of lines) {
      const title = nodeTitleSchema.safeParse(line);
      if (!title.success) {
        context.addIssue({
          code: "custom",
          message: title.error.issues[0].message,
        });
        return z.NEVER;
      }
    }
    return lines;
  });

// Node ids are UUIDs; anything else is answered like a missing node, without a query.
export const nodeIdSchema = z.uuid();

export const addNodesSchema = z.object({
  kind: z.enum(NODE_KINDS),
  titles: nodeTitlesSchema,
});

export const renameNodeSchema = z.object({ title: nodeTitleSchema });

// What the forms hold (strings) and what the server works with.
export type AddNodesFormValues = z.input<typeof addNodesSchema>;
export type AddNodesInput = z.output<typeof addNodesSchema>;
export type RenameNodeFormValues = z.input<typeof renameNodeSchema>;

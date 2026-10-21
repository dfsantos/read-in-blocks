import { z } from "zod";

import { visibleMultilineText, visibleText } from "@/domain/text";

import { NODE_KINDS } from "./hierarchy";

// What a reader sends to build a book's structure (US-010). Shared by the forms (client) and the
// Server Actions (server): the server always parses again, the client check is only UX.
//
// Error messages are i18n keys under `structure.errors`, never UI text (rule i18n).

export const NODE_TITLE_MAX = 200;
// A node's summary is a short plain text (US-011), not a note: notes arrive in US-018.
export const NODE_SUMMARY_MAX = 1000;
// Goals are always in pages (D-02); no book section is anywhere near 10 000 pages.
export const NODE_GOAL_MAX = 10_000;
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
  summaryTooLong: "summaryTooLong",
  goalInvalid: "goalInvalid",
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

// Optional plain text, line breaks allowed; blank (or missing) means no summary, stored as null.
export const nodeSummarySchema = z
  .string({ error: nodeInputErrors.summaryTooLong })
  .trim()
  .max(NODE_SUMMARY_MAX, { error: nodeInputErrors.summaryTooLong })
  .refine(visibleMultilineText, { error: nodeInputErrors.invalidCharacters })
  .optional()
  .transform((summary) => (summary ? summary : null));

// Optional goal in whole pages (D-02). The form sends what was typed ("", "30"); a client may send
// a number or null. Blank means no goal: the node takes the default weight (ADR-0009, US-011).
export const nodeGoalSchema = z
  // 10 characters cover any goal in range with room for spaces; the regex never sees more.
  .union(
    [
      z.string().max(10, { error: nodeInputErrors.goalInvalid }),
      z.number(),
      z.null(),
    ],
    {
      error: nodeInputErrors.goalInvalid,
    },
  )
  .optional()
  .transform((goal, context) => {
    const text = typeof goal === "string" ? goal.trim() : goal;
    if (text === undefined || text === null || text === "") return null;
    const pages =
      typeof text === "number" ? text : /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(pages) || pages < 1 || pages > NODE_GOAL_MAX) {
      context.addIssue({
        code: "custom",
        message: nodeInputErrors.goalInvalid,
      });
      return z.NEVER;
    }
    return pages;
  });

// What editing a node changes (US-011): its title, summary and goal.
export const nodeDetailsSchema = z.object({
  title: nodeTitleSchema,
  summary: nodeSummarySchema,
  goalPages: nodeGoalSchema,
});

// What the forms hold (strings) and what the server works with.
export type AddNodesFormValues = z.input<typeof addNodesSchema>;
export type AddNodesInput = z.output<typeof addNodesSchema>;
export type NodeDetailsFormValues = z.input<typeof nodeDetailsSchema>;
export type NodeDetails = z.output<typeof nodeDetailsSchema>;

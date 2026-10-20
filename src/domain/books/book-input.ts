import { z } from "zod";

// What a reader types to create a book (US-007, D-08): a required title and an optional author.
// No cover and no total of pages; goals are always in pages (D-02). Shared by the form (client)
// and the Server Action (server): the server always parses again, the client check is only UX.
//
// Error messages are i18n keys under `books.form.errors`, never UI text (rule i18n).

export const BOOK_TITLE_MAX = 200;
export const BOOK_AUTHOR_MAX = 200;

export const bookInputErrors = {
  titleRequired: "titleRequired",
  titleTooLong: "titleTooLong",
  authorTooLong: "authorTooLong",
  invalidCharacters: "invalidCharacters",
} as const;

// Control characters (tabs, line breaks, NUL…) and bidirectional overrides/isolates, which can make
// a title display as something else (security review, US-007). Plain text on one line only.
const HIDDEN_CHARACTERS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const visibleText = (text: string) => !HIDDEN_CHARACTERS.test(text);

export type BookInputError =
  (typeof bookInputErrors)[keyof typeof bookInputErrors];

export const bookInputSchema = z.object({
  // A string of something else (number, object) gets the same "required" error.
  title: z
    .string({ error: bookInputErrors.titleRequired })
    .trim()
    .min(1, { error: bookInputErrors.titleRequired })
    .max(BOOK_TITLE_MAX, { error: bookInputErrors.titleTooLong })
    .refine(visibleText, { error: bookInputErrors.invalidCharacters }),
  // Blank (or missing) means no author: stored as null, never as "".
  author: z
    .string({ error: bookInputErrors.authorTooLong })
    .trim()
    .max(BOOK_AUTHOR_MAX, { error: bookInputErrors.authorTooLong })
    .refine(visibleText, { error: bookInputErrors.invalidCharacters })
    .optional()
    .transform((author) => (author ? author : null)),
});

// What the form holds (strings) and what the server stores (author may be null).
export type BookFormValues = z.input<typeof bookInputSchema>;
export type BookInput = z.output<typeof bookInputSchema>;

// Book ids are UUIDs; anything else is answered like a missing book (404), without a query.
export const bookIdSchema = z.uuid();

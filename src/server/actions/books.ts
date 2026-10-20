"use server";

import {
  bookIdSchema,
  bookInputSchema,
  type BookInput,
  type BookInputError,
} from "@/domain/books/book-input";
import { requireUser } from "@/server/auth/session";
import {
  createBook as insertBook,
  deleteBook as removeBook,
  updateBook as changeBook,
} from "@/server/repositories/books";
import {
  consumeWriteQuota,
  type WriteQuota,
} from "@/server/repositories/write-quota";

// Book Server Actions (US-007, US-009). Each one is a public endpoint (rule server-actions): Zod
// first, then requireUser(), then the repository with the session's userId. Next.js checks the
// Origin and caps the body at 100 kB (next.config.ts); the per-reader quota caps the write rate.
// The book id is an argument anyone can forge: it is parsed like any other input, and a malformed
// id, a missing book and another reader's book all get the same "notFound".

// Keys under `books.form.errors` in messages/pt-BR.json.
export type BookActionErrorKey =
  | BookInputError
  | "rateLimited"
  | "failed"
  | "updateRateLimited"
  | "updateFailed"
  | "notFound";

type BookFormResult<Data> =
  | { ok: true; data: Data }
  | {
      ok: false;
      errorKey: BookActionErrorKey;
      // The form field the error belongs to; absent for errors of the whole form.
      field?: "title" | "author";
    };

export type CreateBookResult = BookFormResult<{ id: string }>;
export type UpdateBookResult = BookFormResult<{ id: string }>;

// Keys under `books.delete.errors` in messages/pt-BR.json.
export type DeleteBookErrorKey = "notFound" | "rateLimited" | "failed";
export type DeleteBookResult =
  { ok: true } | { ok: false; errorKey: DeleteBookErrorKey };

// 20 books a minute is far beyond anyone typing them in, and far below a script's pace.
const CREATE_BOOK_QUOTA = {
  action: "books.create",
  limit: 20,
  windowSeconds: 60,
} satisfies WriteQuota;
// Fixing a typo twice in a row is normal; 30 a minute still stops a script.
const UPDATE_BOOK_QUOTA = {
  action: "books.update",
  limit: 30,
  windowSeconds: 60,
} satisfies WriteQuota;
// Each deletion needs a confirmation in the page: 20 a minute is far beyond a person.
const DELETE_BOOK_QUOTA = {
  action: "books.delete",
  limit: 20,
  windowSeconds: 60,
} satisfies WriteQuota;

type ParsedInput =
  | { ok: true; data: BookInput }
  | { ok: false; errorKey: BookInputError; field: "title" | "author" };

function parseBookInput(input: unknown): ParsedInput {
  const parsed = bookInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const [issue] = parsed.error.issues;
  const field = issue.path[0];
  return field === "title" || field === "author"
    ? { ok: false, errorKey: issue.message as BookInputError, field }
    : { ok: false, errorKey: "titleRequired", field: "title" };
}

// Only the Postgres error code: messages may echo the reader's title (zero-trust.md, 3.3).
function logFailure(action: string, error: unknown) {
  console.error(`${action} failed`, {
    code: (error as { code?: unknown } | null)?.code,
  });
}

// Security events (zero-trust.md, 3.3): ids and a timestamp, never the title or author.
type BookEvent = {
  event: "books.deleted" | "books.delete_rate_limited";
  userId: string;
  bookId: string;
};

function logBookEvent(entry: BookEvent) {
  console.info(JSON.stringify({ ...entry, at: new Date().toISOString() }));
}

export async function createBook(input: unknown): Promise<CreateBookResult> {
  const parsed = parseBookInput(input);
  if (!parsed.ok) return parsed;

  const user = await requireUser();

  try {
    if (!(await consumeWriteQuota(user.id, CREATE_BOOK_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    const book = await insertBook(user.id, parsed.data);
    return { ok: true, data: { id: book.id } };
  } catch (error) {
    logFailure(CREATE_BOOK_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

export async function updateBook(
  bookId: unknown,
  input: unknown,
): Promise<UpdateBookResult> {
  const id = bookIdSchema.safeParse(bookId);
  const parsed = parseBookInput(input);
  if (!parsed.ok) return parsed;

  const user = await requireUser();
  if (!id.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, UPDATE_BOOK_QUOTA))) {
      return { ok: false, errorKey: "updateRateLimited" };
    }
    const book = await changeBook(user.id, id.data, parsed.data);
    return book
      ? { ok: true, data: { id: book.id } }
      : { ok: false, errorKey: "notFound" };
  } catch (error) {
    logFailure(UPDATE_BOOK_QUOTA.action, error);
    return { ok: false, errorKey: "updateFailed" };
  }
}

export async function deleteBook(bookId: unknown): Promise<DeleteBookResult> {
  const id = bookIdSchema.safeParse(bookId);

  const user = await requireUser();
  if (!id.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, DELETE_BOOK_QUOTA))) {
      logBookEvent({
        event: "books.delete_rate_limited",
        userId: user.id,
        bookId: id.data,
      });
      return { ok: false, errorKey: "rateLimited" };
    }
    if (!(await removeBook(user.id, id.data))) {
      return { ok: false, errorKey: "notFound" };
    }
    // Deleting cannot be undone: leave a trace of who did it and when (zero-trust.md, 3.3).
    logBookEvent({ event: "books.deleted", userId: user.id, bookId: id.data });
    return { ok: true };
  } catch (error) {
    logFailure(DELETE_BOOK_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

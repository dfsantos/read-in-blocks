"use server";

import {
  bookInputSchema,
  type BookInputError,
} from "@/domain/books/book-input";
import { requireUser } from "@/server/auth/session";
import { createBook as insertBook } from "@/server/repositories/books";
import { consumeWriteQuota } from "@/server/repositories/write-quota";

// Book Server Actions (US-007). Each one is a public endpoint (rule server-actions): Zod first,
// then requireUser(), then the repository with the session's userId. Next.js checks the Origin
// and caps the body at 100 kB (next.config.ts); the per-reader quota caps the write rate.

// Keys under `books.form.errors` in messages/pt-BR.json.
export type BookActionErrorKey = BookInputError | "rateLimited" | "failed";

export type CreateBookResult =
  | { ok: true; data: { id: string } }
  | {
      ok: false;
      errorKey: BookActionErrorKey;
      // The form field the error belongs to; absent for errors of the whole form.
      field?: "title" | "author";
    };

// 20 books a minute is far beyond anyone typing them in, and far below a script's pace.
const CREATE_BOOK_QUOTA = {
  action: "books.create",
  limit: 20,
  windowSeconds: 60,
};

export async function createBook(input: unknown): Promise<CreateBookResult> {
  const parsed = bookInputSchema.safeParse(input);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const field = issue.path[0];
    return field === "title" || field === "author"
      ? { ok: false, errorKey: issue.message as BookInputError, field }
      : { ok: false, errorKey: "titleRequired", field: "title" };
  }

  const user = await requireUser();

  try {
    if (!(await consumeWriteQuota(user.id, CREATE_BOOK_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    const book = await insertBook(user.id, parsed.data);
    return { ok: true, data: { id: book.id } };
  } catch (error) {
    // Only the Postgres error code: messages may echo the reader's title (zero-trust.md, 3.3).
    console.error("books.create failed", {
      code: (error as { code?: unknown } | null)?.code,
    });
    return { ok: false, errorKey: "failed" };
  }
}

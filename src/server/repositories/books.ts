import { desc, eq, sql } from "drizzle-orm";

import { getDb, type Database } from "@/db/client";
import { book } from "@/db/schema";
import type { BookInput } from "@/domain/books/book-input";

import { ownedBy } from "./owner-scope";
import { withOwner } from "./with-owner";

// The reader's books (US-007). Content table: every query runs through withOwner (RLS) and is
// still filtered by ownedBy. Another reader's book behaves exactly like a missing one.

export type Book = {
  id: string;
  title: string;
  author: string | null;
  createdAt: Date;
};

const bookColumns = {
  id: book.id,
  title: book.title,
  author: book.author,
  createdAt: book.createdAt,
};

// The owner is always the userId from the session; nothing in `input` can choose it.
export async function createBook(
  userId: string,
  input: BookInput,
  db: Database = getDb(),
): Promise<Book> {
  return withOwner(
    userId,
    async (tx) => {
      const [created] = await tx
        .insert(book)
        .values({ ownerId: userId, title: input.title, author: input.author })
        .returning(bookColumns);
      return created;
    },
    db,
  );
}

// The reader's library (US-008): only their books, the most recently created first. The id breaks
// ties between books created in the same instant, so the order is stable. Always bounded: the
// create quota still lets a reader pile up thousands of books (security review).
export async function listBooks(
  userId: string,
  options: { limit: number },
  db: Database = getDb(),
): Promise<Book[]> {
  return withOwner(
    userId,
    async (tx) =>
      tx
        .select(bookColumns)
        .from(book)
        .where(ownedBy(book.ownerId, userId))
        .orderBy(desc(book.createdAt), desc(book.id))
        .limit(options.limit),
    db,
  );
}

// undefined both when the book does not exist and when it belongs to someone else. bookId must
// already be a UUID (bookIdSchema): Postgres would reject anything else with an error.
export async function findBook(
  userId: string,
  bookId: string,
  db: Database = getDb(),
): Promise<Book | undefined> {
  return withOwner(
    userId,
    async (tx) => {
      const [row] = await tx
        .select(bookColumns)
        .from(book)
        .where(ownedBy(book.ownerId, userId, eq(book.id, bookId)))
        .limit(1);
      return row;
    },
    db,
  );
}

// undefined, with nothing written, both when the book does not exist and when it belongs to someone
// else (US-009). bookId must already be a UUID (bookIdSchema).
export async function updateBook(
  userId: string,
  bookId: string,
  input: BookInput,
  db: Database = getDb(),
): Promise<Book | undefined> {
  return withOwner(
    userId,
    async (tx) => {
      const [updated] = await tx
        .update(book)
        .set({
          title: input.title,
          author: input.author,
          updatedAt: sql`now()`,
        })
        .where(ownedBy(book.ownerId, userId, eq(book.id, bookId)))
        .returning(bookColumns);
      return updated;
    },
    db,
  );
}

// Whether the reader's book was deleted (US-009, D-09): false both for a missing book and for
// someone else's. What hangs from a book (structure, notes) goes with it through composite foreign
// keys with ON DELETE CASCADE, which tests/integration/rls-catalog.test.ts requires of every table
// that points at a book.
export async function deleteBook(
  userId: string,
  bookId: string,
  db: Database = getDb(),
): Promise<boolean> {
  return withOwner(
    userId,
    async (tx) => {
      const deleted = await tx
        .delete(book)
        .where(ownedBy(book.ownerId, userId, eq(book.id, bookId)))
        .returning({ id: book.id });
      return deleted.length > 0;
    },
    db,
  );
}

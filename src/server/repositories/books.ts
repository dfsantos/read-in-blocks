import { eq } from "drizzle-orm";

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

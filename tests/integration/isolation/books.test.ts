import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
  createBook,
  deleteBook,
  findBook,
  listBooks,
  updateBook,
} from "@/server/repositories/books";
import { consumeWriteQuota } from "@/server/repositories/write-quota";

import { requireTestEnv } from "../db-env";
import {
  describeIsolation,
  useReaders,
  type IsolationSpec,
} from "./two-readers";

// The book repository (US-007) against Postgres with the app role: two-reader isolation, its own
// behaviour and the RLS barrier on its own (a query that forgets the owner filter).

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

afterAll(() => pool.end());

const booksSpec: IsolationSpec<{ id: string }> = {
  seed: async (ownerId) => {
    const book = await createBook(
      ownerId,
      { title: "Isolation", author: "Owner" },
      db,
    );
    return { id: book.id };
  },
  missing: () => ({ id: randomUUID() }),
  // Through the repository: under RLS a plain select by the app role sees no book at all.
  snapshot: (ownerId, owned) => findBook(ownerId, owned.id, db),
  contains: (result, owned) =>
    (Array.isArray(result) ? result : [result]).some(
      (item) => (item as { id?: unknown } | undefined)?.id === owned.id,
    ),
  operations: {
    find: (userId, target) => findBook(userId, target.id, db),
    // The target is ignored: a list takes no id, and must not carry someone else's book.
    list: (userId) => listBooks(userId, { limit: 100 }, db),
    update: (userId, target) =>
      updateBook(
        userId,
        target.id,
        { title: "Overwritten", author: "Intruder" },
        db,
      ),
    delete: (userId, target) => deleteBook(userId, target.id, db),
  },
};

describeIsolation(db, "books", booksSpec);

describe("books repository", () => {
  const { create } = useReaders(db, "books-repository.test");

  it("creates a book owned by the caller and finds it", async () => {
    const { owner } = await create();

    const created = await createBook(
      owner.id,
      { title: "Refactoring", author: null },
      db,
    );

    expect(created).toMatchObject({ title: "Refactoring", author: null });
    expect(Object.keys(created).sort()).toEqual([
      "author",
      "createdAt",
      "id",
      "title",
    ]);
    expect(await findBook(owner.id, created.id, db)).toEqual(created);
  });

  it("lists only the reader's books, the most recent first", async () => {
    const { owner, intruder } = await create();
    const first = await createBook(
      owner.id,
      { title: "First", author: null },
      db,
    );
    const second = await createBook(
      owner.id,
      { title: "Second", author: "B" },
      db,
    );
    await createBook(intruder.id, { title: "Not mine", author: null }, db);

    expect(await listBooks(owner.id, { limit: 100 }, db)).toEqual([
      second,
      first,
    ]);
    expect(await listBooks(owner.id, { limit: 100 }, db)).not.toContainEqual(
      expect.objectContaining({ title: "Not mine" }),
    );
  });

  it("orders books created in the same instant by id, so the order is stable", async () => {
    const { owner } = await create();
    // One statement: both rows get the same now().
    const rows = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.user_id', ${owner.id}, true)`,
      );
      return tx
        .insert(schema.book)
        .values([
          { ownerId: owner.id, title: "A" },
          { ownerId: owner.id, title: "B" },
        ])
        .returning({ id: schema.book.id, createdAt: schema.book.createdAt });
    });
    expect(rows[0].createdAt).toEqual(rows[1].createdAt);

    const listed = (await listBooks(owner.id, { limit: 100 }, db)).map(
      (book) => book.id,
    );
    expect(listed).toEqual(
      rows
        .map((row) => row.id)
        .sort()
        .reverse(),
    );
  });

  it("lists at most the limit, keeping the most recent", async () => {
    const { owner } = await create();
    await createBook(owner.id, { title: "Old", author: null }, db);
    const recent = await createBook(
      owner.id,
      { title: "New", author: null },
      db,
    );

    expect(await listBooks(owner.id, { limit: 1 }, db)).toEqual([recent]);
  });

  it("lists nothing for a reader without books", async () => {
    const { owner } = await create();
    expect(await listBooks(owner.id, { limit: 100 }, db)).toEqual([]);
  });

  it("writes the owner from the userId, whatever the input carries", async () => {
    const { owner, intruder } = await create();
    const input = {
      title: "Smuggled",
      author: null,
      ownerId: intruder.id,
    } as Parameters<typeof createBook>[1];

    const created = await createBook(owner.id, input, db);

    expect(await findBook(owner.id, created.id, db)).toBeDefined();
    expect(await findBook(intruder.id, created.id, db)).toBeUndefined();
  });

  it("lets RLS hide another reader's book from a query without the owner filter", async () => {
    const { owner, intruder } = await create();
    const created = await createBook(
      owner.id,
      { title: "RLS", author: null },
      db,
    );

    // The app role, with no owner set, sees nothing.
    expect(await db.select().from(schema.book)).toEqual([]);

    // With the intruder set as the RLS owner, a select that forgets ownedBy still sees nothing,
    // and a row written for someone else is refused.
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.user_id', ${intruder.id}, true)`,
      );
      expect(await tx.select().from(schema.book)).toEqual([]);
      await expect(
        tx.insert(schema.book).values({ ownerId: owner.id, title: "Forged" }),
      ).rejects.toThrow();
    });
    expect(await findBook(owner.id, created.id, db)).toBeDefined();
  });

  it("refuses titles the database must never hold", async () => {
    const { owner } = await create();

    await expect(
      createBook(owner.id, { title: "", author: null }, db),
    ).rejects.toThrow();
    await expect(
      createBook(owner.id, { title: "a".repeat(201), author: null }, db),
    ).rejects.toThrow();
    // An empty author is stored as null, never as "".
    await expect(
      createBook(owner.id, { title: "t", author: "" }, db),
    ).rejects.toThrow();
    await expect(
      createBook(owner.id, { title: "t", author: "a".repeat(201) }, db),
    ).rejects.toThrow();
    // 23514: check_violation, the constraint and not something else.
    await expect(
      createBook(owner.id, { title: "", author: null }, db),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("refuses to run without a userId", async () => {
    for (const call of [
      () => findBook("", randomUUID(), db),
      () => updateBook("", randomUUID(), { title: "t", author: null }, db),
      () => deleteBook("", randomUUID(), db),
    ]) {
      await expect(call()).rejects.toThrow(
        "repository called without a userId",
      );
    }
  });

  it("updates the title and author of the reader's book and its updated_at", async () => {
    const { owner } = await create();
    const created = await createBook(
      owner.id,
      { title: "Refactorng", author: "Fowler" },
      db,
    );
    const updatedAt = async () =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.user_id', ${owner.id}, true)`,
        );
        const [row] = await tx
          .select({ updatedAt: schema.book.updatedAt })
          .from(schema.book)
          .where(eq(schema.book.id, created.id));
        return row.updatedAt;
      });
    const before = await updatedAt();

    const updated = await updateBook(
      owner.id,
      created.id,
      { title: "Refactoring", author: null },
      db,
    );

    expect(updated).toEqual({
      ...created,
      title: "Refactoring",
      author: null,
    });
    expect(await findBook(owner.id, created.id, db)).toEqual(updated);
    expect((await updatedAt()).getTime()).toBeGreaterThan(before.getTime());
  });

  it("writes nothing for a missing book", async () => {
    const { owner } = await create();
    expect(
      await updateBook(
        owner.id,
        randomUUID(),
        { title: "t", author: null },
        db,
      ),
    ).toBeUndefined();
    expect(await deleteBook(owner.id, randomUUID(), db)).toBe(false);
  });

  it("keeps the database limits on an update", async () => {
    const { owner } = await create();
    const created = await createBook(
      owner.id,
      { title: "Kept", author: null },
      db,
    );

    await expect(
      updateBook(owner.id, created.id, { title: "", author: null }, db),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    expect(await findBook(owner.id, created.id, db)).toEqual(created);
  });

  it("deletes only the given book of the reader", async () => {
    const { owner } = await create();
    const kept = await createBook(
      owner.id,
      { title: "Kept", author: null },
      db,
    );
    const gone = await createBook(
      owner.id,
      { title: "Gone", author: null },
      db,
    );

    expect(await deleteBook(owner.id, gone.id, db)).toBe(true);

    expect(await findBook(owner.id, gone.id, db)).toBeUndefined();
    expect(await listBooks(owner.id, { limit: 100 }, db)).toEqual([kept]);
    // A second deletion answers like a missing book.
    expect(await deleteBook(owner.id, gone.id, db)).toBe(false);
  });

  it("lets RLS refuse an update or delete of another reader's book without the owner filter", async () => {
    const { owner, intruder } = await create();
    const created = await createBook(
      owner.id,
      { title: "Guarded", author: null },
      db,
    );

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.user_id', ${intruder.id}, true)`,
      );
      expect(
        await tx
          .update(schema.book)
          .set({ title: "Forged" })
          .where(eq(schema.book.id, created.id))
          .returning({ id: schema.book.id }),
      ).toEqual([]);
      expect(
        await tx
          .delete(schema.book)
          .where(eq(schema.book.id, created.id))
          .returning({ id: schema.book.id }),
      ).toEqual([]);
    });
    expect(await findBook(owner.id, created.id, db)).toEqual(created);
  });

  it("does not let an update hand the book to someone else", async () => {
    const { owner, intruder } = await create();
    const created = await createBook(
      owner.id,
      { title: "Mine", author: null },
      db,
    );
    const input = {
      title: "Still mine",
      author: null,
      ownerId: intruder.id,
      id: randomUUID(),
    } as Parameters<typeof updateBook>[2];

    await updateBook(owner.id, created.id, input, db);

    expect(await findBook(owner.id, created.id, db)).toMatchObject({
      id: created.id,
      title: "Still mine",
    });
    expect(await findBook(intruder.id, created.id, db)).toBeUndefined();
  });

  it("removes the reader's books and quotas with the reader", async () => {
    const { owner } = await create();
    const created = await createBook(
      owner.id,
      { title: "Gone", author: null },
      db,
    );

    // A quota row too, so the cascade of both owner tables is checked.
    await consumeWriteQuota(
      owner.id,
      { action: "test.cascade", limit: 1, windowSeconds: 60 },
      db,
    );

    await db.delete(schema.user).where(eq(schema.user.id, owner.id));

    expect(await findBook(owner.id, created.id, db)).toBeUndefined();
    const quotas = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.user_id', ${owner.id}, true)`,
      );
      return tx.select().from(schema.writeQuota);
    });
    expect(quotas).toEqual([]);
  });
});

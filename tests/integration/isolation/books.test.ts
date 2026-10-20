import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { createBook, findBook, listBooks } from "@/server/repositories/books";
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
    list: (userId) => listBooks(userId, db),
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

    expect(await listBooks(owner.id, db)).toEqual([second, first]);
    expect(await listBooks(owner.id, db)).not.toContainEqual(
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

    const listed = (await listBooks(owner.id, db)).map((book) => book.id);
    expect(listed).toEqual(
      rows
        .map((row) => row.id)
        .sort()
        .reverse(),
    );
  });

  it("lists nothing for a reader without books", async () => {
    const { owner } = await create();
    expect(await listBooks(owner.id, db)).toEqual([]);
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
    await expect(findBook("", randomUUID(), db)).rejects.toThrow(
      "repository called without a userId",
    );
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

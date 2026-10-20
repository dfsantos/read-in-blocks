import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import { createBook as seedBook, findBook } from "@/server/repositories/books";
import { consumeWriteQuota } from "@/server/repositories/write-quota";

import { requireTestEnv } from "./db-env";
import { useReaders } from "./isolation/two-readers";

// The book Server Action called directly, as an attacker posting to it would (US-007): no page,
// no form, any payload. The session is mocked; everything below it (quota, repository, RLS) is
// the real code against Postgres with the app role.

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/db/client", () => ({ getDb: () => db }));

import { createBook, deleteBook, updateBook } from "@/server/actions/books";

afterAll(() => pool.end());

describe("createBook Server Action", () => {
  const { create } = useReaders(db, "book-actions.test");

  beforeEach(() => {
    mocks.requireUser.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  async function signedIn() {
    const readers = await create();
    mocks.requireUser.mockResolvedValue({
      id: readers.owner.id,
      name: "owner",
      email: readers.owner.email,
      image: null,
    });
    return readers;
  }

  it("is refused without a session and writes nothing", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    // Every query of the quota and the book repository runs in a withOwner transaction.
    const transaction = vi.spyOn(db, "transaction");

    await expect(createBook({ title: "Anonymous" })).rejects.toThrow(
      "NEXT_REDIRECT /login",
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates the book for the session's reader, ignoring an owner in the payload", async () => {
    const { owner, intruder } = await signedIn();

    const result = await createBook({
      title: "  Refactoring ",
      author: "",
      ownerId: intruder.id,
      id: "0b6f8f5e-5c55-4f0a-9d8e-2f1f2b7f3c11",
    });

    if (!result.ok) throw new Error(`unexpected ${result.errorKey}`);
    expect(result.data.id).not.toBe("0b6f8f5e-5c55-4f0a-9d8e-2f1f2b7f3c11");
    expect(await findBook(owner.id, result.data.id, db)).toMatchObject({
      title: "Refactoring",
      author: null,
    });
    expect(await findBook(intruder.id, result.data.id, db)).toBeUndefined();
  });

  it.each([
    ["no title", {}, "titleRequired", "title"],
    ["a blank title", { title: "  " }, "titleRequired", "title"],
    ["a long title", { title: "a".repeat(201) }, "titleTooLong", "title"],
    [
      "a long author",
      { title: "t", author: "a".repeat(201) },
      "authorTooLong",
      "author",
    ],
    ["not an object", "Refactoring", "titleRequired", "title"],
    ["null", null, "titleRequired", "title"],
  ])(
    "answers %s with an error key and writes nothing",
    async (_name, input, errorKey, field) => {
      const { owner } = await signedIn();

      expect(await createBook(input)).toEqual({ ok: false, errorKey, field });
      // Invalid input is refused before the session is even read.
      expect(mocks.requireUser).not.toHaveBeenCalled();
      expect(
        await db.transaction(async (tx) => {
          await tx.execute(
            sql`select set_config('app.user_id', ${owner.id}, true)`,
          );
          return tx.select().from(schema.book);
        }),
      ).toEqual([]);
    },
  );

  it("stops a reader after 20 books a minute, without touching other readers", async () => {
    const { owner, intruder } = await signedIn();

    for (let i = 0; i < 20; i += 1) {
      expect(await createBook({ title: `Book ${i}` })).toMatchObject({
        ok: true,
      });
    }
    expect(await createBook({ title: "One too many" })).toEqual({
      ok: false,
      errorKey: "rateLimited",
    });

    mocks.requireUser.mockResolvedValue({
      id: intruder.id,
      name: "intruder",
      email: intruder.email,
      image: null,
    });
    expect(await createBook({ title: "Someone else" })).toMatchObject({
      ok: true,
    });
    expect(owner.id).not.toBe(intruder.id);
  });

  it("answers a database failure with a generic key and logs no content", async () => {
    await signedIn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "transaction").mockRejectedValueOnce(
      Object.assign(new Error('insert "Secret Title" failed'), {
        code: "XX000",
      }),
    );

    expect(await createBook({ title: "Secret Title" })).toEqual({
      ok: false,
      errorKey: "failed",
    });
    expect(error).toHaveBeenCalledWith("books.create failed", {
      code: "XX000",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("Secret Title");
  });
});

// Signs `reader` in for the actions below.
function signIn(reader: { id: string; email: string }) {
  mocks.requireUser.mockResolvedValue({
    id: reader.id,
    name: "reader",
    email: reader.email,
    image: null,
  });
}

describe("updateBook Server Action", () => {
  const { create } = useReaders(db, "book-update-action.test");

  beforeEach(() => {
    mocks.requireUser.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("is refused without a session and writes nothing", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    const transaction = vi.spyOn(db, "transaction");

    await expect(
      updateBook(randomUUID(), { title: "Anonymous" }),
    ).rejects.toThrow("NEXT_REDIRECT /login");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("saves the trimmed values of the reader's book, ignoring an owner in the payload", async () => {
    const { owner, intruder } = await create();
    const book = await seedBook(owner.id, { title: "Old", author: "A" }, db);
    signIn(owner);

    expect(
      await updateBook(book.id, {
        title: "  New ",
        author: " ",
        ownerId: intruder.id,
      }),
    ).toEqual({ ok: true, data: { id: book.id } });
    expect(await findBook(owner.id, book.id, db)).toMatchObject({
      title: "New",
      author: null,
    });
    expect(await findBook(intruder.id, book.id, db)).toBeUndefined();
  });

  it("answers another reader's book exactly like a missing one, and leaves it alone", async () => {
    const { owner, intruder } = await create();
    const book = await seedBook(owner.id, { title: "Mine", author: null }, db);
    signIn(intruder);

    const onForeign = await updateBook(book.id, { title: "Taken" });
    const onMissing = await updateBook(randomUUID(), { title: "Taken" });

    expect(onForeign).toEqual({ ok: false, errorKey: "notFound" });
    expect(onMissing).toEqual(onForeign);
    expect(await findBook(owner.id, book.id, db)).toEqual(book);
  });

  it.each([
    ["not a uuid", "not-a-uuid"],
    ["an injection", "1' or '1'='1"],
    ["a number", 42],
    ["an object", { id: randomUUID() }],
    ["nothing", undefined],
  ])(
    "answers %s as the id like a missing book, without a query",
    async (_name, bookId) => {
      const { owner } = await create();
      signIn(owner);
      const transaction = vi.spyOn(db, "transaction");

      expect(await updateBook(bookId, { title: "t" })).toEqual({
        ok: false,
        errorKey: "notFound",
      });
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no title", {}, "titleRequired", "title"],
    ["a long title", { title: "a".repeat(201) }, "titleTooLong", "title"],
    ["a line break", { title: "a\nb" }, "invalidCharacters", "title"],
    ["not an object", "New", "titleRequired", "title"],
  ])(
    "answers %s with an error key, before the session, and writes nothing",
    async (_name, input, errorKey, field) => {
      const { owner } = await create();
      const book = await seedBook(
        owner.id,
        { title: "Kept", author: null },
        db,
      );
      signIn(owner);

      expect(await updateBook(book.id, input)).toEqual({
        ok: false,
        errorKey,
        field,
      });
      expect(mocks.requireUser).not.toHaveBeenCalled();
      expect(await findBook(owner.id, book.id, db)).toEqual(book);
    },
  );

  it("stops a reader after 30 edits a minute", async () => {
    const { owner } = await create();
    const book = await seedBook(owner.id, { title: "Busy", author: null }, db);
    signIn(owner);

    for (let i = 0; i < 30; i += 1) {
      expect(await updateBook(book.id, { title: `Edit ${i}` })).toMatchObject({
        ok: true,
      });
    }
    expect(await updateBook(book.id, { title: "One too many" })).toEqual({
      ok: false,
      errorKey: "updateRateLimited",
    });
    expect(await findBook(owner.id, book.id, db)).toMatchObject({
      title: "Edit 29",
    });
  });

  it("answers a database failure with a generic key and logs no content", async () => {
    const { owner } = await create();
    signIn(owner);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "transaction").mockRejectedValueOnce(
      Object.assign(new Error('update "Secret Title" failed'), {
        code: "XX000",
      }),
    );

    expect(await updateBook(randomUUID(), { title: "Secret Title" })).toEqual({
      ok: false,
      errorKey: "updateFailed",
    });
    expect(error).toHaveBeenCalledWith("books.update failed", {
      code: "XX000",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("Secret Title");
  });
});

describe("deleteBook Server Action", () => {
  const { create } = useReaders(db, "book-delete-action.test");

  beforeEach(() => {
    mocks.requireUser.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("is refused without a session and deletes nothing", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    const transaction = vi.spyOn(db, "transaction");

    await expect(deleteBook(randomUUID())).rejects.toThrow(
      "NEXT_REDIRECT /login",
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("deletes the reader's book", async () => {
    const { owner } = await create();
    const book = await seedBook(owner.id, { title: "Gone", author: null }, db);
    signIn(owner);

    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    expect(await deleteBook(book.id)).toEqual({ ok: true });
    expect(await findBook(owner.id, book.id, db)).toBeUndefined();
    // A security event with ids only, never the title.
    expect(info).toHaveBeenCalledOnce();
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
      event: "books.deleted",
      userId: owner.id,
      bookId: book.id,
      at: expect.any(String),
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("Gone");
    expect(await deleteBook(book.id)).toEqual({
      ok: false,
      errorKey: "notFound",
    });
  });

  it("answers another reader's book exactly like a missing one, and keeps it", async () => {
    const { owner, intruder } = await create();
    const book = await seedBook(owner.id, { title: "Mine", author: null }, db);
    signIn(intruder);

    const onForeign = await deleteBook(book.id);
    const onMissing = await deleteBook(randomUUID());

    expect(onForeign).toEqual({ ok: false, errorKey: "notFound" });
    expect(onMissing).toEqual(onForeign);
    expect(await findBook(owner.id, book.id, db)).toEqual(book);
  });

  it.each([
    ["not a uuid", "not-a-uuid"],
    ["an injection", "1' or '1'='1"],
    ["a number", 42],
    ["an array", [randomUUID()]],
    ["nothing", undefined],
  ])(
    "answers %s as the id like a missing book, without a query",
    async (_name, bookId) => {
      const { owner } = await create();
      signIn(owner);
      const transaction = vi.spyOn(db, "transaction");

      expect(await deleteBook(bookId)).toEqual({
        ok: false,
        errorKey: "notFound",
      });
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it("stops a reader after 20 deletions a minute", async () => {
    const { owner } = await create();
    signIn(owner);

    for (let i = 0; i < 20; i += 1) {
      expect(await deleteBook(randomUUID())).toEqual({
        ok: false,
        errorKey: "notFound",
      });
    }
    const book = await seedBook(
      owner.id,
      { title: "Spared", author: null },
      db,
    );
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await deleteBook(book.id)).toEqual({
      ok: false,
      errorKey: "rateLimited",
    });
    expect(JSON.parse(info.mock.calls[0][0] as string)).toMatchObject({
      event: "books.delete_rate_limited",
      userId: owner.id,
      bookId: book.id,
    });
    expect(await findBook(owner.id, book.id, db)).toEqual(book);
  });

  it("answers a database failure with a generic key", async () => {
    const { owner } = await create();
    signIn(owner);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "transaction").mockRejectedValueOnce(
      Object.assign(new Error("delete failed"), { code: "XX000" }),
    );

    expect(await deleteBook(randomUUID())).toEqual({
      ok: false,
      errorKey: "failed",
    });
    expect(error).toHaveBeenCalledWith("books.delete failed", {
      code: "XX000",
    });
  });
});

describe("write quota", () => {
  const { create } = useReaders(db, "write-quota.test");

  it("counts per reader and action, and opens a new window when the old one ends", async () => {
    const { owner, intruder } = await create();
    const quota = { action: "test.write", limit: 2, windowSeconds: 1 };

    expect(await consumeWriteQuota(owner.id, quota, db)).toBe(true);
    expect(await consumeWriteQuota(owner.id, quota, db)).toBe(true);
    expect(await consumeWriteQuota(owner.id, quota, db)).toBe(false);
    // Another action and another reader have their own counters.
    expect(
      await consumeWriteQuota(owner.id, { ...quota, action: "test.other" }, db),
    ).toBe(true);
    expect(await consumeWriteQuota(intruder.id, quota, db)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await consumeWriteQuota(owner.id, quota, db)).toBe(true);
  });

  it("does not let concurrent calls slip past the limit", async () => {
    const { owner } = await create();
    const quota = { action: "test.burst", limit: 5, windowSeconds: 60 };

    const results = await Promise.all(
      Array.from({ length: 12 }, () => consumeWriteQuota(owner.id, quota, db)),
    );

    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("refuses to run without a userId", async () => {
    await expect(
      consumeWriteQuota(
        "",
        { action: "test.write", limit: 1, windowSeconds: 1 },
        db,
      ),
    ).rejects.toThrow("repository called without a userId");
  });
});

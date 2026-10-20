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
import { findBook } from "@/server/repositories/books";
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

import { createBook } from "@/server/actions/books";

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

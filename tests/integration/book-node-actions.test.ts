import { randomUUID } from "node:crypto";

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
import {
  addNodes as seedNodes,
  listNodes,
} from "@/server/repositories/book-nodes";
import { createBook } from "@/server/repositories/books";

import { requireTestEnv } from "./db-env";
import { useReaders } from "./isolation/two-readers";

// The book structure Server Actions called directly, as an attacker posting to them would (US-010):
// no page, no form, any payload. The session is mocked; everything below it (quota, repository,
// RLS) is the real code against Postgres with the app role.

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/db/client", () => ({ getDb: () => db }));

import { addNodes, deleteNode, renameNode } from "@/server/actions/book-nodes";

afterAll(() => pool.end());

function signIn(reader: { id: string; email: string }) {
  mocks.requireUser.mockResolvedValue({
    id: reader.id,
    name: "reader",
    email: reader.email,
    image: null,
  });
}

async function bookWithChapter(ownerId: string) {
  const book = await createBook(ownerId, { title: "Book", author: null }, db);
  const added = await seedNodes(
    ownerId,
    { bookId: book.id, parentId: null, kind: "chapter", titles: ["Chapter"] },
    db,
  );
  if (!added.ok) throw new Error(`seed failed: ${added.reason}`);
  return { bookId: book.id, nodeId: added.ids[0] };
}

const MALFORMED_IDS = [
  ["not a uuid", "not-a-uuid"],
  ["an injection", "1' or '1'='1"],
  ["a number", 42],
  ["an object", { id: randomUUID() }],
  ["nothing", undefined],
] as const;

describe("book structure Server Actions", () => {
  const { create } = useReaders(db, "book-node-actions.test");

  beforeEach(() => {
    mocks.requireUser.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("are refused without a session and touch nothing", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    const transaction = vi.spyOn(db, "transaction");

    for (const call of [
      () => addNodes(randomUUID(), null, { kind: "chapter", titles: "A" }),
      () => renameNode(randomUUID(), { title: "A" }),
      () => deleteNode(randomUUID()),
    ]) {
      await expect(call()).rejects.toThrow("NEXT_REDIRECT /login");
    }
    expect(transaction).not.toHaveBeenCalled();
  });

  it("adds the pasted titles at the book's root and under a node", async () => {
    const { owner } = await create();
    const { bookId } = await bookWithChapter(owner.id);
    signIn(owner);

    expect(
      await addNodes(bookId, null, {
        kind: "part",
        titles: " Part I \n\n Part II ",
        ownerId: "someone-else",
      }),
    ).toEqual({ ok: true, data: { count: 2 } });
    const part = (await listNodes(owner.id, bookId, db)).find(
      (node) => node.title === "Part I",
    );
    expect(
      await addNodes(bookId, part?.id, { kind: "chapter", titles: "One\nTwo" }),
    ).toEqual({ ok: true, data: { count: 2 } });

    expect(
      (await listNodes(owner.id, bookId, db)).map((node) => node.title).sort(),
    ).toEqual(["Chapter", "One", "Part I", "Part II", "Two"]);
  });

  it("answers another reader's book or node exactly like a missing one, and writes nothing", async () => {
    const { owner, intruder } = await create();
    const owned = await bookWithChapter(owner.id);
    const before = await listNodes(owner.id, owned.bookId, db);
    signIn(intruder);

    const answers = [
      await addNodes(owned.bookId, null, { kind: "chapter", titles: "X" }),
      await addNodes(randomUUID(), null, { kind: "chapter", titles: "X" }),
      await addNodes(owned.bookId, owned.nodeId, {
        kind: "topic",
        titles: "X",
      }),
      await addNodes(randomUUID(), randomUUID(), {
        kind: "topic",
        titles: "X",
      }),
      await renameNode(owned.nodeId, { title: "Taken" }),
      await renameNode(randomUUID(), { title: "Taken" }),
      await deleteNode(owned.nodeId),
      await deleteNode(randomUUID()),
    ];

    for (const answer of answers) {
      expect(answer).toEqual({ ok: false, errorKey: "notFound" });
    }
    expect(await listNodes(owner.id, owned.bookId, db)).toEqual(before);
  });

  it("refuses a node out of place", async () => {
    const { owner } = await create();
    const { bookId, nodeId } = await bookWithChapter(owner.id);
    signIn(owner);

    expect(
      await addNodes(bookId, null, { kind: "topic", titles: "T" }),
    ).toEqual({
      ok: false,
      errorKey: "invalidPlacement",
    });
    expect(
      await addNodes(bookId, nodeId, { kind: "part", titles: "P" }),
    ).toEqual({
      ok: false,
      errorKey: "invalidPlacement",
    });
  });

  it.each(MALFORMED_IDS)(
    "answers %s as an id like a missing book or node, without a query",
    async (_name, id) => {
      const { owner } = await create();
      signIn(owner);
      const transaction = vi.spyOn(db, "transaction");

      for (const answer of [
        await addNodes(id, null, { kind: "chapter", titles: "A" }),
        await addNodes(randomUUID(), id ?? "", { kind: "topic", titles: "A" }),
        await renameNode(id, { title: "A" }),
        await deleteNode(id),
      ]) {
        expect(answer).toEqual({ ok: false, errorKey: "notFound" });
      }
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "no titles",
      { kind: "chapter", titles: "\n \n" },
      "titlesRequired",
      "titles",
    ],
    [
      "too many titles",
      { kind: "chapter", titles: Array(101).fill("C").join("\n") },
      "tooManyTitles",
      "titles",
    ],
    [
      "a title over the limit",
      { kind: "chapter", titles: "a".repeat(201) },
      "titleTooLong",
      "titles",
    ],
    [
      "an unknown kind",
      { kind: "book", titles: "A" },
      "invalidPlacement",
      "kind",
    ],
    ["not an object", "A", "titlesRequired", "titles"],
  ])(
    "answers an addition with %s before reading the session",
    async (_name, input, errorKey, field) => {
      expect(await addNodes(randomUUID(), null, input)).toEqual({
        ok: false,
        errorKey,
        field,
      });
      expect(mocks.requireUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a blank title", { title: " " }, "titleRequired"],
    ["a long title", { title: "a".repeat(201) }, "titleTooLong"],
    ["a line break", { title: "a\nb" }, "invalidCharacters"],
    ["not an object", null, "titleRequired"],
  ])(
    "answers a rename with %s before reading the session",
    async (_name, input, errorKey) => {
      expect(await renameNode(randomUUID(), input)).toEqual({
        ok: false,
        errorKey,
        field: "title",
      });
      expect(mocks.requireUser).not.toHaveBeenCalled();
    },
  );

  it("renames the reader's node", async () => {
    const { owner } = await create();
    const { bookId, nodeId } = await bookWithChapter(owner.id);
    signIn(owner);

    expect(await renameNode(nodeId, { title: "  Renamed " })).toEqual({
      ok: true,
    });
    expect(await listNodes(owner.id, bookId, db)).toMatchObject([
      { id: nodeId, title: "Renamed" },
    ]);
  });

  it("deletes the reader's node and logs the event without its title", async () => {
    const { owner } = await create();
    const { bookId, nodeId } = await bookWithChapter(owner.id);
    signIn(owner);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    expect(await deleteNode(nodeId)).toEqual({ ok: true });

    expect(await listNodes(owner.id, bookId, db)).toEqual([]);
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
      event: "structure.node_deleted",
      userId: owner.id,
      nodeId,
      at: expect.any(String),
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("Chapter");
  });

  it.each([
    [
      "additions",
      30,
      (bookId: string) =>
        addNodes(bookId, null, { kind: "chapter", titles: "C" }),
    ],
    [
      "renames",
      60,
      (_bookId: string, nodeId: string) => renameNode(nodeId, { title: "R" }),
    ],
    ["deletions", 30, () => deleteNode(randomUUID())],
  ] as const)(
    "stops a reader past the quota of %s a minute",
    async (_name, limit, call) => {
      const { owner } = await create();
      const { bookId, nodeId } = await bookWithChapter(owner.id);
      signIn(owner);

      for (let i = 0; i < limit; i += 1) {
        expect(await call(bookId, nodeId)).not.toEqual({
          ok: false,
          errorKey: "rateLimited",
        });
      }
      expect(await call(bookId, nodeId)).toEqual({
        ok: false,
        errorKey: "rateLimited",
      });
    },
  );

  it("answers a database failure with a generic key and logs no content", async () => {
    const { owner } = await create();
    signIn(owner);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "transaction").mockRejectedValue(
      Object.assign(new Error('insert "Secret Title" failed'), {
        code: "XX000",
      }),
    );

    expect(
      await addNodes(randomUUID(), null, {
        kind: "chapter",
        titles: "Secret Title",
      }),
    ).toEqual({ ok: false, errorKey: "failed" });
    expect(await renameNode(randomUUID(), { title: "Secret Title" })).toEqual({
      ok: false,
      errorKey: "failed",
    });
    expect(await deleteNode(randomUUID())).toEqual({
      ok: false,
      errorKey: "failed",
    });
    expect(error.mock.calls.map((call) => call[0])).toEqual([
      "structure.create failed",
      "structure.rename failed",
      "structure.delete failed",
    ]);
    expect(JSON.stringify(error.mock.calls)).not.toContain("Secret Title");
  });
});

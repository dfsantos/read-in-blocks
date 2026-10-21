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

import {
  addNodes,
  completeAll,
  deleteNode,
  moveNode,
  setReadingDates,
  setReadingStatus,
  updateNode,
} from "@/server/actions/book-nodes";
import { calendarDay } from "@/domain/reading/status";

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
      () => updateNode(randomUUID(), { title: "A" }),
      () => deleteNode(randomUUID()),
      () => moveNode(randomUUID(), { parentId: null, index: 0 }),
      () => setReadingStatus(randomUUID(), { status: "completed" }),
      () => setReadingDates(randomUUID(), { startedAt: "2026-10-01" }),
      () => completeAll(randomUUID()),
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
      await updateNode(owned.nodeId, { title: "Taken" }),
      await updateNode(randomUUID(), { title: "Taken" }),
      await deleteNode(owned.nodeId),
      await deleteNode(randomUUID()),
      await moveNode(owned.nodeId, { parentId: null, index: 0 }),
      await moveNode(randomUUID(), { parentId: null, index: 0 }),
      await setReadingStatus(owned.nodeId, { status: "completed" }),
      await setReadingStatus(randomUUID(), { status: "completed" }),
      await setReadingDates(owned.nodeId, { startedAt: "", completedAt: "" }),
      await setReadingDates(randomUUID(), { startedAt: "", completedAt: "" }),
      await completeAll(owned.nodeId),
      await completeAll(randomUUID()),
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
        await updateNode(id, { title: "A" }),
        await deleteNode(id),
        await moveNode(id, { parentId: null, index: 0 }),
        await setReadingStatus(id, { status: "completed" }),
        await setReadingDates(id, { startedAt: "", completedAt: "" }),
        await moveNode(randomUUID(), { parentId: id ?? "", index: 0 }),
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
    ["a blank title", { title: " " }, "titleRequired", "title"],
    ["a long title", { title: "a".repeat(201) }, "titleTooLong", "title"],
    [
      "a line break in the title",
      { title: "a\nb" },
      "invalidCharacters",
      "title",
    ],
    [
      "a long summary",
      { title: "t", summary: "a".repeat(1001) },
      "summaryTooLong",
      "summary",
    ],
    ["a zero goal", { title: "t", goalPages: 0 }, "goalInvalid", "goalPages"],
    [
      "a fractional goal",
      { title: "t", goalPages: "1.5" },
      "goalInvalid",
      "goalPages",
    ],
    ["a huge goal", { title: "t", goalPages: 1e9 }, "goalInvalid", "goalPages"],
    ["not an object", null, "titleRequired", "title"],
  ])(
    "answers an update with %s before reading the session",
    async (_name, input, errorKey, field) => {
      expect(await updateNode(randomUUID(), input)).toEqual({
        ok: false,
        errorKey,
        field,
      });
      expect(mocks.requireUser).not.toHaveBeenCalled();
    },
  );

  it("updates the reader's node, its summary and goal included", async () => {
    const { owner } = await create();
    const { bookId, nodeId } = await bookWithChapter(owner.id);
    signIn(owner);

    expect(
      await updateNode(nodeId, {
        title: "  Renamed ",
        summary: " Sobre o capítulo ",
        goalPages: "42",
        ownerId: "someone-else",
      }),
    ).toEqual({ ok: true });
    expect(await listNodes(owner.id, bookId, db)).toMatchObject([
      {
        id: nodeId,
        title: "Renamed",
        summary: "Sobre o capítulo",
        goalPages: 42,
      },
    ]);

    // Clearing the form fields clears the summary and the goal.
    expect(
      await updateNode(nodeId, {
        title: "Renamed",
        summary: "",
        goalPages: "",
      }),
    ).toEqual({ ok: true });
    expect(await listNodes(owner.id, bookId, db)).toMatchObject([
      { id: nodeId, summary: null, goalPages: null },
    ]);
  });

  it("moves the reader's chapter into a part", async () => {
    const { owner } = await create();
    const { bookId, nodeId } = await bookWithChapter(owner.id);
    signIn(owner);
    await addNodes(bookId, null, { kind: "part", titles: "Parte" });
    const part = (await listNodes(owner.id, bookId, db)).find(
      (node) => node.kind === "part",
    );

    expect(await moveNode(nodeId, { parentId: part?.id, index: 0 })).toEqual({
      ok: true,
    });
    expect(await listNodes(owner.id, bookId, db)).toContainEqual(
      expect.objectContaining({ id: nodeId, parentId: part?.id, position: 0 }),
    );
    expect(await moveNode(nodeId, { parentId: nodeId, index: 0 })).toEqual({
      ok: false,
      errorKey: "invalidPlacement",
    });
  });

  it("refuses to move the reader's chapter under another reader's part", async () => {
    const { owner, intruder } = await create();
    const victim = await bookWithChapter(owner.id);
    signIn(owner);
    await addNodes(victim.bookId, null, { kind: "part", titles: "Parte" });
    const victimPart = (await listNodes(owner.id, victim.bookId, db)).find(
      (node) => node.kind === "part",
    );
    const own = await bookWithChapter(intruder.id);
    signIn(intruder);

    expect(
      await moveNode(own.nodeId, { parentId: victimPart?.id, index: 0 }),
    ).toEqual({
      ok: false,
      errorKey: "notFound",
    });
    expect(await listNodes(intruder.id, own.bookId, db)).toMatchObject([
      { id: own.nodeId, parentId: null },
    ]);
  });

  it.each([
    ["an index as text", { parentId: null, index: "0" }],
    ["a negative index", { parentId: null, index: -1 }],
    ["no destination", {}],
    ["not an object", "up"],
  ])(
    "answers a move with %s like a missing destination",
    async (_name, input) => {
      const { owner } = await create();
      const { nodeId } = await bookWithChapter(owner.id);
      signIn(owner);

      expect(await moveNode(nodeId, input)).toEqual({
        ok: false,
        errorKey: "notFound",
      });
    },
  );

  it("marks the reader's leaf completed today, in the app's time zone", async () => {
    const { owner } = await create();
    const { bookId, nodeId } = await bookWithChapter(owner.id);
    signIn(owner);
    const before = calendarDay(new Date(), "America/Sao_Paulo");

    expect(await setReadingStatus(nodeId, { status: "completed" })).toEqual({
      ok: true,
    });

    const after = calendarDay(new Date(), "America/Sao_Paulo");
    const [node] = await listNodes(owner.id, bookId, db);
    expect(node.status).toBe("completed");
    // The day may only turn over during the call itself.
    expect([before, after]).toContain(node.startedAt);
    expect(node.completedAt).toBe(node.startedAt);
  });

  it("completes everything under the reader's chapter today, and refuses a leaf", async () => {
    const { owner } = await create();
    const { bookId, nodeId } = await bookWithChapter(owner.id);
    signIn(owner);
    expect(
      await addNodes(bookId, nodeId, { kind: "topic", titles: "A\nB" }),
    ).toEqual({ ok: true, data: { count: 2 } });
    const before = calendarDay(new Date(), "America/Sao_Paulo");

    expect(await completeAll(nodeId)).toEqual({
      ok: true,
      data: { completed: 2 },
    });

    const after = calendarDay(new Date(), "America/Sao_Paulo");
    const topics = (await listNodes(owner.id, bookId, db)).filter(
      (node) => node.parentId === nodeId,
    );
    expect(topics.map((node) => node.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect([before, after]).toContain(topics[0].completedAt);
    expect(await completeAll(topics[0].id)).toEqual({
      ok: false,
      errorKey: "notParent",
    });
  });

  it.each(MALFORMED_IDS)(
    'answers "complete all" on %s like a missing node',
    async (_name, id) => {
      const { owner } = await create();
      signIn(owner);

      expect(await completeAll(id)).toEqual({
        ok: false,
        errorKey: "notFound",
      });
    },
  );

  it.each([
    ["an unknown state", { status: "done" }],
    ["no state", {}],
    ["not an object", "completed"],
  ])(
    "answers a state change with %s like a missing node",
    async (_name, input) => {
      const { owner } = await create();
      const { nodeId } = await bookWithChapter(owner.id);
      signIn(owner);

      expect(await setReadingStatus(nodeId, input)).toEqual({
        ok: false,
        errorKey: "notFound",
      });
    },
  );

  it("logs a past reading and refuses dates after today or out of order", async () => {
    const { owner } = await create();
    const { bookId, nodeId } = await bookWithChapter(owner.id);
    signIn(owner);
    await setReadingStatus(nodeId, { status: "completed" });

    expect(
      await setReadingDates(nodeId, {
        startedAt: "2025-01-10",
        completedAt: "2025-02-01",
      }),
    ).toEqual({ ok: true });
    expect(await listNodes(owner.id, bookId, db)).toMatchObject([
      { startedAt: "2025-01-10", completedAt: "2025-02-01" },
    ]);
    expect(
      await setReadingDates(nodeId, {
        startedAt: "2025-01-10",
        completedAt: "2999-01-01",
      }),
    ).toEqual({ ok: false, errorKey: "dateInFuture", field: "completedAt" });
    expect(
      await setReadingDates(nodeId, {
        startedAt: "2025-03-01",
        completedAt: "2025-02-01",
      }),
    ).toEqual({ ok: false, errorKey: "datesOutOfOrder", field: "completedAt" });
    expect(
      await setReadingDates(nodeId, {
        startedAt: "2025-02-30",
        completedAt: "",
      }),
    ).toEqual({ ok: false, errorKey: "dateInvalid", field: "startedAt" });
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
      "updates",
      60,
      (_bookId: string, nodeId: string) => updateNode(nodeId, { title: "R" }),
    ],
    ["deletions", 30, () => deleteNode(randomUUID())],
    [
      "state changes",
      60,
      (_bookId: string, nodeId: string) =>
        setReadingStatus(nodeId, { status: "in_progress" }),
    ],
    [
      "moves",
      60,
      (_bookId: string, nodeId: string) =>
        moveNode(nodeId, { parentId: null, index: 0 }),
    ],
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
    expect(await updateNode(randomUUID(), { title: "Secret Title" })).toEqual({
      ok: false,
      errorKey: "failed",
    });
    expect(await deleteNode(randomUUID())).toEqual({
      ok: false,
      errorKey: "failed",
    });
    expect(await moveNode(randomUUID(), { parentId: null, index: 0 })).toEqual({
      ok: false,
      errorKey: "failed",
    });
    expect(
      await setReadingStatus(randomUUID(), { status: "completed" }),
    ).toEqual({
      ok: false,
      errorKey: "failed",
    });
    expect(await setReadingDates(randomUUID(), {})).toEqual({
      ok: false,
      errorKey: "failed",
    });
    expect(error.mock.calls.map((call) => call[0])).toEqual([
      "structure.create failed",
      "structure.update failed",
      "structure.delete failed",
      "structure.move failed",
      "reading.status failed",
      "reading.dates failed",
    ]);
    expect(JSON.stringify(error.mock.calls)).not.toContain("Secret Title");
  });
});

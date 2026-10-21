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
import { addNodes } from "@/server/repositories/book-nodes";
import { createBook } from "@/server/repositories/books";
import { createNote as seedNote, listNotes } from "@/server/repositories/notes";

import { requireTestEnv } from "./db-env";
import { useReaders } from "./isolation/two-readers";

// The notebook Server Actions called directly, as an attacker posting to them would (US-018): no
// page, no form, any payload. The session is mocked; everything below it (quota, repository, RLS)
// is the real code against Postgres with the app role.

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/db/client", () => ({ getDb: () => db }));

import { createNote, deleteNote, updateNote } from "@/server/actions/notes";

afterAll(() => pool.end());

function signIn(reader: { id: string; email: string }) {
  mocks.requireUser.mockResolvedValue({
    id: reader.id,
    name: "reader",
    email: reader.email,
    image: null,
  });
}

async function chapterWithNote(ownerId: string) {
  const book = await createBook(ownerId, { title: "Book", author: null }, db);
  const added = await addNodes(
    ownerId,
    { bookId: book.id, parentId: null, kind: "chapter", titles: ["Chapter"] },
    db,
  );
  if (!added.ok) throw new Error(`seed failed: ${added.reason}`);
  const note = await seedNote(ownerId, added.ids[0], "Owned note", db);
  if (!note.ok) throw new Error(`seed failed: ${note.reason}`);
  return { nodeId: added.ids[0], noteId: note.id };
}

const MALFORMED_IDS = [
  ["not a uuid", "not-a-uuid"],
  ["an injection", "1' or '1'='1"],
  ["a number", 42],
  ["an object", { id: randomUUID() }],
  ["nothing", undefined],
] as const;

describe("notebook Server Actions", () => {
  const { create } = useReaders(db, "note-actions.test");

  beforeEach(() => {
    mocks.requireUser.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("are refused without a session and touch nothing", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    const transaction = vi.spyOn(db, "transaction");

    for (const call of [
      () => createNote(randomUUID(), { body: "A" }),
      () => updateNote(randomUUID(), { body: "A" }),
      () => deleteNote(randomUUID()),
    ]) {
      await expect(call()).rejects.toThrow("NEXT_REDIRECT /login");
    }
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates, edits and deletes the reader's notes", async () => {
    const { owner } = await create();
    const { nodeId, noteId } = await chapterWithNote(owner.id);
    signIn(owner);

    expect(await createNote(nodeId, { body: "  Segunda\nlinha  " })).toEqual({
      ok: true,
    });
    expect(await updateNote(noteId, { body: "Primeira, revista" })).toEqual({
      ok: true,
    });
    expect(
      (await listNotes(owner.id, nodeId, db)).map((note) => note.body),
    ).toEqual(["Primeira, revista", "Segunda\nlinha"]);

    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await deleteNote(noteId)).toEqual({ ok: true });
    expect(
      (await listNotes(owner.id, nodeId, db)).map((note) => note.body),
    ).toEqual(["Segunda\nlinha"]);
    // A security event with ids only, never the note's text.
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
      event: "notes.note_deleted",
      userId: owner.id,
      noteId,
      at: expect.any(String),
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("Primeira");
  });

  it("answers another reader's node or note like a missing one, and changes nothing", async () => {
    const { owner, intruder } = await create();
    const { nodeId, noteId } = await chapterWithNote(owner.id);
    signIn(intruder);

    const notFound = { ok: false, errorKey: "notFound" };
    expect(await createNote(nodeId, { body: "Intruder" })).toEqual(notFound);
    expect(await createNote(randomUUID(), { body: "Intruder" })).toEqual(
      notFound,
    );
    expect(await updateNote(noteId, { body: "Taken" })).toEqual(notFound);
    expect(await updateNote(randomUUID(), { body: "Taken" })).toEqual(notFound);
    expect(await deleteNote(noteId)).toEqual(notFound);
    expect(await deleteNote(randomUUID())).toEqual(notFound);

    expect(
      (await listNotes(owner.id, nodeId, db)).map((note) => note.body),
    ).toEqual(["Owned note"]);
  });

  it.each(MALFORMED_IDS)(
    "answers %s as an id like a missing resource",
    async (_name, id) => {
      const { owner } = await create();
      signIn(owner);

      const notFound = { ok: false, errorKey: "notFound" };
      expect(await createNote(id, { body: "A" })).toEqual(notFound);
      expect(await updateNote(id, { body: "A" })).toEqual(notFound);
      expect(await deleteNote(id)).toEqual(notFound);
    },
  );

  it.each([
    ["an empty body", { body: "  " }, "bodyRequired"],
    ["no body", {}, "bodyRequired"],
    ["not an object", "text", "bodyRequired"],
    ["a body that is not text", { body: ["a"] }, "bodyRequired"],
    ["a body over the limit", { body: "a".repeat(10_001) }, "bodyTooLong"],
    ["a control character", { body: "a\u0000b" }, "invalidCharacters"],
    ["a bidirectional override", { body: "a‮b" }, "invalidCharacters"],
  ])("refuses %s before touching the database", async (_name, input, key) => {
    const { owner } = await create();
    const { nodeId, noteId } = await chapterWithNote(owner.id);
    signIn(owner);
    const transaction = vi.spyOn(db, "transaction");

    const refused = { ok: false, errorKey: key, field: "body" };
    expect(await createNote(nodeId, input)).toEqual(refused);
    expect(await updateNote(noteId, input)).toEqual(refused);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["additions", 30, (nodeId: string) => createNote(nodeId, { body: "N" })],
    [
      "updates",
      60,
      (_nodeId: string, noteId: string) => updateNote(noteId, { body: "U" }),
    ],
    ["deletions", 30, () => deleteNote(randomUUID())],
  ] as const)(
    "stops a reader past the quota of %s a minute",
    async (_name, limit, call) => {
      const { owner } = await create();
      const { nodeId, noteId } = await chapterWithNote(owner.id);
      signIn(owner);

      for (let i = 0; i < limit; i += 1) {
        expect(await call(nodeId, noteId)).not.toEqual({
          ok: false,
          errorKey: "rateLimited",
        });
      }
      expect(await call(nodeId, noteId)).toEqual({
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
      Object.assign(new Error('insert "Secret Note" failed'), {
        code: "XX000",
      }),
    );

    const failed = { ok: false, errorKey: "failed" };
    expect(await createNote(randomUUID(), { body: "Secret Note" })).toEqual(
      failed,
    );
    expect(await updateNote(randomUUID(), { body: "Secret Note" })).toEqual(
      failed,
    );
    expect(await deleteNote(randomUUID())).toEqual(failed);
    expect(error.mock.calls.map((call) => call[0])).toEqual([
      "notes.create failed",
      "notes.update failed",
      "notes.delete failed",
    ]);
    expect(JSON.stringify(error.mock.calls)).not.toContain("Secret");
  });
});

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { MAX_NOTES_PER_NODE } from "@/domain/notes/note-input";
import { addNodes, deleteNode } from "@/server/repositories/book-nodes";
import { createBook, deleteBook } from "@/server/repositories/books";
import {
  countLibraryNotes,
  countNotesByNode,
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from "@/server/repositories/notes";

import { requireTestEnv } from "../db-env";
import {
  describeIsolation,
  useReaders,
  type IsolationSpec,
} from "./two-readers";

// The notebook repository (US-018) against Postgres with the app role: two-reader isolation, its own
// behaviour, the database's last line of rules and the cascades of D-09.

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });
const migrator = new Pool({
  connectionString: requireTestEnv("TEST_MIGRATOR_DATABASE_URL"),
  max: 1,
});

afterAll(async () => {
  await pool.end();
  await migrator.end();
});

async function seedChapter(ownerId: string, titles = ["Chapter"]) {
  const book = await createBook(ownerId, { title: "Owned", author: null }, db);
  const added = await addNodes(
    ownerId,
    { bookId: book.id, parentId: null, kind: "chapter", titles },
    db,
  );
  if (!added.ok) throw new Error(`seed failed: ${added.reason}`);
  return { bookId: book.id, nodeIds: added.ids };
}

type Owned = { bookId: string; nodeId: string; noteId: string };

async function seedNote(ownerId: string): Promise<Owned> {
  const { bookId, nodeIds } = await seedChapter(ownerId);
  const created = await createNote(ownerId, nodeIds[0], "Owned note", db);
  if (!created.ok) throw new Error(`seed failed: ${created.reason}`);
  return { bookId, nodeId: nodeIds[0], noteId: created.id };
}

const notesSpec: IsolationSpec<Owned> = {
  seed: seedNote,
  missing: () => ({
    bookId: randomUUID(),
    nodeId: randomUUID(),
    noteId: randomUUID(),
  }),
  snapshot: (ownerId, owned) => listNotes(ownerId, owned.nodeId, db),
  contains: (result, owned) =>
    JSON.stringify(result ?? null).includes(owned.noteId) ||
    JSON.stringify(result ?? null).includes(owned.nodeId),
  operations: {
    list: (userId, target) => listNotes(userId, target.nodeId, db),
    count: (userId, target) => countNotesByNode(userId, target.bookId, db),
    // Every note of the session's reader: the target is never asked for.
    countLibrary: (userId) => countLibraryNotes(userId, db),
    // Into another reader's node's notebook.
    create: (userId, target) =>
      createNote(userId, target.nodeId, "Intruder", db),
    update: (userId, target) => updateNote(userId, target.noteId, "Taken", db),
    delete: (userId, target) => deleteNote(userId, target.noteId, db),
  },
};

describeIsolation(db, "notes", notesSpec);

describe("notebook repository", () => {
  const { create } = useReaders(db, "notes-repository.test");

  it("lists a node's notes in chronological order, only that node's", async () => {
    const { owner } = await create();
    const { nodeIds } = await seedChapter(owner.id, ["One", "Two"]);
    for (const body of ["first", "second", "third"]) {
      await createNote(owner.id, nodeIds[0], body, db);
    }
    await createNote(owner.id, nodeIds[1], "elsewhere", db);

    const notes = await listNotes(owner.id, nodeIds[0], db);
    expect(notes.map((note) => note.body)).toEqual([
      "first",
      "second",
      "third",
    ]);
    for (const note of notes) {
      expect(note.createdAt).toBeInstanceOf(Date);
      expect(note.updatedAt).toEqual(note.createdAt);
    }
  });

  it("counts each node's notes in the book, leaving out nodes without notes", async () => {
    const { owner } = await create();
    const { bookId, nodeIds } = await seedChapter(owner.id, ["A", "B", "C"]);
    await createNote(owner.id, nodeIds[0], "a1", db);
    await createNote(owner.id, nodeIds[0], "a2", db);
    await createNote(owner.id, nodeIds[2], "c1", db);
    // Another book of the same reader does not count.
    const other = await seedChapter(owner.id);
    await createNote(owner.id, other.nodeIds[0], "x", db);

    expect(await countNotesByNode(owner.id, bookId, db)).toEqual({
      [nodeIds[0]]: 2,
      [nodeIds[2]]: 1,
    });
  });

  it("updates a note's text and its edit time, keeping its creation time", async () => {
    const { owner } = await create();
    const { nodeId, noteId } = await seedNote(owner.id);
    const [before] = await listNotes(owner.id, nodeId, db);

    expect(await updateNote(owner.id, noteId, "Changed", db)).toBe(true);

    const [after] = await listNotes(owner.id, nodeId, db);
    expect(after.body).toBe("Changed");
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before.updatedAt.getTime(),
    );
  });

  it("deletes a note", async () => {
    const { owner } = await create();
    const { nodeId, noteId } = await seedNote(owner.id);

    expect(await deleteNote(owner.id, noteId, db)).toBe(true);
    expect(await deleteNote(owner.id, noteId, db)).toBe(false);
    expect(await listNotes(owner.id, nodeId, db)).toEqual([]);
  });

  it("answers a missing node as not found", async () => {
    const { owner } = await create();

    expect(await createNote(owner.id, randomUUID(), "x", db)).toEqual({
      ok: false,
      reason: "notFound",
    });
  });

  it("refuses a note over the per-node limit", async () => {
    const { owner } = await create();
    const { bookId, nodeIds } = await seedChapter(owner.id);
    // Seeded as the migrator (the table's owner, not subject to RLS).
    await migrator.query(
      `insert into note (owner_id, book_id, node_id, body)
       select $1, $2, $3, 'n' || i from generate_series(1, $4::int) as i`,
      [owner.id, bookId, nodeIds[0], MAX_NOTES_PER_NODE],
    );

    expect(await createNote(owner.id, nodeIds[0], "one more", db)).toEqual({
      ok: false,
      reason: "tooManyNotes",
    });
  });

  it("deletes a node's notes with the node, and its subtree's notes too", async () => {
    const { owner } = await create();
    const book = await createBook(owner.id, { title: "B", author: null }, db);
    const part = await addNodes(
      owner.id,
      { bookId: book.id, parentId: null, kind: "part", titles: ["P"] },
      db,
    );
    if (!part.ok) throw new Error("seed failed");
    const chapter = await addNodes(
      owner.id,
      {
        bookId: book.id,
        parentId: part.ids[0],
        kind: "chapter",
        titles: ["C"],
      },
      db,
    );
    if (!chapter.ok) throw new Error("seed failed");
    await createNote(owner.id, part.ids[0], "on the part", db);
    await createNote(owner.id, chapter.ids[0], "on the chapter", db);

    expect(await deleteNode(owner.id, part.ids[0], db)).toBe(true);

    expect(await countNotesByNode(owner.id, book.id, db)).toEqual({});
  });

  it("deletes a book's notes with the book (D-09)", async () => {
    const { owner } = await create();
    const { bookId } = await seedNote(owner.id);

    expect(await deleteBook(owner.id, bookId, db)).toBe(true);

    const left = await migrator.query(
      "select count(*)::int as total from note where book_id = $1",
      [bookId],
    );
    expect(left.rows[0].total).toBe(0);
  });

  it("refuses, in the database, a note on another reader's node or in another book", async () => {
    const { owner, intruder } = await create();
    const owned = await seedChapter(owner.id);
    const own = await seedChapter(intruder.id);

    // The node exists, but under another owner: the composite key refuses it.
    await expect(
      migrator.query(
        "insert into note (owner_id, book_id, node_id, body) values ($1, $2, $3, 'x')",
        [intruder.id, owned.bookId, owned.nodeIds[0]],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    // The intruder's own node, but claimed to be in their other book: refused as well.
    const otherBook = await createBook(
      intruder.id,
      { title: "Other", author: null },
      db,
    );
    await expect(
      migrator.query(
        "insert into note (owner_id, book_id, node_id, body) values ($1, $2, $3, 'x')",
        [intruder.id, otherBook.id, own.nodeIds[0]],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it.each([
    ["an empty body", ""],
    ["a body over 10 000 characters", "a".repeat(10_001)],
  ])("refuses, in the database, %s", async (_name, body) => {
    const { owner } = await create();
    const { nodeIds } = await seedChapter(owner.id);

    await expect(
      createNote(owner.id, nodeIds[0], body, db),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("stores the session's reader as owner, and RLS hides notes outside withOwner", async () => {
    const { owner } = await create();
    const { noteId } = await seedNote(owner.id);

    const [row] = await migrator
      .query("select owner_id from note where id = $1", [noteId])
      .then((result) => result.rows);
    expect(row.owner_id).toBe(owner.id);
    expect(
      await db.select().from(schema.note).where(eq(schema.note.id, noteId)),
    ).toEqual([]);
  });
});

describe("library notes", () => {
  const { create } = useReaders(db, "notes-library.test");

  it("counts the notes of every node of the reader, across books", async () => {
    const { owner, intruder } = await create();
    const first = await seedNote(owner.id);
    const second = await seedNote(owner.id);
    await createNote(owner.id, second.nodeId, "another", db);
    await seedNote(intruder.id);

    expect(await countLibraryNotes(owner.id, db)).toEqual({
      [first.nodeId]: 1,
      [second.nodeId]: 2,
    });
  });
});

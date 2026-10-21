import { readFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { plainNote, textToDoc } from "@/domain/notes/rich-text";
import { addNodes } from "@/server/repositories/book-nodes";
import { createBook } from "@/server/repositories/books";
import { createNote, listNotes } from "@/server/repositories/notes";

import { requireTestEnv } from "./db-env";
import { useReaders } from "./isolation/two-readers";

// Migration 0012 (US-019): plain-text notes written by US-018 get the document textToDoc builds,
// so they stay readable and editable; their text and edit date stay as they were. The migration
// already ran in the global setup; its SQL is idempotent, so it runs again here over rows made to
// look like the old ones (no content), written by the migrator, the table owner.

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });
const migrationSql = readFileSync(
  new URL(
    "../../src/db/migrations/0012_backfill_note_content.sql",
    import.meta.url,
  ),
  "utf8",
);

afterAll(() => pool.end());

describe("migration 0012: rich content for plain-text notes", () => {
  const { create } = useReaders(db, "note-content-migration.test");

  it("converts US-018 notes and leaves converted ones alone", async () => {
    const { owner } = await create();
    const book = await createBook(owner.id, { title: "B", author: null }, db);
    const added = await addNodes(
      owner.id,
      { bookId: book.id, parentId: null, kind: "chapter", titles: ["C"] },
      db,
    );
    if (!added.ok) throw new Error("unexpected refusal");
    const bodies = [
      "Uma linha",
      "Primeira\r\n\n\tSegunda <b>x</b>",
      'Aspas "duplas" e \\ barra',
    ];
    const ids: string[] = [];
    for (const body of bodies) {
      const created = await createNote(
        owner.id,
        added.ids[0],
        plainNote(body),
        db,
      );
      if (!created.ok) throw new Error("unexpected refusal");
      ids.push(created.id);
    }
    const rich = await createNote(
      owner.id,
      added.ids[0],
      {
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "rica", marks: [{ type: "bold" }] },
              ],
            },
          ],
        },
        text: "rica",
      },
      db,
    );
    if (!rich.ok) throw new Error("unexpected refusal");

    const migrator = new Client({
      connectionString: requireTestEnv("TEST_MIGRATOR_DATABASE_URL"),
    });
    await migrator.connect();
    try {
      await migrator.query(
        `UPDATE note SET content = NULL, updated_at = '2026-10-01T12:00:00Z' WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      await migrator.query(migrationSql);
      await migrator.query(migrationSql);
    } finally {
      await migrator.end();
    }

    const notes = await listNotes(owner.id, added.ids[0], db);
    expect(notes.map((note) => note.content)).toEqual([
      ...bodies.map(textToDoc),
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "rica", marks: [{ type: "bold" }] },
            ],
          },
        ],
      },
    ]);
    expect(notes.map((note) => note.body)).toEqual([...bodies, "rica"]);
    expect(notes[0].updatedAt.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });
});

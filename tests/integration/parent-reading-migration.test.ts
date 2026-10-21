import { readFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { addNodes, listNodes } from "@/server/repositories/book-nodes";
import { createBook } from "@/server/repositories/books";

import { requireTestEnv } from "./db-env";
import { useReaders } from "./isolation/two-readers";

// Migration 0009 (US-014): rows of nodes with children that still stored a reading state from
// before they gained children go back to "not started"; leaves keep theirs. The migration already
// ran in the global setup; its SQL is idempotent, so it runs again here over rows made to look
// like the old ones (written by the migrator, the table owner, as the old code could leave them).

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });
const migrationSql = readFileSync(
  new URL(
    "../../src/db/migrations/0009_clear_parent_reading_state.sql",
    import.meta.url,
  ),
  "utf8",
);

afterAll(() => pool.end());

describe("migration 0009: clear the reading state stored on parents", () => {
  const { create } = useReaders(db, "parent-reading-migration.test");

  it("resets parents and keeps the state of leaves", async () => {
    const { owner } = await create();
    const book = await createBook(owner.id, { title: "B", author: null }, db);
    const chapters = await addNodes(
      owner.id,
      {
        bookId: book.id,
        parentId: null,
        kind: "chapter",
        titles: ["Parent", "Leaf"],
      },
      db,
    );
    if (!chapters.ok) throw new Error("unexpected refusal");
    const [parent, leaf] = chapters.ids;
    const topics = await addNodes(
      owner.id,
      { bookId: book.id, parentId: parent, kind: "topic", titles: ["T"] },
      db,
    );
    if (!topics.ok) throw new Error("unexpected refusal");

    const migrator = new Client({
      connectionString: requireTestEnv("TEST_MIGRATOR_DATABASE_URL"),
    });
    await migrator.connect();
    try {
      await migrator.query(
        `UPDATE book_node SET status = 'completed', started_at = '2026-10-01', completed_at = '2026-10-02'
         WHERE id = ANY($1::uuid[])`,
        [[parent, leaf, topics.ids[0]]],
      );
      await migrator.query(migrationSql);
    } finally {
      await migrator.end();
    }

    const stored = new Map(
      (await listNodes(owner.id, book.id, db)).map((row) => [
        row.id,
        [row.status, row.startedAt, row.completedAt],
      ]),
    );
    expect(stored.get(parent)).toEqual(["not_started", null, null]);
    expect(stored.get(leaf)).toEqual(["completed", "2026-10-01", "2026-10-02"]);
    expect(stored.get(topics.ids[0])).toEqual([
      "completed",
      "2026-10-01",
      "2026-10-02",
    ]);
  });
});

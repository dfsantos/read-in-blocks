import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { MAX_NODES_PER_BOOK } from "@/domain/structure/node-input";
import { buildTree } from "@/domain/structure/tree";
import {
  addNodes,
  deleteNode,
  listNodes,
  updateNode,
} from "@/server/repositories/book-nodes";
import { createBook, deleteBook } from "@/server/repositories/books";

import { requireTestEnv } from "../db-env";
import {
  describeIsolation,
  useReaders,
  type IsolationSpec,
} from "./two-readers";

// The book structure repository (US-010) against Postgres with the app role: two-reader isolation,
// its own behaviour, the database's last line of rules and the cascades of D-09.

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

afterAll(() => pool.end());

async function seedBookWithChapter(ownerId: string) {
  const book = await createBook(ownerId, { title: "Owned", author: null }, db);
  const added = await addNodes(
    ownerId,
    { bookId: book.id, parentId: null, kind: "chapter", titles: ["Chapter"] },
    db,
  );
  if (!added.ok) throw new Error(`seed failed: ${added.reason}`);
  return { bookId: book.id, nodeId: added.ids[0] };
}

type Owned = { bookId: string; nodeId: string };

const nodesSpec: IsolationSpec<Owned> = {
  seed: seedBookWithChapter,
  missing: () => ({ bookId: randomUUID(), nodeId: randomUUID() }),
  snapshot: (ownerId, owned) => listNodes(ownerId, owned.bookId, db),
  contains: (result, owned) =>
    JSON.stringify(result ?? null).includes(owned.nodeId),
  operations: {
    list: (userId, target) => listNodes(userId, target.bookId, db),
    // Into another reader's book, at its root.
    addToBook: (userId, target) =>
      addNodes(
        userId,
        {
          bookId: target.bookId,
          parentId: null,
          kind: "chapter",
          titles: ["Intruder"],
        },
        db,
      ),
    // Under another reader's node, in that reader's book.
    addUnderNode: (userId, target) =>
      addNodes(
        userId,
        {
          bookId: target.bookId,
          parentId: target.nodeId,
          kind: "topic",
          titles: ["Intruder"],
        },
        db,
      ),
    update: (userId, target) =>
      updateNode(
        userId,
        target.nodeId,
        { title: "Taken", summary: "Intruder", goalPages: 1 },
        db,
      ),
    delete: (userId, target) => deleteNode(userId, target.nodeId, db),
  },
};

describeIsolation(db, "book-nodes", nodesSpec);

describe("book structure repository", () => {
  const { create } = useReaders(db, "book-nodes-repository.test");

  const add = (
    ownerId: string,
    bookId: string,
    parentId: string | null,
    kind: "part" | "chapter" | "topic",
    titles: string[],
  ) => addNodes(ownerId, { bookId, parentId, kind, titles }, db);

  async function newBook(ownerId: string) {
    return (await createBook(ownerId, { title: "Book", author: null }, db)).id;
  }

  it("builds parts, chapters straight in the book and topics, each appended at the end", async () => {
    const { owner } = await create();
    const bookId = await newBook(owner.id);

    const preface = await add(owner.id, bookId, null, "chapter", ["Preface"]);
    const parts = await add(owner.id, bookId, null, "part", [
      "Part I",
      "Part II",
    ]);
    if (!preface.ok || !parts.ok) throw new Error("unexpected refusal");
    const chapters = await add(owner.id, bookId, parts.ids[0], "chapter", [
      "One",
      "Two",
    ]);
    if (!chapters.ok) throw new Error("unexpected refusal");
    await add(owner.id, bookId, chapters.ids[0], "topic", ["1.1"]);
    await add(owner.id, bookId, chapters.ids[0], "topic", ["1.2"]);

    const outline = (nodes: ReturnType<typeof buildTree>): unknown[] =>
      nodes.map((node) =>
        node.children.length
          ? [
              `${node.kind}:${node.title}@${node.position}`,
              outline(node.children),
            ]
          : `${node.kind}:${node.title}@${node.position}`,
      );
    expect(outline(buildTree(await listNodes(owner.id, bookId, db)))).toEqual([
      "chapter:Preface@0",
      [
        "part:Part I@1",
        [["chapter:One@0", ["topic:1.1@0", "topic:1.2@1"]], "chapter:Two@1"],
      ],
      "part:Part II@2",
    ]);
  });

  it.each([
    ["a topic at the book's root", null, "topic"],
    ["a part under a part", "part", "part"],
    ["a topic under a part", "part", "topic"],
    ["a chapter under a chapter", "chapter", "chapter"],
    ["anything under a topic", "topic", "chapter"],
  ] as const)("refuses %s and writes nothing", async (_name, parent, kind) => {
    const { owner } = await create();
    const bookId = await newBook(owner.id);
    const part = await add(owner.id, bookId, null, "part", ["P"]);
    if (!part.ok) throw new Error("unexpected refusal");
    const chapter = await add(owner.id, bookId, part.ids[0], "chapter", ["C"]);
    if (!chapter.ok) throw new Error("unexpected refusal");
    const topic = await add(owner.id, bookId, chapter.ids[0], "topic", ["T"]);
    if (!topic.ok) throw new Error("unexpected refusal");
    const parentId = {
      part: part.ids[0],
      chapter: chapter.ids[0],
      topic: topic.ids[0],
    };

    expect(
      await add(owner.id, bookId, parent && parentId[parent], kind, ["X"]),
    ).toEqual({ ok: false, reason: "invalidPlacement" });
    expect(await listNodes(owner.id, bookId, db)).toHaveLength(3);
  });

  it("refuses a parent from another book of the same reader", async () => {
    const { owner } = await create();
    const one = await newBook(owner.id);
    const other = await newBook(owner.id);
    const part = await add(owner.id, one, null, "part", ["P"]);
    if (!part.ok) throw new Error("unexpected refusal");

    expect(await add(owner.id, other, part.ids[0], "chapter", ["C"])).toEqual({
      ok: false,
      reason: "notFound",
    });
    expect(await listNodes(owner.id, other, db)).toEqual([]);
  });

  it("refuses to grow a book past the node limit", async () => {
    const { owner } = await create();
    const bookId = await newBook(owner.id);
    // Straight inserts: the limit is far beyond what the add quota lets a test reach quickly.
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.user_id', ${owner.id}, true)`,
      );
      await tx.insert(schema.bookNode).values(
        Array.from({ length: MAX_NODES_PER_BOOK - 1 }, (_, position) => ({
          ownerId: owner.id,
          bookId,
          kind: "chapter",
          title: `C${position}`,
          position,
        })),
      );
    });

    expect(await add(owner.id, bookId, null, "chapter", ["A", "B"])).toEqual({
      ok: false,
      reason: "tooManyNodes",
    });
    expect(
      await add(owner.id, bookId, null, "chapter", ["Last"]),
    ).toMatchObject({
      ok: true,
    });
    expect(await listNodes(owner.id, bookId, db)).toHaveLength(
      MAX_NODES_PER_BOOK,
    );
  });

  it("keeps positions unique when two additions race on the same book", async () => {
    const { owner } = await create();
    const bookId = await newBook(owner.id);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        add(owner.id, bookId, null, "chapter", [`C${i}a`, `C${i}b`]),
      ),
    );

    expect(results.every((result) => result.ok)).toBe(true);
    const positions = (await listNodes(owner.id, bookId, db))
      .map((node) => node.position)
      .sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("updates a node's title, summary and goal, and clears them", async () => {
    const { owner } = await create();
    const { bookId, nodeId } = await seedBookWithChapter(owner.id);

    expect(
      await updateNode(
        owner.id,
        nodeId,
        { title: "Renamed", summary: "Linha 1\nLinha 2", goalPages: 30 },
        db,
      ),
    ).toBe(true);
    expect(await listNodes(owner.id, bookId, db)).toMatchObject([
      {
        id: nodeId,
        title: "Renamed",
        summary: "Linha 1\nLinha 2",
        goalPages: 30,
      },
    ]);

    await updateNode(
      owner.id,
      nodeId,
      { title: "Renamed", summary: null, goalPages: null },
      db,
    );
    expect(await listNodes(owner.id, bookId, db)).toMatchObject([
      { id: nodeId, summary: null, goalPages: null },
    ]);
    expect(
      await updateNode(
        owner.id,
        randomUUID(),
        { title: "Nope", summary: null, goalPages: null },
        db,
      ),
    ).toBe(false);
  });

  it("starts nodes without summary or goal", async () => {
    const { owner } = await create();
    const { bookId } = await seedBookWithChapter(owner.id);
    expect(await listNodes(owner.id, bookId, db)).toMatchObject([
      { summary: null, goalPages: null },
    ]);
  });

  it("deletes a node with its whole subtree and nothing else", async () => {
    const { owner } = await create();
    const bookId = await newBook(owner.id);
    const parts = await add(owner.id, bookId, null, "part", ["Gone", "Kept"]);
    if (!parts.ok) throw new Error("unexpected refusal");
    const chapter = await add(owner.id, bookId, parts.ids[0], "chapter", ["C"]);
    if (!chapter.ok) throw new Error("unexpected refusal");
    await add(owner.id, bookId, chapter.ids[0], "topic", ["T1", "T2"]);

    expect(await deleteNode(owner.id, parts.ids[0], db)).toBe(true);

    expect(await listNodes(owner.id, bookId, db)).toEqual([
      expect.objectContaining({ id: parts.ids[1], title: "Kept" }),
    ]);
    expect(await deleteNode(owner.id, parts.ids[0], db)).toBe(false);
  });

  it("deletes the whole structure with its book (D-09)", async () => {
    const { owner } = await create();
    const { bookId } = await seedBookWithChapter(owner.id);
    const other = await seedBookWithChapter(owner.id);

    expect(await deleteBook(owner.id, bookId, db)).toBe(true);

    const remaining = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.user_id', ${owner.id}, true)`,
      );
      return tx
        .select({ bookId: schema.bookNode.bookId })
        .from(schema.bookNode);
    });
    expect(remaining).toEqual([{ bookId: other.bookId }]);
  });

  it("lets the database refuse rows the repository must never write", async () => {
    const { owner, intruder } = await create();
    const { bookId, nodeId } = await seedBookWithChapter(owner.id);
    const foreign = await seedBookWithChapter(intruder.id);
    const insert = (values: Partial<typeof schema.bookNode.$inferInsert>) =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.user_id', ${owner.id}, true)`,
        );
        await tx.insert(schema.bookNode).values({
          ownerId: owner.id,
          bookId,
          kind: "chapter",
          title: "Row",
          position: 99,
          ...values,
        });
      });

    // 23514 check_violation, 23503 foreign_key_violation, 23505 unique_violation.
    for (const [values, code] of [
      [{ kind: "book" }, "23514"],
      [{ kind: "topic", parentId: null }, "23514"],
      [{ kind: "part", parentId: nodeId }, "23514"],
      [{ title: "" }, "23514"],
      [{ title: "a".repeat(201) }, "23514"],
      [{ position: -1 }, "23514"],
      [{ summary: "" }, "23514"],
      [{ summary: "a".repeat(1001) }, "23514"],
      [{ goalPages: 0 }, "23514"],
      [{ goalPages: 10_001 }, "23514"],
      [{ position: 0 }, "23505"],
      // A node in someone else's book, or under someone else's node.
      [{ bookId: foreign.bookId }, "23503"],
      [{ parentId: foreign.nodeId, kind: "topic" }, "23503"],
      [{ bookId: randomUUID() }, "23503"],
    ] as const) {
      await expect(
        insert(values),
        JSON.stringify(values),
      ).rejects.toMatchObject({
        cause: { code },
      });
    }
  });

  it("lets RLS hide and protect another reader's nodes from a query without the owner filter", async () => {
    const { owner, intruder } = await create();
    const { bookId, nodeId } = await seedBookWithChapter(owner.id);

    expect(await db.select().from(schema.bookNode)).toEqual([]);
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.user_id', ${intruder.id}, true)`,
      );
      expect(await tx.select().from(schema.bookNode)).toEqual([]);
      expect(
        await tx
          .update(schema.bookNode)
          .set({ title: "Forged" })
          .returning({ id: schema.bookNode.id }),
      ).toEqual([]);
      expect(
        await tx.delete(schema.bookNode).returning({ id: schema.bookNode.id }),
      ).toEqual([]);
    });
    expect(await listNodes(owner.id, bookId, db)).toMatchObject([
      { id: nodeId, title: "Chapter" },
    ]);
  });

  it("refuses to run without a userId", async () => {
    for (const call of [
      () => listNodes("", randomUUID(), db),
      () =>
        addNodes(
          "",
          {
            bookId: randomUUID(),
            parentId: null,
            kind: "chapter",
            titles: ["t"],
          },
          db,
        ),
      () =>
        updateNode(
          "",
          randomUUID(),
          { title: "t", summary: null, goalPages: null },
          db,
        ),
      () => deleteNode("", randomUUID(), db),
    ]) {
      await expect(call()).rejects.toThrow(
        "repository called without a userId",
      );
    }
  });
});

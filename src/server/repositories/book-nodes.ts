import { and, asc, count, eq, isNull, max, sql } from "drizzle-orm";

import { getDb, type Database } from "@/db/client";
import { book, bookNode } from "@/db/schema";
import { canPlace, type NodeKind } from "@/domain/structure/hierarchy";
import {
  MAX_NODES_PER_BOOK,
  type NodeDetails,
} from "@/domain/structure/node-input";
import type { FlatNode } from "@/domain/structure/tree";

import { ownedBy } from "./owner-scope";
import { withOwner } from "./with-owner";

// The structure of the reader's books (US-010, ADR-0009). Content table: every query runs through
// withOwner (RLS) and is still filtered by ownedBy. Another reader's book or node behaves exactly
// like a missing one. Ids must already be UUIDs (bookIdSchema, nodeIdSchema): Postgres would
// reject anything else with an error.

const nodeColumns = {
  id: bookNode.id,
  parentId: bookNode.parentId,
  kind: bookNode.kind,
  title: bookNode.title,
  position: bookNode.position,
  summary: bookNode.summary,
  goalPages: bookNode.goalPages,
};

// The kind column is text with a CHECK constraint (book_node_kind): it only holds NodeKind values.
const asFlatNode = (
  row: Omit<FlatNode, "kind"> & { kind: string },
): FlatNode => ({ ...row, kind: row.kind as NodeKind });

// Every node of the reader's book, in no particular order (buildTree orders them). Empty both for a
// book without structure and for a missing or someone else's book.
export async function listNodes(
  userId: string,
  bookId: string,
  db: Database = getDb(),
): Promise<FlatNode[]> {
  return withOwner(
    userId,
    async (tx) => {
      const rows = await tx
        .select(nodeColumns)
        .from(bookNode)
        .where(ownedBy(bookNode.ownerId, userId, eq(bookNode.bookId, bookId)))
        .orderBy(asc(bookNode.parentId), asc(bookNode.position))
        // Never more than a book may hold (addNodes); kept as a bound on one page.
        .limit(MAX_NODES_PER_BOOK);
      return rows.map(asFlatNode);
    },
    db,
  );
}

export type AddNodes = {
  bookId: string;
  // null: the book's root.
  parentId: string | null;
  kind: NodeKind;
  titles: readonly string[];
};

export type AddNodesResult =
  | { ok: true; ids: string[] }
  | {
      ok: false;
      // notFound: the book or the parent is missing or someone else's (the same answer for both).
      reason: "notFound" | "invalidPlacement" | "tooManyNodes";
    };

// Appends `titles` as nodes of `kind` at the end of `parentId`'s children (or of the book's root).
export async function addNodes(
  userId: string,
  input: AddNodes,
  db: Database = getDb(),
): Promise<AddNodesResult> {
  return withOwner(
    userId,
    async (tx) => {
      // Locks the reader's book, so two additions to the same book run one after the other: the
      // positions and the node count below cannot race.
      const locked = await tx.execute(
        sql`select ${book.id} from ${book} where ${ownedBy(book.ownerId, userId, eq(book.id, input.bookId))} for update`,
      );
      if (locked.rows.length === 0) return { ok: false, reason: "notFound" };

      let parentKind: NodeKind | null = null;
      if (input.parentId !== null) {
        const [parent] = await tx
          .select({ kind: bookNode.kind })
          .from(bookNode)
          .where(
            ownedBy(
              bookNode.ownerId,
              userId,
              eq(bookNode.bookId, input.bookId),
              eq(bookNode.id, input.parentId),
            ),
          )
          .limit(1);
        if (!parent) return { ok: false, reason: "notFound" };
        parentKind = parent.kind as NodeKind;
      }
      if (!canPlace(input.kind, parentKind)) {
        return { ok: false, reason: "invalidPlacement" };
      }

      const [{ total }] = await tx
        .select({ total: count() })
        .from(bookNode)
        .where(
          ownedBy(bookNode.ownerId, userId, eq(bookNode.bookId, input.bookId)),
        );
      if (total + input.titles.length > MAX_NODES_PER_BOOK) {
        return { ok: false, reason: "tooManyNodes" };
      }

      const [{ last }] = await tx
        .select({ last: max(bookNode.position) })
        .from(bookNode)
        .where(
          ownedBy(
            bookNode.ownerId,
            userId,
            and(
              eq(bookNode.bookId, input.bookId),
              input.parentId === null
                ? isNull(bookNode.parentId)
                : eq(bookNode.parentId, input.parentId),
            ),
          ),
        );
      const first = last === null ? 0 : last + 1;

      // The owner is always the userId from the session; nothing in `input` can choose it.
      const created = await tx
        .insert(bookNode)
        .values(
          input.titles.map((title, index) => ({
            ownerId: userId,
            bookId: input.bookId,
            parentId: input.parentId,
            kind: input.kind,
            title,
            position: first + index,
          })),
        )
        .returning({ id: bookNode.id });
      return { ok: true, ids: created.map((row) => row.id) };
    },
    db,
  );
}

// Whether the reader's node was updated (US-011: title, summary and goal): false both for a missing
// node and for someone else's.
export async function updateNode(
  userId: string,
  nodeId: string,
  details: NodeDetails,
  db: Database = getDb(),
): Promise<boolean> {
  return withOwner(
    userId,
    async (tx) => {
      const updated = await tx
        .update(bookNode)
        .set({
          title: details.title,
          summary: details.summary,
          goalPages: details.goalPages,
          updatedAt: sql`now()`,
        })
        .where(ownedBy(bookNode.ownerId, userId, eq(bookNode.id, nodeId)))
        .returning({ id: bookNode.id });
      return updated.length > 0;
    },
    db,
  );
}

// Whether the reader's node was deleted, with its whole subtree (book_node_parent_fk cascades):
// false both for a missing node and for someone else's.
export async function deleteNode(
  userId: string,
  nodeId: string,
  db: Database = getDb(),
): Promise<boolean> {
  return withOwner(
    userId,
    async (tx) => {
      const deleted = await tx
        .delete(bookNode)
        .where(ownedBy(bookNode.ownerId, userId, eq(bookNode.id, nodeId)))
        .returning({ id: bookNode.id });
      return deleted.length > 0;
    },
    db,
  );
}

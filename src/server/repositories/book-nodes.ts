import { and, asc, count, eq, inArray, isNull, max, sql } from "drizzle-orm";

import { getDb, type Database } from "@/db/client";
import { book, bookNode } from "@/db/schema";
import { canPlace, type NodeKind } from "@/domain/structure/hierarchy";
import {
  changeStatus,
  editDates,
  type ReadingDateError,
  type ReadingState,
  type ReadingStatus,
} from "@/domain/reading/status";
import { planMove } from "@/domain/structure/move";
import {
  MAX_NODES_PER_BOOK,
  type MoveNodeInput,
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
  status: bookNode.status,
  startedAt: bookNode.startedAt,
  completedAt: bookNode.completedAt,
};

// kind and status are text columns with CHECK constraints (book_node_kind, book_node_status): they
// only hold NodeKind and ReadingStatus values.
const asFlatNode = (
  row: Omit<FlatNode, "kind" | "status"> & { kind: string; status: string },
): FlatNode => ({
  ...row,
  kind: row.kind as NodeKind,
  status: row.status as ReadingStatus,
});

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
// false both for a missing node and for someone else's. Takes the book lock like addNodes and
// moveNode, so a deletion never runs in the middle of a reorder (security review, US-012).
export async function deleteNode(
  userId: string,
  nodeId: string,
  db: Database = getDb(),
): Promise<boolean> {
  return withOwner(
    userId,
    async (tx) => {
      const [node] = await tx
        .select({ bookId: bookNode.bookId })
        .from(bookNode)
        .where(ownedBy(bookNode.ownerId, userId, eq(bookNode.id, nodeId)))
        .limit(1);
      if (!node) return false;
      await tx.execute(
        sql`select ${book.id} from ${book} where ${ownedBy(book.ownerId, userId, eq(book.id, node.bookId))} for update`,
      );
      const deleted = await tx
        .delete(bookNode)
        .where(ownedBy(bookNode.ownerId, userId, eq(bookNode.id, nodeId)))
        .returning({ id: bookNode.id });
      return deleted.length > 0;
    },
    db,
  );
}

export type MoveNodeResult =
  { ok: true } | { ok: false; reason: "notFound" | "invalidPlacement" };

// Above any position a book can hold (MAX_NODES_PER_BOOK), so parked rows never meet real ones.
const PARKING_OFFSET = 1_000_000;

// Moves the reader's node to `index` among the children of `parentId` (null: the book's root), in
// the same book, or reorders it among its siblings when the parent stays (US-012). Both sibling
// groups are renumbered 0..n-1 in two phases (migration review, US-010): the sibling position is
// unique and checked per row, so every affected row is first parked above the real positions and
// only then written to its final place.
export async function moveNode(
  userId: string,
  nodeId: string,
  input: MoveNodeInput,
  db: Database = getDb(),
): Promise<MoveNodeResult> {
  return withOwner(
    userId,
    async (tx) => {
      const findNode = async () => {
        const [row] = await tx
          .select({
            bookId: bookNode.bookId,
            parentId: bookNode.parentId,
            kind: bookNode.kind,
          })
          .from(bookNode)
          .where(ownedBy(bookNode.ownerId, userId, eq(bookNode.id, nodeId)))
          .limit(1);
        return row;
      };

      const found = await findNode();
      if (!found) return { ok: false, reason: "notFound" };
      // Same lock as addNodes: structure changes of one book run one after the other.
      await tx.execute(
        sql`select ${book.id} from ${book} where ${ownedBy(book.ownerId, userId, eq(book.id, found.bookId))} for update`,
      );
      // Read again under the lock: the node may have moved or gone meanwhile.
      const node = await findNode();
      if (!node) return { ok: false, reason: "notFound" };

      let parentKind: NodeKind | null = null;
      if (input.parentId !== null) {
        const [parent] = await tx
          .select({ kind: bookNode.kind })
          .from(bookNode)
          .where(
            ownedBy(
              bookNode.ownerId,
              userId,
              eq(bookNode.bookId, node.bookId),
              eq(bookNode.id, input.parentId),
            ),
          )
          .limit(1);
        if (!parent) return { ok: false, reason: "notFound" };
        parentKind = parent.kind as NodeKind;
      }
      // The kinds also rule out cycles (src/domain/structure/move.ts).
      if (
        input.parentId === nodeId ||
        !canPlace(node.kind as NodeKind, parentKind)
      ) {
        return { ok: false, reason: "invalidPlacement" };
      }

      const childrenOf = async (parentId: string | null) =>
        (
          await tx
            .select({ id: bookNode.id })
            .from(bookNode)
            .where(
              ownedBy(
                bookNode.ownerId,
                userId,
                eq(bookNode.bookId, node.bookId),
                parentId === null
                  ? isNull(bookNode.parentId)
                  : eq(bookNode.parentId, parentId),
              ),
            )
            .orderBy(asc(bookNode.position))
        ).map((row) => row.id);

      const stays = input.parentId === node.parentId;
      const plan = planMove(
        await childrenOf(node.parentId),
        stays ? null : await childrenOf(input.parentId),
        nodeId,
        input.index,
      );
      const positions = new Map<string, number>();
      plan.source.forEach((id, position) => positions.set(id, position));
      plan.target.forEach((id, position) => positions.set(id, position));
      const ids = [...positions.keys()];

      // Phase 1: park every affected row out of the way of the unique sibling position.
      await tx
        .update(bookNode)
        .set({ position: sql`${bookNode.position} + ${PARKING_OFFSET}` })
        .where(ownedBy(bookNode.ownerId, userId, inArray(bookNode.id, ids)));
      // Phase 2: final positions, and the new parent of the moved node.
      const finalPosition = sql.join(
        [
          sql`(case`,
          ...ids.map(
            (id) =>
              sql`when ${bookNode.id} = ${id} then ${positions.get(id)}::integer`,
          ),
          sql`end)`,
        ],
        sql.raw(" "),
      );
      await tx
        .update(bookNode)
        .set({
          position: finalPosition,
          parentId: sql`(case when ${bookNode.id} = ${nodeId} then ${input.parentId}::uuid else ${bookNode.parentId} end)`,
          updatedAt: sql`case when ${bookNode.id} = ${nodeId} then now() else ${bookNode.updatedAt} end`,
        })
        .where(ownedBy(bookNode.ownerId, userId, inArray(bookNode.id, ids)));
      return { ok: true };
    },
    db,
  );
}

export type ReadingChangeResult =
  | { ok: true; state: ReadingState }
  | {
      ok: false;
      // notFound: missing or someone else's node; notLeaf: a node with children derives its state.
      reason: "notFound" | "notLeaf";
    }
  | { ok: false; reason: ReadingDateError; field: "startedAt" | "completedAt" };

// Reads the reader's node under the book lock (as addNodes does, so no child can appear meanwhile),
// checks it is a leaf, and writes the state `next` computes from the current one (US-013).
async function changeReading(
  userId: string,
  nodeId: string,
  next: (current: ReadingState) =>
    | { ok: true; state: ReadingState }
    | {
        ok: false;
        error: ReadingDateError;
        field: "startedAt" | "completedAt";
      },
  db: Database,
): Promise<ReadingChangeResult> {
  return withOwner(
    userId,
    async (tx) => {
      const findNode = async () => {
        const [row] = await tx
          .select({
            bookId: bookNode.bookId,
            status: bookNode.status,
            startedAt: bookNode.startedAt,
            completedAt: bookNode.completedAt,
          })
          .from(bookNode)
          .where(ownedBy(bookNode.ownerId, userId, eq(bookNode.id, nodeId)))
          .limit(1);
        return row;
      };
      const found = await findNode();
      if (!found) return { ok: false, reason: "notFound" };
      await tx.execute(
        sql`select ${book.id} from ${book} where ${ownedBy(book.ownerId, userId, eq(book.id, found.bookId))} for update`,
      );
      const node = await findNode();
      if (!node) return { ok: false, reason: "notFound" };

      const [child] = await tx
        .select({ id: bookNode.id })
        .from(bookNode)
        .where(
          ownedBy(
            bookNode.ownerId,
            userId,
            eq(bookNode.bookId, node.bookId),
            eq(bookNode.parentId, nodeId),
          ),
        )
        .limit(1);
      if (child) return { ok: false, reason: "notLeaf" };

      const result = next({
        status: node.status as ReadingStatus,
        startedAt: node.startedAt,
        completedAt: node.completedAt,
      });
      if (!result.ok) {
        return { ok: false, reason: result.error, field: result.field };
      }
      await tx
        .update(bookNode)
        .set({ ...result.state, updatedAt: sql`now()` })
        .where(ownedBy(bookNode.ownerId, userId, eq(bookNode.id, nodeId)));
      return { ok: true, state: result.state };
    },
    db,
  );
}

// Sets a leaf's reading state on `today` (a calendar day in the app's time zone), filling or
// clearing its dates (ADR-0009, "Datas").
export async function setReadingStatus(
  userId: string,
  nodeId: string,
  status: ReadingStatus,
  today: string,
  db: Database = getDb(),
): Promise<ReadingChangeResult> {
  return changeReading(
    userId,
    nodeId,
    (current) => ({ ok: true, state: changeStatus(current, status, today) }),
    db,
  );
}

// Replaces a leaf's dates, to log a past reading; they must fit its state and not pass `today`.
export async function setReadingDates(
  userId: string,
  nodeId: string,
  dates: { startedAt: string | null; completedAt: string | null },
  today: string,
  db: Database = getDb(),
): Promise<ReadingChangeResult> {
  return changeReading(
    userId,
    nodeId,
    (current) => editDates(current, dates, today),
    db,
  );
}

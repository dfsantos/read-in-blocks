import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { getDb, type Database } from "@/db/client";
import { bookNode, note } from "@/db/schema";
import { MAX_NOTES_PER_NODE } from "@/domain/notes/note-input";
import {
  isNoteType,
  type NoteKind,
  type NoteType,
} from "@/domain/notes/note-type";
import { storedNoteContent, type NoteDoc } from "@/domain/notes/rich-text";
import {
  MAX_LIBRARY_NODES,
  MAX_NODES_PER_BOOK,
} from "@/domain/structure/node-input";

import { ownedBy } from "./owner-scope";
import { withOwner } from "./with-owner";

// The notebooks of the reader's nodes (US-018, RF-005). Content table: every query runs through
// withOwner (RLS) and is still filtered by ownedBy. Another reader's node or note behaves exactly
// like a missing one. Ids must already be UUIDs (nodeIdSchema, noteIdSchema): Postgres would reject
// anything else with an error.

export type Note = {
  id: string;
  // The plain text (US-018's column), kept beside the rich content.
  body: string;
  // Parsed again on the way out (storedNoteContent): a row that does not match the schema, or one
  // still without content, is read as its plain text.
  content: NoteDoc;
  // Its kind (US-020): a quote carries its reference; an action or question may be resolved.
  type: NoteType;
  reference: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// What a Server Action stores: a document rebuilt by parseNoteContent, its plain text and its kind
// (parseNoteKind).
export type NoteWrite = { content: NoteDoc; text: string } & NoteKind;

const noteColumns = {
  id: note.id,
  body: note.body,
  content: note.content,
  type: note.type,
  reference: note.reference,
  resolvedAt: note.resolvedAt,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
};

// A node's notes, oldest first (chronological order; ties broken by id). Empty both for a node
// without notes and for a missing or someone else's node.
export async function listNotes(
  userId: string,
  nodeId: string,
  db: Database = getDb(),
): Promise<Note[]> {
  const rows = await withOwner(
    userId,
    (tx) =>
      tx
        .select(noteColumns)
        .from(note)
        .where(ownedBy(note.ownerId, userId, eq(note.nodeId, nodeId)))
        .orderBy(asc(note.createdAt), asc(note.id))
        // Never more than a node may hold (createNote).
        .limit(MAX_NOTES_PER_NODE),
    db,
  );
  return rows.map((row) => ({
    ...row,
    content: storedNoteContent(row.content, row.body),
    // The column's CHECK only allows the known kinds.
    type: isNoteType(row.type) ? row.type : "key_concept",
  }));
}

// How many notes each node of the reader's book has; nodes without notes are left out. Empty both
// for a book without notes and for a missing or someone else's book.
export async function countNotesByNode(
  userId: string,
  bookId: string,
  db: Database = getDb(),
): Promise<Record<string, number>> {
  return withOwner(
    userId,
    async (tx) => {
      const rows = await tx
        .select({ nodeId: note.nodeId, total: count() })
        .from(note)
        .where(ownedBy(note.ownerId, userId, eq(note.bookId, bookId)))
        .groupBy(note.nodeId)
        .limit(MAX_NODES_PER_BOOK);
      return Object.fromEntries(rows.map((row) => [row.nodeId, row.total]));
    },
    db,
  );
}

// How many notes each node of the reader's `bookIds` has (US-021: revisiting a finished book's notes
// from the library); nodes without notes are left out.
export async function countLibraryNotes(
  userId: string,
  bookIds: readonly string[],
  db: Database = getDb(),
): Promise<Record<string, number>> {
  if (bookIds.length === 0) return {};
  return withOwner(
    userId,
    async (tx) => {
      const rows = await tx
        .select({ nodeId: note.nodeId, total: count() })
        .from(note)
        .where(
          ownedBy(note.ownerId, userId, inArray(note.bookId, [...bookIds])),
        )
        .groupBy(note.nodeId)
        .orderBy(asc(note.nodeId))
        .limit(MAX_LIBRARY_NODES);
      return Object.fromEntries(rows.map((row) => [row.nodeId, row.total]));
    },
    db,
  );
}

export type CreateNoteResult =
  | { ok: true; id: string }
  // notFound: the node is missing or someone else's (the same answer for both).
  | { ok: false; reason: "notFound" | "tooManyNotes" };

// Adds a note at the end of the reader's node's notebook.
export async function createNote(
  userId: string,
  nodeId: string,
  write: NoteWrite,
  db: Database = getDb(),
): Promise<CreateNoteResult> {
  return withOwner(
    userId,
    async (tx) => {
      // Locks the reader's node, so two additions to the same notebook run one after the other and
      // the count below cannot race. Also gives the node's book, which the note must carry.
      const locked = await tx.execute<{ book_id: string }>(
        sql`select ${bookNode.bookId} from ${bookNode} where ${ownedBy(bookNode.ownerId, userId, eq(bookNode.id, nodeId))} for update`,
      );
      const [node] = locked.rows;
      if (!node) return { ok: false, reason: "notFound" };

      const [{ total }] = await tx
        .select({ total: count() })
        .from(note)
        .where(
          ownedBy(
            note.ownerId,
            userId,
            and(eq(note.bookId, node.book_id), eq(note.nodeId, nodeId)),
          ),
        );
      if (total >= MAX_NOTES_PER_NODE) {
        return { ok: false, reason: "tooManyNotes" };
      }

      // The owner is always the userId from the session; nothing the client sends can choose it.
      const [created] = await tx
        .insert(note)
        .values({
          ownerId: userId,
          bookId: node.book_id,
          nodeId,
          body: write.text,
          content: write.content,
          type: write.type,
          reference: write.reference,
        })
        .returning({ id: note.id });
      return { ok: true, id: created.id };
    },
    db,
  );
}

// Whether the reader's note was updated: false both for a missing note and for someone else's.
export async function updateNote(
  userId: string,
  noteId: string,
  write: NoteWrite,
  db: Database = getDb(),
): Promise<boolean> {
  return withOwner(
    userId,
    async (tx) => {
      const updated = await tx
        .update(note)
        .set({
          body: write.text,
          content: write.content,
          type: write.type,
          reference: write.reference,
          // A note that stops being an action or question is no longer resolved.
          resolvedAt:
            write.type === "action_or_question" ? note.resolvedAt : null,
          updatedAt: sql`now()`,
        })
        .where(ownedBy(note.ownerId, userId, eq(note.id, noteId)))
        .returning({ id: note.id });
      return updated.length > 0;
    },
    db,
  );
}

// Marks the reader's action or question as resolved (now) or open again. False for a missing note,
// someone else's and a note of another kind. Not an edit of the text: updated_at stays.
export async function setNoteResolved(
  userId: string,
  noteId: string,
  resolved: boolean,
  db: Database = getDb(),
): Promise<boolean> {
  return withOwner(
    userId,
    async (tx) => {
      const updated = await tx
        .update(note)
        .set({ resolvedAt: resolved ? sql`now()` : null })
        .where(
          ownedBy(
            note.ownerId,
            userId,
            and(eq(note.id, noteId), eq(note.type, "action_or_question")),
          ),
        )
        .returning({ id: note.id });
      return updated.length > 0;
    },
    db,
  );
}

// Whether the reader's note was deleted: false both for a missing note and for someone else's.
export async function deleteNote(
  userId: string,
  noteId: string,
  db: Database = getDb(),
): Promise<boolean> {
  return withOwner(
    userId,
    async (tx) => {
      const deleted = await tx
        .delete(note)
        .where(ownedBy(note.ownerId, userId, eq(note.id, noteId)))
        .returning({ id: note.id });
      return deleted.length > 0;
    },
    db,
  );
}

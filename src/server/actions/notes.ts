"use server";

import { z } from "zod";

import {
  noteIdSchema,
  noteInputErrors,
  noteInputSchema,
  type NoteInputError,
} from "@/domain/notes/note-input";
import { nodeIdSchema } from "@/domain/structure/node-input";
import { requireUser } from "@/server/auth/session";
import { fitsEditorSchema } from "@/server/notes/content-structure";
import {
  createNote as insertNote,
  deleteNote as removeNote,
  setNoteResolved as markResolved,
  updateNote as changeNote,
} from "@/server/repositories/notes";
import {
  consumeWriteQuota,
  type WriteQuota,
} from "@/server/repositories/write-quota";

// Notebook Server Actions (US-018). Each one is a public endpoint (rule server-actions): Zod first,
// then requireUser(), then the quota and the repository with the session's userId. Content is rich
// since US-019: the client's JSON is rebuilt from the allowed schema (links only http(s)/mailto,
// size and depth bounded) and checked against the editor's own structure before it is stored. The ids (node,
// note) are arguments anyone can forge: a malformed id, a missing node or note and another reader's
// all get the same "notFound", answered only once the session is checked.

// Keys under `notes.errors` in messages/pt-BR.json.
export type NoteErrorKey =
  NoteInputError | "tooManyNotes" | "notFound" | "rateLimited" | "failed";

export type NoteFailure = { ok: false; errorKey: NoteErrorKey; field?: "body" };

export type NoteResult = { ok: true } | NoteFailure;

// A new note answers with its id, so the editor keeps saving into it (US-019).
export type CreateNoteResult =
  { ok: true; id: string } | Extract<NoteResult, { ok: false }>;

export type ResolveNoteResult =
  { ok: true } | { ok: false; errorKey: "notFound" | "rateLimited" | "failed" };

export type DeleteNoteResult =
  { ok: true } | { ok: false; errorKey: "notFound" | "rateLimited" | "failed" };

// Writing about a chapter comes in bursts, but never 30 notes a minute.
const CREATE_NOTE_QUOTA = {
  action: "notes.create",
  limit: 30,
  windowSeconds: 60,
} satisfies WriteQuota;
const UPDATE_NOTE_QUOTA = {
  action: "notes.update",
  limit: 60,
  windowSeconds: 60,
} satisfies WriteQuota;
// Each deletion needs a confirmation in the page.
const DELETE_NOTE_QUOTA = {
  action: "notes.delete",
  limit: 30,
  windowSeconds: 60,
} satisfies WriteQuota;

// Resolving is one click per action or question; a reader never needs 60 a minute.
const RESOLVE_NOTE_QUOTA = {
  action: "notes.resolve",
  limit: 60,
  windowSeconds: 60,
} satisfies WriteQuota;

// Only the Postgres error code: messages may echo the reader's notes (zero-trust.md, 3.3).
function logFailure(action: string, error: unknown) {
  console.error(`${action} failed`, {
    code: (error as { code?: unknown } | null)?.code,
  });
}

// Security events (zero-trust.md, 3.3): ids and a timestamp, never a note's text.
type NoteEvent = {
  event: "notes.deleted" | "notes.delete_rate_limited";
  userId: string;
  noteId: string;
};

function logNoteEvent(entry: NoteEvent) {
  console.info(JSON.stringify({ ...entry, at: new Date().toISOString() }));
}

// Any other issue (the input is not an object at all) gets the "required" key: the message of a
// Zod issue is only an i18n key when the schema set it.
function inputError(issues: readonly { message: string }[]): NoteFailure {
  const message = issues[0].message;
  return {
    ok: false,
    errorKey: Object.values<string>(noteInputErrors).includes(message)
      ? (message as NoteInputError)
      : noteInputErrors.bodyRequired,
    field: "body",
  };
}

// The rebuilt note, or the error the form shows. Never echoes what the client sent.
function parseNote(input: unknown) {
  const parsed = noteInputSchema.safeParse(input);
  if (!parsed.success) return { error: inputError(parsed.error.issues) };
  if (!fitsEditorSchema(parsed.data.content)) {
    return {
      error: {
        ok: false,
        errorKey: noteInputErrors.invalidContent,
        field: "body",
      } satisfies NoteFailure,
    };
  }
  return { note: parsed.data };
}

// Adds a note to a node's notebook.
export async function createNote(
  nodeId: unknown,
  input: unknown,
): Promise<CreateNoteResult> {
  const id = nodeIdSchema.safeParse(nodeId);
  const parsed = parseNote(input);
  if (parsed.error) return parsed.error;

  const user = await requireUser();
  if (!id.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, CREATE_NOTE_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    const created = await insertNote(user.id, id.data, parsed.note);
    return created.ok
      ? { ok: true, id: created.id }
      : { ok: false, errorKey: created.reason };
  } catch (error) {
    logFailure(CREATE_NOTE_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

// Replaces a note's content (the editor saves on its own while the reader writes).
export async function updateNote(
  noteId: unknown,
  input: unknown,
): Promise<NoteResult> {
  const id = noteIdSchema.safeParse(noteId);
  const parsed = parseNote(input);
  if (parsed.error) return parsed.error;

  const user = await requireUser();
  if (!id.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, UPDATE_NOTE_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    return (await changeNote(user.id, id.data, parsed.note))
      ? { ok: true }
      : { ok: false, errorKey: "notFound" };
  } catch (error) {
    logFailure(UPDATE_NOTE_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

// Marks an action or question as resolved, or open again (US-020). Any other kind of note is
// answered like a missing one.
export async function setNoteResolved(
  noteId: unknown,
  resolved: unknown,
): Promise<ResolveNoteResult> {
  const id = noteIdSchema.safeParse(noteId);
  const flag = z.boolean().safeParse(resolved);
  const user = await requireUser();
  if (!id.success || !flag.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, RESOLVE_NOTE_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    return (await markResolved(user.id, id.data, flag.data))
      ? { ok: true }
      : { ok: false, errorKey: "notFound" };
  } catch (error) {
    logFailure(RESOLVE_NOTE_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

// Deletes a note (the page asks for confirmation first).
export async function deleteNote(noteId: unknown): Promise<DeleteNoteResult> {
  const id = noteIdSchema.safeParse(noteId);
  const user = await requireUser();
  if (!id.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, DELETE_NOTE_QUOTA))) {
      logNoteEvent({
        event: "notes.delete_rate_limited",
        userId: user.id,
        noteId: id.data,
      });
      return { ok: false, errorKey: "rateLimited" };
    }
    if (!(await removeNote(user.id, id.data))) {
      return { ok: false, errorKey: "notFound" };
    }
    logNoteEvent({ event: "notes.deleted", userId: user.id, noteId: id.data });
    return { ok: true };
  } catch (error) {
    logFailure(DELETE_NOTE_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

"use server";

import { bookIdSchema } from "@/domain/books/book-input";
import {
  addNodesSchema,
  nodeIdSchema,
  moveNodeSchema,
  nodeDetailsSchema,
  type NodeInputError,
} from "@/domain/structure/node-input";
import {
  readingDatesSchema,
  readingStatusSchema,
} from "@/domain/reading/reading-input";
import { calendarDay, type ReadingDateError } from "@/domain/reading/status";
import { APP_TIME_ZONE } from "@/i18n/time-zone";
import { requireUser } from "@/server/auth/session";
import {
  addNodes as insertNodes,
  completeAll as completeLeaves,
  deleteNode as removeNode,
  moveNode as relocateNode,
  setReadingDates as writeReadingDates,
  setReadingStatus as writeReadingStatus,
  updateNode as changeNode,
} from "@/server/repositories/book-nodes";
import {
  consumeWriteQuota,
  type WriteQuota,
} from "@/server/repositories/write-quota";

// Book structure Server Actions (US-010). Each one is a public endpoint (rule server-actions): Zod
// first, then requireUser(), then the quota and the repository with the session's userId. The ids
// (book, parent, node) are arguments anyone can forge: they are parsed like any other input, and a
// malformed id, a missing book or node and another reader's all get the same "notFound", answered
// only once the session is checked.

// Keys under `structure.errors` in messages/pt-BR.json.
export type StructureErrorKey =
  | NodeInputError
  | ReadingDateError
  | "notLeaf"
  | "notParent"
  | "dateInvalid"
  | "invalidPlacement"
  | "tooManyNodes"
  | "notFound"
  | "rateLimited"
  | "failed";

export type AddNodesResult =
  | { ok: true; data: { count: number } }
  | { ok: false; errorKey: StructureErrorKey; field?: "titles" | "kind" };

export type UpdateNodeResult =
  | { ok: true }
  | {
      ok: false;
      errorKey: StructureErrorKey;
      field?: "title" | "summary" | "goalPages";
    };

export type MoveNodeResult =
  | { ok: true }
  | {
      ok: false;
      errorKey: "notFound" | "invalidPlacement" | "rateLimited" | "failed";
    };

export type ReadingResult =
  | { ok: true }
  | {
      ok: false;
      errorKey: StructureErrorKey;
      field?: "startedAt" | "completedAt";
    };

export type CompleteAllResult =
  | { ok: true; data: { completed: number } }
  | {
      ok: false;
      errorKey: "notFound" | "notParent" | "rateLimited" | "failed";
    };

export type DeleteNodeResult =
  { ok: true } | { ok: false; errorKey: "notFound" | "rateLimited" | "failed" };

// A whole table of contents arrives in a few pastes of up to 100 titles each.
const ADD_NODES_QUOTA = {
  action: "structure.create",
  limit: 30,
  windowSeconds: 60,
} satisfies WriteQuota;
// Fixing several titles, summaries or goals in a row is normal; 60 a minute still stops a script.
const UPDATE_NODE_QUOTA = {
  action: "structure.update",
  limit: 60,
  windowSeconds: 60,
} satisfies WriteQuota;
// Moving a node a few places up or down is one call per click; 60 a minute still stops a script.
const MOVE_NODE_QUOTA = {
  action: "structure.move",
  limit: 60,
  windowSeconds: 60,
} satisfies WriteQuota;
// Marking where one is in the book: a click per chapter or topic.
const READING_STATUS_QUOTA = {
  action: "reading.status",
  limit: 60,
  windowSeconds: 60,
} satisfies WriteQuota;
const READING_DATES_QUOTA = {
  action: "reading.dates",
  limit: 60,
  windowSeconds: 60,
} satisfies WriteQuota;
// Each "complete all" needs a confirmation in the page.
const COMPLETE_ALL_QUOTA = {
  action: "reading.completeAll",
  limit: 30,
  windowSeconds: 60,
} satisfies WriteQuota;
// Each deletion needs a confirmation in the page.
const DELETE_NODE_QUOTA = {
  action: "structure.delete",
  limit: 30,
  windowSeconds: 60,
} satisfies WriteQuota;

// Only the Postgres error code: messages may echo the reader's titles (zero-trust.md, 3.3).
function logFailure(action: string, error: unknown) {
  console.error(`${action} failed`, {
    code: (error as { code?: unknown } | null)?.code,
  });
}

// Security events (zero-trust.md, 3.3): ids and a timestamp, never a title.
function logNodeDeleted(userId: string, nodeId: string) {
  console.info(
    JSON.stringify({
      event: "structure.node_deleted",
      userId,
      nodeId,
      at: new Date().toISOString(),
    }),
  );
}

// Adds the pasted titles (one per line) as nodes of the chosen kind at the end of `parentId`'s
// children, or of the book's root when it is null.
export async function addNodes(
  bookId: unknown,
  parentId: unknown,
  input: unknown,
): Promise<AddNodesResult> {
  const book = bookIdSchema.safeParse(bookId);
  const parent =
    parentId === null
      ? { success: true as const, data: null }
      : nodeIdSchema.safeParse(parentId);
  const parsed = addNodesSchema.safeParse(input);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    return issue.path[0] === "kind"
      ? { ok: false, errorKey: "invalidPlacement", field: "kind" }
      : issue.path[0] === "titles"
        ? {
            ok: false,
            errorKey: issue.message as NodeInputError,
            field: "titles",
          }
        : { ok: false, errorKey: "titlesRequired", field: "titles" };
  }

  const user = await requireUser();
  if (!book.success || !parent.success)
    return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, ADD_NODES_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    const added = await insertNodes(user.id, {
      bookId: book.data,
      parentId: parent.data,
      kind: parsed.data.kind,
      titles: parsed.data.titles,
    });
    return added.ok
      ? { ok: true, data: { count: added.ids.length } }
      : { ok: false, errorKey: added.reason };
  } catch (error) {
    logFailure(ADD_NODES_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

// Edits a node's title, summary and goal (US-011).
export async function updateNode(
  nodeId: unknown,
  input: unknown,
): Promise<UpdateNodeResult> {
  const id = nodeIdSchema.safeParse(nodeId);
  const parsed = nodeDetailsSchema.safeParse(input);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const field = issue.path[0];
    return field === "title" || field === "summary" || field === "goalPages"
      ? { ok: false, errorKey: issue.message as NodeInputError, field }
      : { ok: false, errorKey: "titleRequired", field: "title" };
  }

  const user = await requireUser();
  if (!id.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, UPDATE_NODE_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    return (await changeNode(user.id, id.data, parsed.data))
      ? { ok: true }
      : { ok: false, errorKey: "notFound" };
  } catch (error) {
    logFailure(UPDATE_NODE_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

// Reorders a node among its siblings or moves it under another parent of the same book (US-012).
export async function moveNode(
  nodeId: unknown,
  input: unknown,
): Promise<MoveNodeResult> {
  const id = nodeIdSchema.safeParse(nodeId);
  const parsed = moveNodeSchema.safeParse(input);

  const user = await requireUser();
  // A malformed destination is answered like a missing one.
  if (!id.success || !parsed.success)
    return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, MOVE_NODE_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    const moved = await relocateNode(user.id, id.data, parsed.data);
    return moved.ok ? { ok: true } : { ok: false, errorKey: moved.reason };
  } catch (error) {
    logFailure(MOVE_NODE_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

// "Today" for reading dates: the calendar day in the app's time zone (D-19), never the client's.
const today = () => calendarDay(new Date(), APP_TIME_ZONE);

// Marks a leaf as not started, in progress or completed (US-013), filling or clearing its dates.
export async function setReadingStatus(
  nodeId: unknown,
  input: unknown,
): Promise<ReadingResult> {
  const id = nodeIdSchema.safeParse(nodeId);
  const parsed = readingStatusSchema.safeParse(input);

  const user = await requireUser();
  // A malformed node or state is answered like a missing node.
  if (!id.success || !parsed.success)
    return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, READING_STATUS_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    const changed = await writeReadingStatus(
      user.id,
      id.data,
      parsed.data.status,
      today(),
    );
    return changed.ok ? { ok: true } : { ok: false, errorKey: changed.reason };
  } catch (error) {
    logFailure(READING_STATUS_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

// Replaces a leaf's reading dates, to log a past reading (US-013).
export async function setReadingDates(
  nodeId: unknown,
  input: unknown,
): Promise<ReadingResult> {
  const id = nodeIdSchema.safeParse(nodeId);
  const parsed = readingDatesSchema.safeParse(input);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    return {
      ok: false,
      errorKey: "dateInvalid",
      field: issue.path[0] === "completedAt" ? "completedAt" : "startedAt",
    };
  }

  const user = await requireUser();
  if (!id.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, READING_DATES_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    const changed = await writeReadingDates(
      user.id,
      id.data,
      parsed.data,
      today(),
    );
    if (changed.ok) return { ok: true };
    return "field" in changed
      ? { ok: false, errorKey: changed.reason, field: changed.field }
      : { ok: false, errorKey: changed.reason };
  } catch (error) {
    logFailure(READING_DATES_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

// Completes every leaf under a node with children (US-014, D-07); its own state follows.
export async function completeAll(nodeId: unknown): Promise<CompleteAllResult> {
  const id = nodeIdSchema.safeParse(nodeId);
  const user = await requireUser();
  if (!id.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, COMPLETE_ALL_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    const result = await completeLeaves(user.id, id.data, today());
    return result.ok
      ? { ok: true, data: { completed: result.completed } }
      : { ok: false, errorKey: result.reason };
  } catch (error) {
    logFailure(COMPLETE_ALL_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

// Deletes the node with its whole subtree.
export async function deleteNode(nodeId: unknown): Promise<DeleteNodeResult> {
  const id = nodeIdSchema.safeParse(nodeId);
  const user = await requireUser();
  if (!id.success) return { ok: false, errorKey: "notFound" };

  try {
    if (!(await consumeWriteQuota(user.id, DELETE_NODE_QUOTA))) {
      return { ok: false, errorKey: "rateLimited" };
    }
    if (!(await removeNode(user.id, id.data))) {
      return { ok: false, errorKey: "notFound" };
    }
    logNodeDeleted(user.id, id.data);
    return { ok: true };
  } catch (error) {
    logFailure(DELETE_NODE_QUOTA.action, error);
    return { ok: false, errorKey: "failed" };
  }
}

import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import type { Database } from "@/db/client";

// Two-reader isolation harness (ADR-0008 item 5, US-006). Every repository that touches a reader's
// data registers its operations here: each one is called by an intruder on the owner's resource
// and must behave exactly like a call on a resource that does not exist ("not found"), without
// changing the owner's data. See docs/architecture/data-access.md.

export type Reader = { id: string; email: string };

export type IsolationSpec<Resource> = {
  // Creates a resource owned by `ownerId` and returns what the operations take as their target.
  seed: (ownerId: string) => Promise<Resource>;
  // The same target pointing at a resource that does not exist (e.g. a fresh id).
  missing: (owned: Resource) => Resource;
  // The owner's view of the resource, compared before and after the intruder's calls.
  snapshot: (ownerId: string, owned: Resource) => Promise<unknown>;
  // Whether an operation's result carries the owned resource (an item of a list, a found row…).
  // Catches a list that returns the intruder's own items plus someone else's.
  contains: (result: unknown, owned: Resource) => boolean;
  // Read, list, update, delete, move…: every repository function that takes a target.
  operations: Record<
    string,
    (userId: string, target: Resource) => Promise<unknown>
  >;
};

type Outcome = { value: unknown } | { error: string };

// A thrown error (e.g. Next's notFound()) is compared like a returned value.
async function settle(call: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { value: await call() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// Runs one operation against two readers and returns what went wrong (empty = isolated).
export async function checkIsolation<Resource>(
  spec: IsolationSpec<Resource>,
  operation: string,
  owner: Reader,
  intruder: Reader,
): Promise<string[]> {
  const run = spec.operations[operation];
  const problems: string[] = [];

  const owned = await spec.seed(owner.id);
  const before = await spec.snapshot(owner.id, owned);

  const onForeign = await settle(() => run(intruder.id, owned));
  const onMissing = await settle(() => run(intruder.id, spec.missing(owned)));
  if (!isDeepStrictEqual(onForeign, onMissing)) {
    problems.push(
      `${operation}: another reader's resource is distinguishable from a missing one`,
    );
  }

  if ("value" in onForeign && spec.contains(onForeign.value, owned)) {
    problems.push(`${operation}: an intruder received the owner's resource`);
  }

  const after = await spec.snapshot(owner.id, owned);
  if (!isDeepStrictEqual(before, after)) {
    problems.push(`${operation}: an intruder changed the owner's resource`);
  }

  // Positive control: the same call by the owner must reach the resource, or the checks above
  // would pass for an operation that never finds anything.
  const byOwner = await settle(() => run(owner.id, owned));
  if (isDeepStrictEqual(byOwner, onForeign)) {
    problems.push(`${operation}: the owner does not reach their own resource`);
  }

  return problems;
}

// Creates two readers with throwaway e-mails under `domain` and removes them (with everything
// that cascades from them) after each test.
export function useReaders(db: Database, domain: string) {
  const readers: { owner: Reader; intruder: Reader } = {
    owner: { id: "", email: "" },
    intruder: { id: "", email: "" },
  };

  async function cleanUp() {
    await db.delete(schema.user).where(like(schema.user.email, `%@${domain}`));
  }

  beforeAll(cleanUp);
  afterEach(cleanUp);
  afterAll(cleanUp);

  return {
    readers,
    async create() {
      for (const role of ["owner", "intruder"] as const) {
        const reader = {
          id: randomUUID(),
          email: `${role}-${randomUUID()}@${domain}`,
        };
        await db.insert(schema.user).values({
          ...reader,
          name: role,
          emailVerified: true,
        });
        readers[role] = reader;
      }
      return readers;
    },
  };
}

// One test per operation: `describeIsolation(db, "sessions", spec)`.
export function describeIsolation<Resource>(
  db: Database,
  resource: string,
  spec: IsolationSpec<Resource>,
) {
  describe(`${resource}: isolation between two readers`, () => {
    const { create } = useReaders(db, `isolation-${resource}.test`);

    it.each(Object.keys(spec.operations))(
      "%s on another reader's resource answers like a missing one",
      async (operation) => {
        const { owner, intruder } = await create();
        expect(await checkIsolation(spec, operation, owner, intruder)).toEqual(
          [],
        );
      },
    );
  });
}

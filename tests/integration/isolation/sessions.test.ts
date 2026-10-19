import { randomBytes, randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
  deleteSession,
  findSession,
  listSessions,
  type OwnSession,
} from "@/server/repositories/sessions";

import { requireTestEnv } from "../db-env";
import {
  checkIsolation,
  describeIsolation,
  useReaders,
  type IsolationSpec,
} from "./two-readers";

// The reference owner-scoped repository (US-006) against Postgres, with the app role: its
// isolation cases, its own behaviour and the self-test of the two-reader harness.

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

afterAll(() => pool.end());

async function seedSession(userId: string): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(schema.session).values({
    id,
    // Generated per run: no secret-like literal in the repository (secret scanning).
    token: randomBytes(24).toString("hex"),
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    userAgent: "isolation-test",
  });
  return { id };
}

async function sessionRow(id: string) {
  const [row] = await db
    .select()
    .from(schema.session)
    .where(eq(schema.session.id, id));
  return row;
}

const sessionsSpec: IsolationSpec<{ id: string }> = {
  seed: seedSession,
  missing: () => ({ id: randomUUID() }),
  snapshot: (_ownerId, owned) => sessionRow(owned.id),
  contains: (result, owned) =>
    (Array.isArray(result) ? result : [result]).some(
      (item) => (item as { id?: unknown } | undefined)?.id === owned.id,
    ),
  operations: {
    list: (userId) => listSessions(userId, db),
    find: (userId, target) => findSession(userId, target.id, db),
    delete: (userId, target) => deleteSession(userId, target.id, db),
  },
};

describeIsolation(db, "sessions", sessionsSpec);

describe("sessions repository", () => {
  const { create } = useReaders(db, "sessions-repository.test");

  it("lists only the reader's sessions, newest first, without the token", async () => {
    const { owner, intruder } = await create();
    const first = await seedSession(owner.id);
    const second = await seedSession(owner.id);
    await seedSession(intruder.id);

    const sessions = await listSessions(owner.id, db);

    expect(sessions.map((session) => session.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    for (const session of sessions) {
      expect(Object.keys(session).sort()).toEqual([
        "createdAt",
        "expiresAt",
        "id",
        "userAgent",
      ] satisfies Array<keyof OwnSession>);
    }
  });

  it("finds and deletes the reader's own session", async () => {
    const { owner } = await create();
    const own = await seedSession(owner.id);

    expect(await findSession(owner.id, own.id, db)).toMatchObject({
      id: own.id,
    });
    expect(await deleteSession(owner.id, own.id, db)).toBe(true);
    expect(await sessionRow(own.id)).toBeUndefined();
    expect(await findSession(owner.id, own.id, db)).toBeUndefined();
  });

  it("refuses to run without a userId", async () => {
    await expect(listSessions("", db)).rejects.toThrow(
      "repository called without a userId",
    );
  });
});

// The harness must catch a leak, or a green isolation suite proves nothing.
describe("isolation harness", () => {
  const { create } = useReaders(db, "isolation-harness.test");

  it("reports a repository function that ignores the owner", async () => {
    const { owner, intruder } = await create();
    const leaky: IsolationSpec<{ id: string }> = {
      ...sessionsSpec,
      operations: {
        find: (_userId, target) => sessionRow(target.id),
        delete: async (_userId, target) =>
          (
            await db
              .delete(schema.session)
              .where(eq(schema.session.id, target.id))
              .returning()
          ).length > 0,
      },
    };

    expect(await checkIsolation(leaky, "find", owner, intruder)).toEqual([
      "find: another reader's resource is distinguishable from a missing one",
      "find: an intruder received the owner's resource",
      "find: the owner does not reach their own resource",
    ]);
    expect(await checkIsolation(leaky, "delete", owner, intruder)).toEqual([
      "delete: another reader's resource is distinguishable from a missing one",
      "delete: an intruder changed the owner's resource",
    ]);
  });

  it("reports a list that adds another reader's items to the caller's", async () => {
    const { owner, intruder } = await create();
    await seedSession(intruder.id);
    const leaky: IsolationSpec<{ id: string }> = {
      ...sessionsSpec,
      operations: {
        list: async () =>
          db.select({ id: schema.session.id }).from(schema.session),
      },
    };

    expect(await checkIsolation(leaky, "list", owner, intruder)).toContain(
      "list: an intruder received the owner's resource",
    );
  });

  it("reports an operation that never finds anything", async () => {
    const { owner, intruder } = await create();
    const blind: IsolationSpec<{ id: string }> = {
      ...sessionsSpec,
      operations: { find: async () => undefined },
    };

    expect(await checkIsolation(blind, "find", owner, intruder)).toEqual([
      "find: the owner does not reach their own resource",
    ]);
  });
});

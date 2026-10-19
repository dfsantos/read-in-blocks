import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireTestEnv } from "./db-env";

// RLS spike (US-006, ADR-0008 item 6): can Postgres Row Level Security be a second barrier with
// our driver (pg Pool, Neon's transaction-mode pooler in production) and the `app` role, which has
// no BYPASSRLS? The table lives only for this file; nothing here ships as a migration.
// Result and recommendation: ADR-0008, "Adendo (US-006)".

const TABLE = "rls_spike_note";

const migrator = new Client({
  connectionString: requireTestEnv("TEST_MIGRATOR_DATABASE_URL"),
});
// One connection, so every test reuses it exactly like a pooled connection is reused between
// requests: anything a request leaves behind is visible to the next one.
const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 1,
});
const db = drizzle({ client: pool });

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

const READER_A = randomUUID();
const READER_B = randomUUID();

// The prototype of a per-request helper: the owner is set for this transaction only
// (set_config's third argument), so it is gone when the connection returns to the pool. In
// transaction-mode pooling (Neon) this is the only kind of setting that is safe.
async function withOwner<T>(
  userId: string,
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return run(tx);
  });
}

async function bodies(
  executor: Pick<NodePgDatabase, "execute">,
): Promise<string[]> {
  const result = await executor.execute<{ body: string }>(
    sql.raw(`select body from ${TABLE} order by body`),
  );
  return result.rows.map((row) => row.body);
}

// Drizzle wraps driver errors ("Failed query: …"); the Postgres message is the cause.
async function postgresError(attempt: Promise<unknown>): Promise<string> {
  try {
    await attempt;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    return cause instanceof Error ? cause.message : String(cause);
  }
  return "no error";
}

beforeAll(async () => {
  await migrator.connect();
  // The migrator owns the table, as it would own a real content table; migration 0000's default
  // privileges grant DML on it to app.
  await migrator.query(`drop table if exists ${TABLE}`);
  await migrator.query(`
    create table ${TABLE} (
      id uuid primary key default gen_random_uuid(),
      owner_id text not null,
      body text not null
    )`);
  await migrator.query(`alter table ${TABLE} enable row level security`);
  // current_setting(..., true) is NULL (or '') when unset, and neither equals an owner_id: no
  // owner, no rows (fails closed).
  await migrator.query(`
    create policy owner_only on ${TABLE} to app
      using (owner_id = current_setting('app.user_id', true))
      with check (owner_id = current_setting('app.user_id', true))`);
});

beforeEach(async () => {
  // The owner bypasses RLS (no FORCE ROW LEVEL SECURITY), so seeding through it is unrestricted.
  await migrator.query(`delete from ${TABLE}`);
  await migrator.query(
    `insert into ${TABLE} (owner_id, body) values ($1, 'a1'), ($1, 'a2'), ($2, 'b1')`,
    [READER_A, READER_B],
  );
});

afterAll(async () => {
  await migrator.query(`drop table if exists ${TABLE}`);
  await migrator.end();
  await pool.end();
});

describe("RLS spike", () => {
  it("the app role has no BYPASSRLS", async () => {
    const result = await db.execute<{ rolbypassrls: boolean }>(
      sql`select rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(result.rows).toEqual([{ rolbypassrls: false }]);
  });

  it("shows nothing when no owner is set (a forgotten helper fails closed)", async () => {
    expect(await bodies(db)).toEqual([]);
    expect(
      await postgresError(
        db.execute(
          sql.raw(`insert into ${TABLE} (owner_id, body) values ('x', 'y')`),
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it("shows only the owner's rows, even with a query that forgot the owner filter", async () => {
    expect(await withOwner(READER_A, (tx) => bodies(tx))).toEqual(["a1", "a2"]);
    expect(await withOwner(READER_B, (tx) => bodies(tx))).toEqual(["b1"]);
  });

  it("refuses to update, delete or create another reader's rows", async () => {
    await withOwner(READER_A, async (tx) => {
      const updated = await tx.execute(
        sql.raw(`update ${TABLE} set body = 'hacked' where body = 'b1'`),
      );
      const deleted = await tx.execute(
        sql.raw(`delete from ${TABLE} where body = 'b1'`),
      );
      expect([updated.rowCount, deleted.rowCount]).toEqual([0, 0]);
    });
    expect(
      await postgresError(
        withOwner(READER_A, (tx) =>
          tx.execute(
            sql`insert into ${sql.raw(TABLE)} (owner_id, body) values (${READER_B}, 'planted')`,
          ),
        ),
      ),
    ).toMatch(/row-level security/);
    expect(await withOwner(READER_B, (tx) => bodies(tx))).toEqual(["b1"]);
  });

  it("refuses to move a row to another owner", async () => {
    expect(
      await postgresError(
        withOwner(READER_A, (tx) =>
          tx.execute(
            sql`update ${sql.raw(TABLE)} set owner_id = ${READER_B} where body = 'a1'`,
          ),
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it("forgets the owner when the transaction ends, on the same pooled connection", async () => {
    await withOwner(READER_A, (tx) => bodies(tx));
    const leftover = await db.execute<{ owner: string | null }>(
      sql`select current_setting('app.user_id', true) as owner`,
    );
    // Postgres keeps an emptied placeholder after the transaction: '' matches no owner.
    expect([null, ""]).toContain(leftover.rows[0].owner);
    expect(await bodies(db)).toEqual([]);
  });

  it("forgets the owner after a rollback too", async () => {
    await expect(
      withOwner(READER_A, async () => {
        throw new Error("request failed");
      }),
    ).rejects.toThrow("request failed");
    expect(await bodies(db)).toEqual([]);
  });

  // Why the helper must use transaction-local settings: a session-level one survives on the
  // pooled connection and hands the next request someone else's rows.
  it("a session-level setting would leak to the next request (hazard to avoid)", async () => {
    await db.execute(sql`select set_config('app.user_id', ${READER_A}, false)`);
    try {
      expect(await bodies(db)).toEqual(["a1", "a2"]);
    } finally {
      await db.execute(sql`reset app.user_id`);
    }
    expect(await bodies(db)).toEqual([]);
  });

  it("the app role cannot switch RLS off", async () => {
    expect(
      await postgresError(
        db.execute(sql.raw(`alter table ${TABLE} disable row level security`)),
      ),
    ).toMatch(/must be owner/);
    // row_security = off does not bypass: it turns a filtered query into an error.
    expect(
      await postgresError(
        withOwner(READER_A, async (tx) => {
          await tx.execute(sql`set local row_security = off`);
          return bodies(tx);
        }),
      ),
    ).toMatch(/row-level security/);
  });

  // Limit of the barrier: the app chooses the owner it sets. RLS catches a forgotten filter, not a
  // compromised server that sets another reader's id; the id must still come from requireUser().
  it("trusts whatever owner the app sets", async () => {
    expect(await withOwner(READER_B, (tx) => bodies(tx))).toEqual(["b1"]);
  });
});

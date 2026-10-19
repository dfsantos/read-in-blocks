import { randomUUID } from "node:crypto";

import { asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { appRole, ownerPolicy } from "@/db/rls";
import { ownedBy } from "@/server/repositories/owner-scope";
import { withOwner } from "@/server/repositories/with-owner";

import { requireTestEnv } from "./db-env";

// Postgres RLS as the second barrier of the data isolation (US-033, ADR-0008 item 6). The proof
// table follows the content-table convention (owner_id text + ownerPolicy()) and is created from
// the SQL drizzle-kit generates for it, so these tests cover the migration convention too. It lives
// only for this file; nothing here ships as a migration.

const proofNote = pgTable(
  "rls_proof_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    body: text("body").notNull(),
  },
  () => [ownerPolicy()],
);

const migrator = new Client({
  connectionString: requireTestEnv("TEST_MIGRATOR_DATABASE_URL"),
});
// One connection, so every test reuses it exactly like a pooled connection is reused between
// requests: anything a request leaves behind is visible to the next one.
const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 1,
});
const db = drizzle({ client: pool, schema });

const READER_A = randomUUID();
const READER_B = randomUUID();

let generated: string[] = [];

type Executor = Pick<typeof db, "select">;

// Deliberately without an owner filter: what RLS alone lets through.
async function bodies(executor: Executor): Promise<string[]> {
  const rows = await executor
    .select({ body: proofNote.body })
    .from(proofNote)
    .orderBy(asc(proofNote.body));
  return rows.map((row) => row.body);
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

async function currentOwner(): Promise<string | null> {
  const result = await db.execute<{ owner: string | null }>(
    sql`select current_setting('app.user_id', true) as owner`,
  );
  return result.rows[0].owner;
}

beforeAll(async () => {
  await migrator.connect();
  await migrator.query(`drop table if exists rls_proof_note`);
  generated = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson({ appRole, proofNote }),
  );
  // The migrator owns the table, as it owns every content table; migration 0000's default
  // privileges grant DML on it to app.
  for (const statement of generated) await migrator.query(statement);
});

beforeEach(async () => {
  // The owner bypasses RLS (no FORCE ROW LEVEL SECURITY), so seeding through it is unrestricted.
  await migrator.query(`delete from rls_proof_note`);
  await migrator.query(
    `insert into rls_proof_note (owner_id, body) values ($1, 'a1'), ($1, 'a2'), ($2, 'b1')`,
    [READER_A, READER_B],
  );
});

afterAll(async () => {
  await migrator.query(`drop table if exists rls_proof_note`);
  await migrator.end();
  await pool.end();
});

describe("content-table migration convention", () => {
  it("drizzle-kit generates RLS and the owner policy for app, without creating the role", () => {
    const ddl = generated.join("\n");
    expect(ddl).toMatch(
      /ALTER TABLE "rls_proof_note" ENABLE ROW LEVEL SECURITY/,
    );
    expect(ddl).toMatch(
      /CREATE POLICY "owner_only" ON "rls_proof_note" AS PERMISSIVE FOR ALL TO "app" USING \(owner_id = current_setting\('app\.user_id', true\)\) WITH CHECK \(owner_id = current_setting\('app\.user_id', true\)\)/,
    );
    expect(ddl).not.toMatch(/CREATE ROLE/i);
  });
});

describe("withOwner", () => {
  it("refuses a missing userId before touching the database", async () => {
    await expect(withOwner("", () => bodies(db), db)).rejects.toThrow(
      "repository called without a userId",
    );
    await expect(
      withOwner(undefined as unknown as string, () => bodies(db), db),
    ).rejects.toThrow("repository called without a userId");
  });

  it("shows only the owner's rows, even to a query that forgot the owner filter", async () => {
    expect(await withOwner(READER_A, (tx) => bodies(tx), db)).toEqual([
      "a1",
      "a2",
    ]);
    expect(await withOwner(READER_B, (tx) => bodies(tx), db)).toEqual(["b1"]);
  });

  it("keeps working together with the ownedBy filter (both barriers)", async () => {
    const rows = await withOwner(
      READER_A,
      (tx) =>
        tx
          .select({ body: proofNote.body })
          .from(proofNote)
          .where(ownedBy(proofNote.ownerId, READER_A))
          .orderBy(asc(proofNote.body)),
      db,
    );
    expect(rows.map((row) => row.body)).toEqual(["a1", "a2"]);
    // A filter naming another reader inside A's transaction: RLS still hides B's rows.
    const foreign = await withOwner(
      READER_A,
      (tx) =>
        tx
          .select({ body: proofNote.body })
          .from(proofNote)
          .where(ownedBy(proofNote.ownerId, READER_B)),
      db,
    );
    expect(foreign).toEqual([]);
  });

  it("refuses to update, delete or create another reader's rows", async () => {
    await withOwner(
      READER_A,
      async (tx) => {
        const updated = await tx.execute(
          sql`update rls_proof_note set body = 'hacked' where body = 'b1'`,
        );
        const deleted = await tx.execute(
          sql`delete from rls_proof_note where body = 'b1'`,
        );
        expect([updated.rowCount, deleted.rowCount]).toEqual([0, 0]);
      },
      db,
    );
    expect(
      await postgresError(
        withOwner(
          READER_A,
          (tx) =>
            tx.insert(proofNote).values({ ownerId: READER_B, body: "planted" }),
          db,
        ),
      ),
    ).toMatch(/row-level security/);
    expect(await withOwner(READER_B, (tx) => bodies(tx), db)).toEqual(["b1"]);
  });

  it("refuses to move a row to another reader", async () => {
    expect(
      await postgresError(
        withOwner(
          READER_A,
          (tx) =>
            tx.execute(
              sql`update rls_proof_note set owner_id = ${READER_B} where body = 'a1'`,
            ),
          db,
        ),
      ),
    ).toMatch(/row-level security/);
    expect(await withOwner(READER_B, (tx) => bodies(tx), db)).toEqual(["b1"]);
  });

  it("forgets the owner when the transaction commits, on the same pooled connection", async () => {
    await withOwner(READER_A, (tx) => bodies(tx), db);
    // Postgres keeps an emptied placeholder after the transaction: '' matches no owner.
    expect([null, ""]).toContain(await currentOwner());
    expect(await bodies(db)).toEqual([]);
  });

  it("forgets the owner after an error rolls the transaction back", async () => {
    await expect(
      withOwner(
        READER_A,
        async (tx) => {
          await bodies(tx);
          throw new Error("request failed");
        },
        db,
      ),
    ).rejects.toThrow("request failed");
    expect([null, ""]).toContain(await currentOwner());
    expect(await bodies(db)).toEqual([]);
  });

  it("forgets the owner after a failed query aborts the transaction", async () => {
    await postgresError(
      withOwner(
        READER_A,
        (tx) => tx.execute(sql`select * from table_that_does_not_exist`),
        db,
      ),
    );
    expect(await bodies(db)).toEqual([]);
  });
});

describe("without withOwner (a forgotten helper fails closed)", () => {
  it("shows nothing and refuses to insert", async () => {
    expect(await bodies(db)).toEqual([]);
    expect(
      await postgresError(
        db.insert(proofNote).values({ ownerId: READER_A, body: "x" }),
      ),
    ).toMatch(/row-level security/);
  });

  it("the app role cannot switch RLS off", async () => {
    const [{ rolbypassrls }] = (
      await db.execute<{ rolbypassrls: boolean }>(
        sql`select rolbypassrls from pg_roles where rolname = current_user`,
      )
    ).rows;
    expect(rolbypassrls).toBe(false);
    expect(
      await postgresError(
        db.execute(sql`alter table rls_proof_note disable row level security`),
      ),
    ).toMatch(/must be owner/);
    // row_security = off does not bypass: it turns a filtered query into an error.
    expect(
      await postgresError(
        withOwner(
          READER_A,
          async (tx) => {
            await tx.execute(sql`set local row_security = off`);
            return bodies(tx);
          },
          db,
        ),
      ),
    ).toMatch(/row-level security/);
  });
});

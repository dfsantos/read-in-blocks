import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { MIGRATION_LOCK_KEY, runMigrations } from "../../src/db/migrate";

import { requireTestEnv } from "./db-env";

const LOCK_NOT_AVAILABLE = "55P03";
const migratorUrl = requireTestEnv("TEST_MIGRATOR_DATABASE_URL");

async function countAppliedMigrations(client: Client): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    "SELECT count(*) AS count FROM drizzle.__drizzle_migrations",
  );
  return Number(rows[0]?.count);
}

describe("runMigrations (deploy migrations under an advisory lock)", () => {
  const holders: Client[] = [];

  afterEach(async () => {
    await Promise.all(holders.splice(0).map((client) => client.end()));
  });

  async function holdMigrationLock(): Promise<Client> {
    const holder = new Client({ connectionString: migratorUrl });
    holders.push(holder);
    await holder.connect();
    await holder.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    return holder;
  }

  it("waits for another run that holds the lock and gives up after the wait timeout", async () => {
    await holdMigrationLock();

    await expect(
      runMigrations(migratorUrl, { lockWaitTimeout: "200ms" }),
    ).rejects.toMatchObject({ code: LOCK_NOT_AVAILABLE });
  });

  it("proceeds once the other run releases the lock", async () => {
    const holder = await holdMigrationLock();
    const run = runMigrations(migratorUrl, { lockWaitTimeout: "10s" });
    setTimeout(() => {
      void holder.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    }, 200);

    await expect(run).resolves.toBeUndefined();
  });

  it("applies each migration once when two runs start together", async () => {
    const probe = new Client({ connectionString: migratorUrl });
    holders.push(probe);
    await probe.connect();
    const before = await countAppliedMigrations(probe);

    await Promise.all([runMigrations(migratorUrl), runMigrations(migratorUrl)]);

    expect(await countAppliedMigrations(probe)).toBe(before);
    const { rows } = await probe.query<{ held: string }>(
      "SELECT count(*) AS held FROM pg_locks WHERE locktype = 'advisory' AND granted",
    );
    expect(Number(rows[0]?.held)).toBe(0);
  });
});

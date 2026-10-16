import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

// Applies the versioned migrations with the migrator role (ADR-0014). Runs in the Vercel build
// (`pnpm db:migrate`) and before the integration tests. Kept free of path aliases so that Node can
// run it directly (`node src/db/migrate.ts`).

// Session advisory lock shared by every deploy: Preview builds share one Neon branch, so two
// builds must never apply migrations at the same time.
export const MIGRATION_LOCK_KEY = 7_242_031_029;

export interface MigrationOptions {
  migrationsFolder?: string;
  // How long to wait for another build that holds the migration lock.
  lockWaitTimeout?: string;
  // Default lock_timeout for the migration statements, so DDL waiting on a busy table fails fast
  // instead of blocking the app's queries behind it.
  statementLockTimeout?: string;
}

export async function runMigrations(
  connectionString: string,
  {
    migrationsFolder = "./src/db/migrations",
    lockWaitTimeout = "3min",
    statementLockTimeout = "10s",
  }: MigrationOptions = {},
): Promise<void> {
  assertDirectConnection(connectionString);
  // One client: the advisory lock belongs to the session that runs the migrations.
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT set_config('lock_timeout', $1, false)", [
      lockWaitTimeout,
    ]);
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    try {
      await client.query("SELECT set_config('lock_timeout', $1, false)", [
        statementLockTimeout,
      ]);
      await migrate(drizzle({ client }), { migrationsFolder });
    } finally {
      // Best effort: closing the session releases the lock anyway, and a failing unlock
      // (e.g. a dropped connection) must not hide the migration error.
      await client
        .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
        .catch(() => undefined);
    }
  } finally {
    await client.end();
  }
}

// A pooled Neon host (PgBouncer, transaction mode) does not keep session state, so the advisory
// lock and lock_timeout would silently not apply. The error never echoes the URL.
export function assertDirectConnection(connectionString: string): void {
  let hosts: string[];
  try {
    const url = new URL(connectionString);
    hosts = [url.hostname, ...url.searchParams.getAll("host")];
  } catch {
    throw new Error("MIGRATOR_DATABASE_URL is not a valid URL");
  }
  if (hosts.some((host) => host.split(".")[0]?.endsWith("-pooler"))) {
    throw new Error(
      "MIGRATOR_DATABASE_URL must use the direct (non-pooled) host, without -pooler",
    );
  }
}

async function main(): Promise<void> {
  // Local runs read .env.local; on Vercel and CI the variable comes from the environment.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.MIGRATOR_DATABASE_URL;
  if (!url) throw new Error("MIGRATOR_DATABASE_URL is not set");
  await runMigrations(url);
  console.log("Migrations applied.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    // Postgres and Drizzle errors carry the failing statement, never the connection string.
    console.error(
      "Migration failed:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}

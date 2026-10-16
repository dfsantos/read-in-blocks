import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let db: Database | undefined;

// Runtime connection with the least-privileged `app` role (DML only, ADR-0014).
// Created lazily so builds and tests without a database never open a connection.
export function getDb(): Database {
  if (db) return db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });
  // Idle clients can fail when the server drops them; the pool replaces them.
  // Log only the error code: messages may carry connection details.
  pool.on("error", (error: Error & { code?: string }) => {
    console.error("db: idle client error", { code: error.code });
  });
  attachDatabasePool(pool);

  db = drizzle({ client: pool, schema });
  return db;
}

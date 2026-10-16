import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { requireTestEnv } from "./db-env";

// Applies the versioned migrations to the test database with the migrator role,
// the same way the deploy does.
export default async function setup() {
  const pool = new Pool({
    connectionString: requireTestEnv("TEST_MIGRATOR_DATABASE_URL"),
  });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: "./src/db/migrations",
    });
  } finally {
    await pool.end();
  }
}

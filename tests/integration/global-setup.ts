import { runMigrations } from "../../src/db/migrate";

import { requireTestEnv } from "./db-env";

// Applies the versioned migrations to the test database with the migrator role,
// the same way the deploy does.
export default async function setup() {
  await runMigrations(requireTestEnv("TEST_MIGRATOR_DATABASE_URL"));
}

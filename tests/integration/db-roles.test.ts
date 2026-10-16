import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { requireTestEnv } from "./db-env";

const INSUFFICIENT_PRIVILEGE = "42501";

const app = new Pool({ connectionString: requireTestEnv("TEST_DATABASE_URL") });
const migrator = new Pool({
  connectionString: requireTestEnv("TEST_MIGRATOR_DATABASE_URL"),
});

afterAll(async () => {
  await Promise.all([app.end(), migrator.end()]);
});

describe("database roles (least privilege)", () => {
  it("connects as the app role, not as the migrator or a superuser", async () => {
    const { rows } = await app.query<{ user: string; superuser: boolean }>(
      "SELECT current_user AS user, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user",
    );
    expect(rows[0]).toEqual({ user: "app", superuser: false });
  });

  it("lets the app role read and write migrated tables", async () => {
    const key = `test-${crypto.randomUUID()}`;
    await app.query("INSERT INTO app_meta (key, value) VALUES ($1, $2)", [
      key,
      "v1",
    ]);
    await app.query("UPDATE app_meta SET value = $2 WHERE key = $1", [
      key,
      "v2",
    ]);
    const { rows } = await app.query(
      "SELECT value FROM app_meta WHERE key = $1",
      [key],
    );
    expect(rows).toEqual([{ value: "v2" }]);
    await app.query("DELETE FROM app_meta WHERE key = $1", [key]);
  });

  it.each([
    ["CREATE TABLE", "CREATE TABLE app_ddl_probe (id int)"],
    ["DROP TABLE", "DROP TABLE app_meta"],
    ["ALTER TABLE", "ALTER TABLE app_meta ADD COLUMN probe int"],
    ["TRUNCATE", "TRUNCATE app_meta"],
    ["CREATE SCHEMA", "CREATE SCHEMA app_probe"],
  ])("denies %s to the app role", async (_label, statement) => {
    await expect(app.query(statement)).rejects.toMatchObject({
      code: INSUFFICIENT_PRIVILEGE,
    });
  });

  it("records the applied migrations under the migrator role", async () => {
    const { rows } = await migrator.query<{ count: string }>(
      "SELECT count(*) AS count FROM drizzle.__drizzle_migrations",
    );
    expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(2);
  });
});

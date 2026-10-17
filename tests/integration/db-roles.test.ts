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

  it("gives app and migrator no elevated attribute and no role membership", async () => {
    const { rows } = await migrator.query(
      `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
         FROM pg_roles WHERE rolname IN ('app', 'migrator') ORDER BY rolname`,
    );
    const noAttributes = {
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
    };
    expect(rows).toEqual([
      { rolname: "app", ...noAttributes },
      { rolname: "migrator", ...noAttributes },
    ]);

    const memberships = await migrator.query(
      `SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
        WHERE r.rolname IN ('app', 'migrator')`,
    );
    expect(memberships.rows).toEqual([]);
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

  describe("default privileges on objects the migrator creates", () => {
    const suffix = crypto.randomUUID().replaceAll("-", "_");
    const table = `probe_serial_${suffix}`;
    const fn = `probe_fn_${suffix}`;

    afterAll(async () => {
      await migrator.query(`DROP TABLE IF EXISTS ${table}`);
      await migrator.query(`DROP FUNCTION IF EXISTS ${fn}()`);
    });

    it("lets the app role use the sequence of a serial table", async () => {
      await migrator.query(
        `CREATE TABLE ${table} (id serial PRIMARY KEY, label text NOT NULL)`,
      );
      const { rows } = await app.query<{ id: number }>(
        `INSERT INTO ${table} (label) VALUES ('a'), ('b') RETURNING id`,
      );
      expect(rows.map((row) => row.id)).toEqual([1, 2]);
    });

    it("does not let the app role execute functions by default", async () => {
      await migrator.query(
        `CREATE FUNCTION ${fn}() RETURNS int LANGUAGE sql AS 'SELECT 1'`,
      );
      await expect(app.query(`SELECT ${fn}()`)).rejects.toMatchObject({
        code: INSUFFICIENT_PRIVILEGE,
      });
    });
  });

  it("records the applied migrations under the migrator role", async () => {
    const { rows } = await migrator.query<{ count: string }>(
      "SELECT count(*) AS count FROM drizzle.__drizzle_migrations",
    );
    expect(Number(rows[0]?.count)).toBeGreaterThanOrEqual(2);
  });
});

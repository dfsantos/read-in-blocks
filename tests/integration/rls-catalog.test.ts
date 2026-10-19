import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requireTestEnv } from "./db-env";

// Catalog test for the RLS convention (US-033, ADR-0008 item 6): reads the migrated schema and
// fails when a content table (any table with an owner_id column) could be read without its
// owner's RLS policy. It covers every table created from US-007 on without being edited.

const migrator = new Client({
  connectionString: requireTestEnv("TEST_MIGRATOR_DATABASE_URL"),
});

const SYSTEM_SCHEMAS = `('pg_catalog', 'information_schema', 'pg_toast')`;

// pg_policies prints the expressions normalized, e.g. "(owner_id = current_setting('app.user_id'::text, true))".
const OWNER_EXPRESSIONS = new Set([
  "(owner_id = current_setting('app.user_id'::text, true))",
  // uuid owner columns (docs/architecture/database.md).
  "(owner_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)",
]);

type ContentTable = { schema: string; name: string; rls: boolean };
type Policy = {
  schema: string;
  table: string;
  name: string;
  permissive: string;
  roles: string[];
  cmd: string;
  qual: string | null;
  with_check: string | null;
};

// Everything that would let the app role read or write a content table without its owner policy.
// Stricter than "reaches a content table" on purpose: no view without security_invoker and no
// SECURITY DEFINER function anywhere outside the system schemas, since both run as their owner
// (the migrator, which RLS does not restrict).
async function rlsProblems(client: Client): Promise<string[]> {
  const problems: string[] = [];

  const tables = await client.query<ContentTable>(`
    select n.nspname as schema, c.relname as name, c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped
     where c.relkind in ('r', 'p') and n.nspname not in ${SYSTEM_SCHEMAS}
     order by 1, 2`);
  const policies = await client.query<Policy>(`
    select schemaname as schema, tablename as table, policyname as name, permissive,
           roles::text[] as roles, cmd, qual, with_check
      from pg_policies`);

  for (const table of tables.rows) {
    const label = `${table.schema}.${table.name}`;
    if (!table.rls) problems.push(`${label}: row level security disabled`);
    const own = policies.rows.filter(
      (policy) => policy.schema === table.schema && policy.table === table.name,
    );
    const isOwnerPolicy = (policy: Policy) =>
      OWNER_EXPRESSIONS.has(policy.qual ?? "") &&
      OWNER_EXPRESSIONS.has(policy.with_check ?? "");
    const ownerPolicy = own.find(
      (policy) =>
        policy.permissive === "PERMISSIVE" &&
        policy.cmd === "ALL" &&
        policy.roles.length === 1 &&
        policy.roles[0] === "app" &&
        isOwnerPolicy(policy),
    );
    if (!ownerPolicy) problems.push(`${label}: no owner policy for app`);
    // Permissive policies are OR-ed: any other one reaching app would widen what it sees.
    for (const policy of own) {
      const reachesApp =
        policy.roles.includes("app") || policy.roles.includes("public");
      if (
        policy !== ownerPolicy &&
        reachesApp &&
        policy.permissive === "PERMISSIVE"
      ) {
        problems.push(`${label}: extra permissive policy ${policy.name}`);
      }
    }
  }

  const views = await client.query<{ name: string }>(`
    select n.nspname || '.' || c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname not in ${SYSTEM_SCHEMAS}
       and (c.relkind = 'm'
            or (c.relkind = 'v' and not exists (
                  select 1 from unnest(coalesce(c.reloptions, '{}')) option
                   where lower(option) in ('security_invoker=true', 'security_invoker=on',
                                           'security_invoker=1', 'security_invoker=yes'))))
     order by 1`);
  for (const view of views.rows) {
    problems.push(`${view.name}: view runs as its owner (no security_invoker)`);
  }

  const definers = await client.query<{ name: string }>(`
    select n.nspname || '.' || p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef and n.nspname not in ${SYSTEM_SCHEMAS}
     order by 1`);
  for (const fn of definers.rows) {
    problems.push(`${fn.name}: SECURITY DEFINER function`);
  }

  return problems;
}

beforeAll(async () => {
  await migrator.connect();
});

afterAll(async () => {
  await migrator.end();
});

describe("RLS catalog", () => {
  it("every content table of the migrated schema has RLS and only the owner policy", async () => {
    expect(await rlsProblems(migrator)).toEqual([]);
  });

  // Control: the check must catch each way out. Built in a transaction that is rolled back, so the
  // shared test database never keeps these objects.
  it("catches tables, policies, views and functions that escape the owner policy", async () => {
    await migrator.query("begin");
    try {
      await migrator.query(`
        create table rls_catalog_no_rls (owner_id text not null);
        create table rls_catalog_no_policy (owner_id text not null);
        alter table rls_catalog_no_policy enable row level security;
        create table rls_catalog_weak (owner_id text not null);
        alter table rls_catalog_weak enable row level security;
        create policy owner_only on rls_catalog_weak to app using (true) with check (true);
        create table rls_catalog_widened (owner_id text not null);
        alter table rls_catalog_widened enable row level security;
        create policy owner_only on rls_catalog_widened to app
          using (owner_id = current_setting('app.user_id', true))
          with check (owner_id = current_setting('app.user_id', true));
        create policy everyone on rls_catalog_widened for select to public using (true);
        create table rls_catalog_uuid (owner_id uuid not null);
        alter table rls_catalog_uuid enable row level security;
        create policy owner_only on rls_catalog_uuid to app
          using (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)
          with check (owner_id = nullif(current_setting('app.user_id', true), '')::uuid);
        create view rls_catalog_definer_view as select * from rls_catalog_uuid;
        create view rls_catalog_invoker_view with (security_invoker = true)
          as select * from rls_catalog_uuid;
        create function rls_catalog_definer() returns bigint language sql security definer
          as 'select count(*) from rls_catalog_uuid';
      `);
      expect(await rlsProblems(migrator)).toEqual([
        "public.rls_catalog_no_policy: no owner policy for app",
        "public.rls_catalog_no_rls: row level security disabled",
        "public.rls_catalog_no_rls: no owner policy for app",
        "public.rls_catalog_weak: no owner policy for app",
        "public.rls_catalog_weak: extra permissive policy owner_only",
        "public.rls_catalog_widened: extra permissive policy everyone",
        "public.rls_catalog_definer_view: view runs as its owner (no security_invoker)",
        "public.rls_catalog_definer: SECURITY DEFINER function",
      ]);
    } finally {
      await migrator.query("rollback");
    }
  });
});

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requireTestEnv } from "./db-env";

// Catalog test for the RLS convention (US-033, ADR-0008 item 6): reads the migrated schema and
// fails when the app role could read or write a content table without its owner's RLS policy.
// Deny by default: every table app can reach is either a content table (owner_id + owner policy) or
// listed below as not holding reader content. A new table fails until someone classifies it, so
// this covers every table created from US-007 on.

const migrator = new Client({
  connectionString: requireTestEnv("TEST_MIGRATOR_DATABASE_URL"),
});

const SYSTEM_SCHEMAS = `('pg_catalog', 'information_schema', 'pg_toast')`;

// pg_policies prints the expressions normalized by Postgres 17, as below.
const OWNER_EXPRESSIONS = new Set([
  "(owner_id = NULLIF(current_setting('app.user_id'::text, true), ''::text))",
  // uuid owner columns (docs/architecture/database.md).
  "(owner_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)",
]);

// Tables app reaches that hold no reader content, or whose owner Better Auth's adapter cannot set
// (access limited to src/server/auth and the sessions repository, docs/architecture/data-access.md).
const NOT_CONTENT = new Set([
  "public.app_meta",
  "public.user",
  "public.session",
  "public.account",
  "public.verification",
  // Better Auth's rate-limit counters (US-028): one row per client IP and path, no reader.
  "public.rate_limit",
]);

type AppTable = {
  schema: string;
  name: string;
  rls: boolean;
  has_owner: boolean;
  owned_by_app: boolean;
};
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

  // Every table app can reach at all, with whether it carries an owner_id.
  const tables = await client.query<AppTable>(`
    select n.nspname as schema, c.relname as name, c.relrowsecurity as rls,
           exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped)
             as has_owner,
           c.relowner = 'app'::regrole as owned_by_app
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p') and n.nspname not in ${SYSTEM_SCHEMAS}
       and (has_table_privilege('app', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
            or c.relowner = 'app'::regrole)
     order by 1, 2`);
  const policies = await client.query<Policy>(`
    select schemaname as schema, tablename as table, policyname as name, permissive,
           roles::text[] as roles, cmd, qual, with_check
      from pg_policies`);

  for (const table of tables.rows) {
    const label = `${table.schema}.${table.name}`;
    // The owner of a table is not subject to its RLS.
    if (table.owned_by_app) problems.push(`${label}: owned by app`);
    if (!table.has_owner) {
      if (!NOT_CONTENT.has(label)) {
        problems.push(`${label}: reachable by app without owner_id`);
      }
      continue;
    }
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

  // Rules on tables run their actions as the table owner, like definer views.
  const rules = await client.query<{ name: string }>(`
    select n.nspname || '.' || c.relname || '.' || r.rulename as name
      from pg_rewrite r
      join pg_class c on c.oid = r.ev_class
      join pg_namespace n on n.oid = c.relnamespace
     where r.rulename <> '_RETURN' and n.nspname not in ${SYSTEM_SCHEMAS}
     order by 1`);
  for (const rule of rules.rows) {
    problems.push(`${rule.name}: rewrite rule`);
  }

  // RLS does not filter TRUNCATE, and REFERENCES/TRIGGER would let app reach rows another way.
  const extraPrivileges = await client.query<{ name: string }>(`
    select n.nspname || '.' || c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p') and n.nspname not in ${SYSTEM_SCHEMAS}
       and has_table_privilege('app', c.oid, 'TRUNCATE, REFERENCES, TRIGGER')
     order by 1`);
  for (const table of extraPrivileges.rows) {
    problems.push(`${table.name}: app has TRUNCATE, REFERENCES or TRIGGER`);
  }

  const role = await client.query<{ bypass: boolean }>(
    `select rolbypassrls as bypass from pg_roles where rolname = 'app'`,
  );
  if (role.rows[0]?.bypass !== false) problems.push("app: BYPASSRLS");

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
  it("catches tables, policies, views, rules, privileges and functions that escape the owner policy", async () => {
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
          using (owner_id = nullif(current_setting('app.user_id', true), ''))
          with check (owner_id = nullif(current_setting('app.user_id', true), ''));
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
        create table rls_catalog_unclassified (book_id uuid not null);
        create rule rls_catalog_rule as on insert to rls_catalog_unclassified do instead nothing;
        grant truncate on rls_catalog_uuid to app;
      `);
      expect(await rlsProblems(migrator)).toEqual([
        "public.rls_catalog_no_policy: no owner policy for app",
        "public.rls_catalog_no_rls: row level security disabled",
        "public.rls_catalog_no_rls: no owner policy for app",
        "public.rls_catalog_unclassified: reachable by app without owner_id",
        "public.rls_catalog_weak: no owner policy for app",
        "public.rls_catalog_weak: extra permissive policy owner_only",
        "public.rls_catalog_widened: extra permissive policy everyone",
        "public.rls_catalog_definer_view: view runs as its owner (no security_invoker)",
        "public.rls_catalog_unclassified.rls_catalog_rule: rewrite rule",
        "public.rls_catalog_uuid: app has TRUNCATE, REFERENCES or TRIGGER",
        "public.rls_catalog_definer: SECURITY DEFINER function",
      ]);
    } finally {
      await migrator.query("rollback");
    }
  });
});

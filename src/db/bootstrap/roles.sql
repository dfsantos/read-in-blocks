-- Creates the least-privilege database roles (ADR-0014, docs/architecture/database.md).
-- Run once per database as its owner, with psql, before the first migration:
--
--   psql "$OWNER_URL" -v ON_ERROR_STOP=1 \
--     -v app_password="..." -v migrator_password="..." \
--     -f src/db/bootstrap/roles.sql
--
-- Idempotent: existing roles keep their passwords (rotate with ALTER ROLE ... PASSWORD).
-- On Neon, create roles with this script, never in the console: console roles join neon_superuser.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE migrator LOGIN PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') \gexec

SELECT format('CREATE ROLE app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') \gexec

-- Pre-existing roles are not trusted (ADR-0011): strip any elevated attribute (this fails, and
-- stops the script, when the owner itself lacks the attribute) and refuse inherited privileges.
SELECT format('ALTER ROLE %I%s%s%s%s%s', rolname,
    CASE WHEN rolsuper THEN ' NOSUPERUSER' ELSE '' END,
    CASE WHEN rolcreatedb THEN ' NOCREATEDB' ELSE '' END,
    CASE WHEN rolcreaterole THEN ' NOCREATEROLE' ELSE '' END,
    CASE WHEN rolreplication THEN ' NOREPLICATION' ELSE '' END,
    CASE WHEN rolbypassrls THEN ' NOBYPASSRLS' ELSE '' END)
FROM pg_roles
WHERE rolname IN ('app', 'migrator')
  AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) \gexec

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('app', 'migrator')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'app or migrator still has an elevated attribute';
  END IF;
  -- Membership would grant privileges outside this script (e.g. neon_superuser, pg_read_all_data).
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
    WHERE r.rolname IN ('app', 'migrator')
  ) THEN
    RAISE EXCEPTION 'app or migrator is a member of another role; revoke it before running this script';
  END IF;
END
$$;

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO app, migrator', current_database()) \gexec
-- migrator creates the `drizzle` schema that stores the migration history.
SELECT format('GRANT CREATE ON DATABASE %I TO migrator', current_database()) \gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app;

-- DML grants for app on migrator's tables live in migration 0000_grant_app_privileges.

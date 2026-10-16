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

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO app, migrator', current_database()) \gexec
-- migrator creates the `drizzle` schema that stores the migration history.
SELECT format('GRANT CREATE ON DATABASE %I TO migrator', current_database()) \gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
GRANT USAGE ON SCHEMA public TO app;

-- DML grants for app on migrator's tables live in migration 0000_grant_app_privileges.

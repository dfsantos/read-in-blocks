-- Custom SQL migration file, put your code below! --
-- Runs as migrator: tables and sequences it creates get DML-only access for app (ADR-0014).
-- The roles themselves come from src/db/bootstrap/roles.sql.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app;

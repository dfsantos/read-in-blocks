-- Custom SQL migration file, put your code below! --
-- Runs as migrator. Postgres grants EXECUTE on every new function to PUBLIC by default; revoke it
-- so app only runs the functions a later migration grants it explicitly (ADR-0014, US-029).
-- Global on purpose: per-schema default privileges (IN SCHEMA) can only add to the global
-- defaults, so a per-schema REVOKE would have no effect.
ALTER DEFAULT PRIVILEGES FOR ROLE migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

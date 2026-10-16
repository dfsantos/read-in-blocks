import { loadEnv } from "vite";

type TestEnvName = "TEST_DATABASE_URL" | "TEST_MIGRATOR_DATABASE_URL";

// Environment first (CI), then .env.test.local (local runs). Global setup runs
// outside the test workers, so it cannot rely on the project's `env` option.
export function requireTestEnv(name: TestEnvName): string {
  const value =
    process.env[name] || loadEnv("test", process.cwd(), "TEST_")[name];
  if (!value) {
    throw new Error(
      `${name} is not set (see .env.example and docs/architecture/database.md)`,
    );
  }
  return value;
}

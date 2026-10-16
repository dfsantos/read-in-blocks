import { loadEnv } from "vite";

type TestEnvName = "TEST_DATABASE_URL" | "TEST_MIGRATOR_DATABASE_URL";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

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
  assertLocalDatabaseUrl(name, value);
  return value;
}

// Integration tests write and delete rows: never let them reach a remote database
// (e.g. a Neon branch), even by mistake. Errors never echo the URL (it holds a password).
export function assertLocalDatabaseUrl(name: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  // pg reads ?host= / ?hostaddr= before the URL host, so they could point elsewhere.
  const overridesHost =
    url.searchParams.has("host") || url.searchParams.has("hostaddr");
  if (!LOCAL_HOSTS.has(url.hostname) || overridesHost) {
    throw new Error(
      `${name} must point to a local database (localhost, 127.0.0.1 or ::1)`,
    );
  }
}

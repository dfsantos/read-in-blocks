import { existsSync } from "node:fs";

import { testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../src/db/schema";
import { createAuth } from "../../src/server/auth";
import { E2E_ACCOUNTS, E2E_ALLOWLIST } from "./identity";

// Seeds a signed-in session for E2E tests without Google (US-004). Uses the app's own auth
// configuration plus Better Auth's testUtils plugin, which only these helpers may load. It talks to
// the database the server under test uses, with the same secret, so the server accepts the cookie.

// Local runs read .env.local, like `next start`; in CI the variables come from the job.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export { E2E_ACCOUNTS };

let pool: Pool | undefined;

function testAuth() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set for the E2E tests");
  pool ??= new Pool({ connectionString: url, max: 2 });
  // The server under test allows the same e-mail (playwright.config.ts): requireUser() re-checks
  // the allowlist on every request.
  return createAuth(
    drizzle({ client: pool, schema }),
    { ...process.env, AUTH_ALLOWED_EMAILS: E2E_ALLOWLIST },
    [testUtils()],
  );
}

// Seeds one of E2E_ACCOUNTS; tests of the same file that seed must run serially.
export async function seedSession(email: string, name = "E2E Reader") {
  const test = (await testAuth().$context).test;
  const user = await test.saveUser(
    test.createUser({
      email,
      name,
      emailVerified: true,
    }),
  );
  const cookies = await test.getCookies({
    userId: user.id,
    domain: "localhost",
  });
  return {
    cookies,
    cleanUp: async () => {
      await test.deleteUser(user.id);
    },
  };
}

export async function closeTestAuth() {
  await pool?.end();
  pool = undefined;
}

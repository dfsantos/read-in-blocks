import { existsSync } from "node:fs";

import { testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../src/db/schema";
import { createAuth } from "../../src/server/auth";

// Seeds a signed-in session for E2E tests without Google (US-004). Uses the app's own auth
// configuration plus Better Auth's testUtils plugin, which only these helpers may load. It talks to
// the database the server under test uses, with the same secret, so the server accepts the cookie.

// Local runs read .env.local, like `next start`; in CI the variables come from the job.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const E2E_EMAIL = "e2e-reader@example.test";

let pool: Pool | undefined;

function testAuth() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set for the E2E tests");
  pool ??= new Pool({ connectionString: url, max: 2 });
  // The seeded e-mail is allowlisted here only: the server keeps its own allowlist.
  return createAuth(
    drizzle({ client: pool, schema }),
    { ...process.env, AUTH_ALLOWED_EMAILS: E2E_EMAIL },
    [testUtils()],
  );
}

export async function seedSession() {
  const test = (await testAuth().$context).test;
  const user = await test.saveUser(
    test.createUser({
      email: E2E_EMAIL,
      name: "E2E Reader",
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

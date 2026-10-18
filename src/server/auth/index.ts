import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";

import { getDb } from "../../db/client";
import * as authSchema from "../../db/auth-schema";
import { parseAuthEnv } from "./env";
import { createAuthOptions } from "./options";

function createAuth() {
  const db = getDb();
  return betterAuth(
    createAuthOptions({
      env: parseAuthEnv(process.env),
      database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
      findSignInCandidate: async (userId) => {
        const [row] = await db
          .select({
            email: authSchema.user.email,
            emailVerified: authSchema.user.emailVerified,
          })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, userId))
          .limit(1);
        return row;
      },
    }),
  );
}

let auth: ReturnType<typeof createAuth> | undefined;

// Built on first use, like the database client, so `next build` and tests that never touch auth
// need neither the database nor the auth variables. Invalid configuration fails here, closed.
export function getAuth() {
  auth ??= createAuth();
  return auth;
}

// Whether Google sign-in is configured in this environment (absent on Preview, ADR-0016).
export function isGoogleSignInEnabled(): boolean {
  return parseAuthEnv(process.env).google !== undefined;
}

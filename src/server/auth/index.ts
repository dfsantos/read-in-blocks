import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { eq } from "drizzle-orm";

import { getDb, type Database } from "../../db/client";
import * as authSchema from "../../db/auth-schema";
import { parseAuthEnv } from "./env";
import { createAuthOptions } from "./options";

// The app's auth instance for a database and an environment; tests build it the same way. The app
// passes no plugins; E2E helpers add Better Auth's test plugin (typed, so `$context.test` is available there).
export function createAuth<Plugins extends BetterAuthPlugin[] = []>(
  db: Database,
  source: Record<string, string | undefined>,
  plugins?: Plugins,
) {
  return betterAuth({
    ...createAuthOptions({
      env: parseAuthEnv(source),
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
    plugins: plugins ?? ([] as unknown as Plugins),
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

// Built on first use, like the database client, so `next build` and tests that never touch auth
// need neither the database nor the auth variables. Invalid configuration fails here, closed.
export function getAuth() {
  auth ??= createAuth(getDb(), process.env);
  return auth;
}

// Whether Google sign-in is configured in this environment (absent on Preview, ADR-0016).
export function isGoogleSignInEnabled(): boolean {
  return parseAuthEnv(process.env).google !== undefined;
}

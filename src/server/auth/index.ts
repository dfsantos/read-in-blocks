import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { getDb, type Database } from "../../db/client";
import * as authSchema from "../../db/auth-schema";
import { findSignInCandidate } from "../repositories/sign-in";
import { parseAuthEnv, type AuthEnv } from "./env";
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
      // Better Auth's own data layer: it reads and writes only its tables (user, session,
      // account, verification). Every other query lives in src/server/repositories.
      database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
      findSignInCandidate: (userId) => findSignInCandidate(db, userId),
    }),
    plugins: plugins ?? ([] as unknown as Plugins),
  });
}

function createAppAuth() {
  // nextCookies lets Server Actions (sign-out) set and clear the session cookie; it must stay last.
  return createAuth(getDb(), process.env, [nextCookies()]);
}

let auth: ReturnType<typeof createAppAuth> | undefined;

// Built on first use, like the database client, so `next build` and tests that never touch auth
// need neither the database nor the auth variables. Invalid configuration fails here, closed.
export function getAuth() {
  auth ??= createAppAuth();
  return auth;
}

let authEnv: AuthEnv | undefined;

// The validated auth environment, parsed once per server instance (requireUser reads the
// allowlist on every request).
export function getAuthEnv(): AuthEnv {
  authEnv ??= parseAuthEnv(process.env);
  return authEnv;
}

// Whether Google sign-in is configured in this environment (absent on Preview, ADR-0016).
export function isGoogleSignInEnabled(): boolean {
  return parseAuthEnv(process.env).google !== undefined;
}

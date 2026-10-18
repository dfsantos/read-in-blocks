import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/node-postgres";

import { parseAuthEnv } from "./env";
import { createAuthOptions } from "./options";

// Entry point for the Better Auth CLI only (`auth generate --config src/server/auth/cli.ts`), to
// regenerate src/db/auth-schema.ts from the same options the app uses. Never imported by the app,
// and it opens no connection: the CLI only reads the configuration.
export const auth = betterAuth(
  createAuthOptions({
    env: parseAuthEnv({}),
    database: drizzleAdapter(drizzle.mock(), { provider: "pg" }),
    findSignInCandidate: async () => undefined,
  }),
);

import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";

import { decideSignIn, type SignInCandidate } from "./allowlist";
import type { AuthEnv } from "./env";
import { logAuthEvent } from "./log";

// The single place where sign-in is configured (ADR-0005). Adding a provider later is one more
// entry in `socialProviders` (plus its env variables); nothing else changes.

const HOUR = 60 * 60;

// Code the OAuth callback puts in `?error=` on the login page when an account is refused.
// The same code covers every reason, so the page cannot tell an outsider why.
export const ACCOUNT_NOT_ALLOWED = "account_not_allowed";

export type AuthOptionsInput = {
  env: AuthEnv;
  database: BetterAuthOptions["database"];
  // Loads the e-mail and its verification for an existing user (the session hook re-checks the
  // allowlist on every sign-in, so removing an e-mail revokes access at the next login).
  findSignInCandidate: (userId: string) => Promise<SignInCandidate | undefined>;
  plugins?: BetterAuthOptions["plugins"];
};

function denied(reason: string, userId?: string): never {
  logAuthEvent({ event: "auth.login_denied", reason, userId });
  throw APIError.from("FORBIDDEN", {
    code: ACCOUNT_NOT_ALLOWED,
    message: "Sign-in is not allowed for this account",
  });
}

export function createAuthOptions({
  env,
  database,
  findSignInCandidate,
  plugins,
}: AuthOptionsInput) {
  return {
    appName: "Read in Blocks",
    baseURL: env.baseURL,
    secret: env.secret,
    database,
    plugins,
    // Google only (ADR-0005); no e-mail/password sign-in or sign-up.
    emailAndPassword: { enabled: false },
    socialProviders: env.google
      ? {
          google: {
            clientId: env.google.clientId,
            clientSecret: env.google.clientSecret,
          },
        }
      : {},
    // Short sessions, extended at most once an hour while in use, and always checked against the
    // database: no cookie cache, so a revoked session stops working on the next request.
    session: {
      expiresIn: 12 * HOUR,
      updateAge: HOUR,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    databaseHooks: {
      user: {
        create: {
          // First sign-in: refuse before any row is written.
          before: async (user) => {
            const decision = decideSignIn(
              { email: user.email, emailVerified: user.emailVerified === true },
              env.allowlist,
            );
            if (!decision.allowed) denied(decision.reason);
            return { data: user };
          },
        },
      },
      session: {
        create: {
          // Every sign-in, new or returning user: the allowlist and verification are checked again.
          before: async (session) => {
            const candidate = await findSignInCandidate(session.userId);
            if (!candidate) denied("user_not_found", session.userId);
            const decision = decideSignIn(candidate, env.allowlist);
            if (!decision.allowed) denied(decision.reason, session.userId);
            return { data: session };
          },
          after: async (session) => {
            logAuthEvent({ event: "auth.login", userId: session.userId });
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

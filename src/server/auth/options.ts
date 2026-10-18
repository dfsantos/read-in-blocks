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
  // Loads the e-mail and its verification for an existing user: the session hook re-checks the
  // allowlist on every sign-in, so a removed e-mail cannot start a new session.
  findSignInCandidate: (userId: string) => Promise<SignInCandidate | undefined>;
};

function denied(reason: string, userId?: string): never {
  logAuthEvent({ event: "auth.login_denied", reason, userId });
  // The message is the code too: when user creation is refused, the OAuth callback redirects with
  // the message (spaces as `_`) instead of the code, so both paths yield the same `?error=`.
  throw APIError.from("FORBIDDEN", {
    code: ACCOUNT_NOT_ALLOWED,
    message: ACCOUNT_NOT_ALLOWED,
  });
}

function withoutTokens<T extends object>(account: T): T {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  };
}

export function createAuthOptions({
  env,
  database,
  findSignInCandidate,
}: AuthOptionsInput) {
  return {
    appName: "Read in Blocks",
    baseURL: env.baseURL,
    secret: env.secret,
    database,
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
    // Fixed 12-hour sessions, never extended: the allowlist is only checked when a session is
    // created, so every session ends at most 12 hours after its sign-in and the next sign-in checks
    // the allowlist again (an e-mail removed from it, or a stolen cookie, lasts 12 hours at most).
    // No cookie cache: every request reads the session from the database, so deleting the row
    // revokes it at once.
    session: {
      expiresIn: 12 * HOUR,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    // Google's access/refresh/id tokens are stored encrypted with the auth secret, not in clear.
    account: { encryptOAuthTokens: true },
    // Secure (`__Secure-` prefix) whenever the base URL is https, Better Auth's default: always in
    // production and Preview, never on http://localhost.
    advanced: {
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    databaseHooks: {
      // Google is used only to sign in; the app never calls Google APIs. Its tokens are dropped
      // before they reach the database (the id_token would keep the e-mail and name in clear).
      account: {
        create: {
          before: async (account) => ({ data: withoutTokens(account) }),
        },
        update: {
          before: async (account) => ({ data: withoutTokens(account) }),
        },
      },
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

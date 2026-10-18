import { drizzle } from "drizzle-orm/node-postgres";
import { eq, like } from "drizzle-orm";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as schema from "@/db/schema";
import { createAuth } from "@/server/auth";

import { requireTestEnv } from "./db-env";

// Drives the real Better Auth OAuth flow (sign-in start, Google callback, user and session rows)
// against the local test database. Only Google's token endpoint is replaced: it returns an
// id_token for the profile under test, which is how Better Auth reads the Google profile.

const ORIGIN = "http://localhost:3000";
const DOMAIN = "@auth-test.example";
const ALLOWED = `reader${DOMAIN}`;

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

const baseEnv = {
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
  BETTER_AUTH_URL: ORIGIN,
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  AUTH_ALLOWED_EMAILS: ALLOWED,
};

type Profile = { sub: string; email: string; email_verified: boolean };

const tokenRequests: URLSearchParams[] = [];
let profile: Profile;

function unsignedJwt(payload: object): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part(payload)}.`;
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function signIn(
  auth: { handler: (request: Request) => Promise<Response> },
  as: Profile,
  state?: string,
) {
  profile = as;
  const start = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/pt-BR",
        errorCallbackURL: "/pt-BR/login",
      }),
    }),
  );
  expect(start.status).toBe(200);
  const authorizationURL = new URL(
    ((await start.json()) as { url: string }).url,
  );
  const callback = await auth.handler(
    new Request(
      `${ORIGIN}/api/auth/callback/google?code=test-code&state=${state ?? authorizationURL.searchParams.get("state")}`,
      { headers: { cookie: cookieHeader(start) } },
    ),
  );
  return {
    authorizationURL,
    callback,
    location: callback.headers.get("location") ?? "",
  };
}

async function usersWith(email: string) {
  return db.select().from(schema.user).where(eq(schema.user.email, email));
}

async function sessionsOf(userId: string) {
  return db
    .select()
    .from(schema.session)
    .where(eq(schema.session.userId, userId));
}

async function cleanUp() {
  await db.delete(schema.user).where(like(schema.user.email, `%${DOMAIN}`));
}

describe("Google sign-in with the e-mail allowlist", () => {
  const realFetch = globalThis.fetch;

  beforeAll(cleanUp);
  afterAll(async () => {
    await cleanUp();
    await pool.end();
  });

  beforeEach(() => {
    tokenRequests.length = 0;
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith("https://oauth2.googleapis.com/token"))
        return realFetch(input, init);
      tokenRequests.push(new URLSearchParams(String(init?.body ?? "")));
      return Response.json({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: unsignedJwt({
          ...profile,
          name: "Test Reader",
          iat: 0,
          exp: 4102444800,
        }),
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses state and PKCE (S256) and sends the code verifier to Google", async () => {
    const { authorizationURL } = await signIn(createAuth(db, baseEnv), {
      sub: "google-reader",
      email: ALLOWED,
      email_verified: true,
    });

    expect(authorizationURL.origin).toBe("https://accounts.google.com");
    expect(authorizationURL.searchParams.get("state")).toBeTruthy();
    expect(authorizationURL.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorizationURL.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(tokenRequests.at(-1)?.get("code_verifier")).toBeTruthy();
  });

  it("creates the user on the first sign-in and reuses it on the next one", async () => {
    await cleanUp();
    const auth = createAuth(db, baseEnv);
    const reader = {
      sub: "google-reader",
      email: ALLOWED,
      email_verified: true,
    };

    const first = await signIn(auth, reader);
    expect(first.callback.status).toBe(302);
    expect(first.location).toBe("/pt-BR");
    const sessionCookie = first.callback.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("session_token="));
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);

    await signIn(auth, reader);

    const users = await usersWith(ALLOWED);
    expect(users).toHaveLength(1);
    expect(await sessionsOf(users[0]!.id)).toHaveLength(2);

    // Google's tokens are never stored (sign-in only), on the first or the next sign-in.
    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, users[0]!.id));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      providerId: "google",
      accountId: "google-reader",
      accessToken: null,
      refreshToken: null,
      idToken: null,
    });
  });

  it("refuses an e-mail outside the allowlist without creating any row", async () => {
    const outsider = `outsider${DOMAIN}`;

    const { location } = await signIn(createAuth(db, baseEnv), {
      sub: "google-outsider",
      email: outsider,
      email_verified: true,
    });

    expect(new URL(location, ORIGIN).pathname).toBe("/pt-BR/login");
    expect(new URL(location, ORIGIN).searchParams.get("error")).toBe(
      "account_not_allowed",
    );
    expect(await usersWith(outsider)).toHaveLength(0);

    // The refusal is logged as an event, with a reason and no e-mail.
    const logged = vi
      .mocked(console.info)
      .mock.calls.map((call) => String(call[0]));
    expect(logged.some((line) => line.includes('"auth.login_denied"'))).toBe(
      true,
    );
    expect(logged.join("\n")).not.toContain(DOMAIN);
  });

  it("refuses an allowlisted e-mail that Google has not verified", async () => {
    await cleanUp();

    const { location } = await signIn(createAuth(db, baseEnv), {
      sub: "google-unverified",
      email: ALLOWED,
      email_verified: false,
    });

    expect(new URL(location, ORIGIN).searchParams.get("error")).toBe(
      "account_not_allowed",
    );
    expect(await usersWith(ALLOWED)).toHaveLength(0);
  });

  it("never extends a session, so it ends 12 hours after the sign-in", async () => {
    await cleanUp();
    const auth = createAuth(db, baseEnv);
    const { callback } = await signIn(auth, {
      sub: "google-reader",
      email: ALLOWED,
      email_verified: true,
    });
    const cookie = cookieHeader(callback);
    const [user] = await usersWith(ALLOWED);
    const getSession = () =>
      auth.handler(
        new Request(`${ORIGIN}/api/auth/get-session`, {
          headers: { cookie, origin: ORIGIN },
        }),
      );

    // Two hours into the session: a refreshing setup would push the expiry 12 hours forward.
    const twoHoursIn = new Date(Date.now() + 10 * 60 * 60 * 1000);
    await db
      .update(schema.session)
      .set({ expiresAt: twoHoursIn })
      .where(eq(schema.session.userId, user!.id));
    expect(await (await getSession()).json()).toMatchObject({
      user: { email: ALLOWED },
    });
    const [kept] = await sessionsOf(user!.id);
    expect(kept!.expiresAt.getTime()).toBe(twoHoursIn.getTime());

    // Past its expiry the same cookie no longer works.
    await db
      .update(schema.session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.session.userId, user!.id));
    expect(await (await getSession()).json()).toBeNull();
  });

  it("refuses a returning user whose e-mail was removed from the allowlist", async () => {
    await cleanUp();
    const reader = {
      sub: "google-reader",
      email: ALLOWED,
      email_verified: true,
    };
    await signIn(createAuth(db, baseEnv), reader);
    const [user] = await usersWith(ALLOWED);

    const { location } = await signIn(
      createAuth(db, {
        ...baseEnv,
        AUTH_ALLOWED_EMAILS: `someone-else${DOMAIN}`,
      }),
      reader,
    );

    expect(new URL(location, ORIGIN).searchParams.get("error")).toBe(
      "account_not_allowed",
    );
    expect(await sessionsOf(user!.id)).toHaveLength(1);
  });

  it("refuses everyone when the allowlist is empty", async () => {
    await cleanUp();

    const { location } = await signIn(
      createAuth(db, { ...baseEnv, AUTH_ALLOWED_EMAILS: "" }),
      {
        sub: "google-reader",
        email: ALLOWED,
        email_verified: true,
      },
    );

    expect(new URL(location, ORIGIN).searchParams.get("error")).toBe(
      "account_not_allowed",
    );
    expect(await usersWith(ALLOWED)).toHaveLength(0);
  });

  it("uses Secure, __Secure- prefixed cookies when the base URL is https", async () => {
    const auth = createAuth(db, {
      ...baseEnv,
      BETTER_AUTH_URL: "https://read-in-blocks.example",
    });

    const start = await auth.handler(
      new Request("https://read-in-blocks.example/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://read-in-blocks.example",
        },
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      }),
    );

    const cookies = start.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__Secure-/);
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/;\s*HttpOnly/i);
    }
  });

  it("rejects a callback whose state does not match the sign-in", async () => {
    await cleanUp();

    const { location } = await signIn(
      createAuth(db, baseEnv),
      { sub: "google-reader", email: ALLOWED, email_verified: true },
      "forged-state",
    );

    expect(new URL(location, ORIGIN).searchParams.get("error")).toBeTruthy();
    expect(tokenRequests).toHaveLength(0);
    expect(await usersWith(ALLOWED)).toHaveLength(0);
  });
});

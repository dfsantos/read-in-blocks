import { randomBytes } from "node:crypto";

import { testUtils } from "better-auth/plugins";
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
import { parseAuthEnv } from "@/server/auth/env";

import { requireTestEnv } from "./db-env";

// Calls the sign-out Server Action directly, as an attacker posting to it would: no proxy, no page,
// only the request headers (US-005, Zero Trust criterion). requireUser() must refuse it on its own.

const DOMAIN = "@sign-out-test.example";
const READER = `reader${DOMAIN}`;

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

const env = {
  NODE_ENV: "test",
  // Generated per run: no secret-like literal in the repository (secret scanning).
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  BETTER_AUTH_URL: "http://localhost:3000",
  AUTH_ALLOWED_EMAILS: READER,
};
const auth = createAuth(db, env, [testUtils()]);
// Seeds sessions for e-mails the app no longer allows (allowed when the session was created).
const REMOVED = `removed${DOMAIN}`;
const seedingAuth = createAuth(
  db,
  { ...env, AUTH_ALLOWED_EMAILS: `${READER},${REMOVED}` },
  [testUtils()],
);

const mocks = vi.hoisted(() => ({
  headers: vi.fn<() => Promise<Headers>>(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth")>()),
  getAuth: () => auth,
  getAuthEnv: () => parseAuthEnv(env),
}));

import { signOut } from "@/server/actions/auth";

async function seedReader(email = READER) {
  const test = (await seedingAuth.$context).test;
  const user = await test.saveUser(
    test.createUser({ email, name: "Test Reader", emailVerified: true }),
  );
  const cookies = await test.getCookies({
    userId: user.id,
    domain: "localhost",
  });
  const cookie = cookies
    .map(
      ({ name, value }: { name: string; value: string }) => `${name}=${value}`,
    )
    .join("; ");
  return { user, cookie };
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

describe("sign-out Server Action", () => {
  beforeAll(cleanUp);
  afterAll(async () => {
    await cleanUp();
    await pool.end();
  });

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(auth.api, "signOut");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    mocks.redirect.mockClear();
    await cleanUp();
  });

  it("is refused without a session cookie and touches no session", async () => {
    const { user } = await seedReader();
    mocks.headers.mockResolvedValue(new Headers());

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(auth.api.signOut).not.toHaveBeenCalled();
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });

  it("is refused with a forged session cookie", async () => {
    const { user } = await seedReader();
    mocks.headers.mockResolvedValue(
      new Headers({ cookie: "better-auth.session_token=forged.value" }),
    );

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(auth.api.signOut).not.toHaveBeenCalled();
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });

  it("revokes the caller's session and sends them to the login page", async () => {
    const { user, cookie } = await seedReader();
    mocks.headers.mockResolvedValue(new Headers({ cookie }));

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(auth.api.signOut).toHaveBeenCalledOnce();
    expect(await sessionsOf(user.id)).toHaveLength(0);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('"event":"auth.logout"'),
    );
  });

  it("revokes, without signing out normally, a reader removed from the allowlist", async () => {
    const { user, cookie } = await seedReader(REMOVED);
    mocks.headers.mockResolvedValue(new Headers({ cookie }));

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(await sessionsOf(user.id)).toHaveLength(0);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('"event":"auth.session_revoked"'),
    );
    expect(console.info).not.toHaveBeenCalledWith(
      expect.stringContaining('"event":"auth.logout"'),
    );
  });
});

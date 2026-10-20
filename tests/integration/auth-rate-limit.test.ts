import { randomBytes, randomInt } from "node:crypto";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import * as authSchema from "@/db/auth-schema";
import * as schema from "@/db/schema";
import { parseAuthEnv } from "@/server/auth/env";
import { createAuthOptions } from "@/server/auth/options";

import { requireTestEnv } from "./db-env";

// US-028: Better Auth's rate limit keeps its counters in the database, so serverless instances
// share them. Two auth instances stand in for two instances of the function. The limit is on in
// production only; here it is switched on explicitly with the app's own rules.

const ORIGIN = "http://localhost:3000";

const pool = new Pool({
  connectionString: requireTestEnv("TEST_DATABASE_URL"),
  max: 2,
});
const db = drizzle({ client: pool, schema });

const options = createAuthOptions({
  env: parseAuthEnv({
    NODE_ENV: "test",
    // Generated per run: no secret-like literal in the repository (secret scanning).
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: ORIGIN,
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: randomBytes(16).toString("hex"),
    AUTH_ALLOWED_EMAILS: "reader@rate-limit.example",
  }),
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  findSignInCandidate: async () => undefined,
});

function instance() {
  return betterAuth({
    ...options,
    rateLimit: { ...options.rateLimit, enabled: true },
  });
}

// Addresses from TEST-NET-3 (203.0.113.0/24), a new one per test so tests never share counters.
// IPv4 on purpose: Better Auth counts IPv6 per /64 subnet.
const TEST_NET = "203.0.113.";
let ip = "";

function startSignIn(auth: ReturnType<typeof instance>, from = ip) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": from,
      },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    }),
  );
}

const usedHosts = new Set<number>();

function newIp() {
  let host: number;
  do host = randomInt(1, 255);
  while (usedHosts.has(host));
  usedHosts.add(host);
  return `${TEST_NET}${host}`;
}

async function clearCounters() {
  await db
    .delete(authSchema.rateLimit)
    .where(like(authSchema.rateLimit.key, `${TEST_NET}%`));
}

beforeAll(clearCounters);
afterEach(clearCounters);

afterAll(async () => {
  await pool.end();
});

describe("Better Auth rate limit", () => {
  it("allows 10 sign-in starts a minute per address, shared across instances", async () => {
    ip = newIp();
    const [first, second] = [instance(), instance()];

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await startSignIn(attempt % 2 ? first : second);
      expect(response.status).toBe(200);
    }
    const refused = await startSignIn(first);

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("x-retry-after"))).toBeGreaterThan(0);
    // The counter lives in the database, not in either instance.
    const rows = await db
      .select()
      .from(authSchema.rateLimit)
      .where(like(authSchema.rateLimit.key, `${ip}|%`));
    expect(rows).toHaveLength(1);
  });

  it("counts each address on its own", async () => {
    ip = newIp();
    const auth = instance();
    for (let attempt = 0; attempt < 11; attempt += 1) await startSignIn(auth);

    expect((await startSignIn(auth)).status).toBe(429);
    expect((await startSignIn(auth, newIp())).status).toBe(200);
  });
});

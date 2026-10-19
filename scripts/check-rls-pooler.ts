import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { Pool, type PoolClient } from "pg";

// RLS owner check against Neon's pooler (US-033, ADR-0008 item 6). The integration tests only run
// on a local database; this script proves on the Preview branch, through PgBouncer in transaction
// mode, that the owner withOwner sets in one transaction never reaches the next one, and measures
// what withOwner costs per operation. It creates nothing and reads no table.
//
//   printf 'Pooled URL: ' && read -rs RLS_CHECK_DATABASE_URL && echo && export RLS_CHECK_DATABASE_URL
//   node scripts/check-rls-pooler.ts
//
// RLS_CHECK_DATABASE_URL: a pooled (-pooler) connection string of the Preview branch, or a local
// one (localhost) for the local cost baseline. Nothing about the URL is ever printed.
// Guide: docs/architecture/database.md ("RLS no pooler do Neon").

const ROUNDS = 200;
const PARALLEL = 5;
const SAMPLES = 100;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function connectionString(): { url: string; target: "pooler" | "local" } {
  const url = process.env.RLS_CHECK_DATABASE_URL;
  if (!url) throw new Error("RLS_CHECK_DATABASE_URL is not set");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("RLS_CHECK_DATABASE_URL is not a valid URL");
  }
  // pg reads ?host= / ?hostaddr= before the URL host, so they could point elsewhere.
  if (parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr")) {
    throw new Error("RLS_CHECK_DATABASE_URL must not override the host");
  }
  if (LOCAL_HOSTS.has(parsed.hostname)) return { url, target: "local" };
  if (!parsed.hostname.split(".")[0].endsWith("-pooler")) {
    throw new Error(
      "RLS_CHECK_DATABASE_URL must be the pooled (-pooler) host: the check is about the pooler",
    );
  }
  return { url, target: "pooler" };
}

async function currentOwner(client: PoolClient): Promise<string | null> {
  const result = await client.query<{ owner: string | null }>(
    "select current_setting('app.user_id', true) as owner",
  );
  return result.rows[0].owner;
}

// What withOwner does: the owner lives only inside this transaction.
async function inOwnerTransaction(
  client: PoolClient,
  owner: string,
  fail: boolean,
): Promise<string | null> {
  await client.query("begin");
  try {
    await client.query("select set_config('app.user_id', $1, true)", [owner]);
    const seen = await currentOwner(client);
    if (fail) throw new Error("simulated request failure");
    await client.query("commit");
    return seen;
  } catch (error) {
    await client.query("rollback");
    if (fail) return owner;
    throw error;
  }
}

// Each worker keeps its own client connection; behind the pooler every transaction may land on a
// different server connection, which is exactly where a leaked setting would show up.
async function leakCheck(
  pool: Pool,
): Promise<{ checks: number; leaks: number; misses: number }> {
  let checks = 0;
  let leaks = 0;
  let misses = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      const client = await pool.connect();
      try {
        for (let round = 0; round < ROUNDS; round += 1) {
          const owner = randomUUID();
          const seen = await inOwnerTransaction(
            client,
            owner,
            round % 10 === 9,
          );
          if (seen !== owner) misses += 1;
          const after = await currentOwner(client);
          checks += 1;
          if (after !== null && after !== "") leaks += 1;
        }
      } finally {
        client.release();
      }
    }),
  );
  return { checks, leaks, misses };
}

function stats(samples: number[]): { median: number; p95: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    median: Number(at(0.5).toFixed(2)),
    p95: Number(at(0.95).toFixed(2)),
  };
}

// Same query alone and wrapped as withOwner wraps it (begin, set_config, query, commit).
async function cost(pool: Pool) {
  const client = await pool.connect();
  try {
    const plain: number[] = [];
    const owned: number[] = [];
    for (let i = 0; i < SAMPLES + 10; i += 1) {
      let start = performance.now();
      await client.query("select 1");
      const plainMs = performance.now() - start;

      start = performance.now();
      await client.query("begin");
      await client.query("select set_config('app.user_id', $1, true)", [
        randomUUID(),
      ]);
      await client.query("select 1");
      await client.query("commit");
      const ownedMs = performance.now() - start;

      // The first rounds warm up the connection.
      if (i >= 10) {
        plain.push(plainMs);
        owned.push(ownedMs);
      }
    }
    const plainStats = stats(plain);
    const ownedStats = stats(owned);
    return {
      plainMs: plainStats,
      withOwnerMs: ownedStats,
      extraMedianMs: Number((ownedStats.median - plainStats.median).toFixed(2)),
    };
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const { url, target } = connectionString();
  // Fail instead of hanging when the host is unreachable or a query stalls (Neon may be waking up
  // a suspended compute, hence the generous connect timeout).
  const pool = new Pool({
    connectionString: url,
    max: PARALLEL,
    connectionTimeoutMillis: 20_000,
    query_timeout: 15_000,
  });
  // Log only the error code: messages may carry connection details.
  pool.on("error", (error: Error & { code?: string }) => {
    console.error("pool error", { code: error.code });
  });
  try {
    console.log(`connecting (${target})…`);
    const probe = await pool.connect();
    probe.release();
    console.log(
      `leak check: ${ROUNDS * PARALLEL} transactions on ${PARALLEL} connections…`,
    );
    const leak = await leakCheck(pool);
    console.log(`latency: ${SAMPLES} samples…`);
    const latency = await cost(pool);
    console.log(
      JSON.stringify(
        {
          target,
          date: new Date().toISOString(),
          ...leak,
          samples: SAMPLES,
          ...latency,
        },
        null,
        2,
      ),
    );
    if (leak.leaks > 0 || leak.misses > 0) {
      console.error("FAIL: the owner crossed a transaction boundary");
      process.exitCode = 1;
    } else {
      console.log("OK: the owner never outlived its transaction");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: Error & { code?: string }) => {
  console.error("check failed", { code: error.code ?? error.message });
  process.exitCode = 1;
});

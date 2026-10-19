import { sql } from "drizzle-orm";

import { getDb, type Database } from "@/db/client";

// Second barrier of the data isolation (US-033, ADR-0008 item 6): content tables have a Postgres
// RLS policy that only shows the rows of the owner set here. Every repository of a content table
// runs its queries through withOwner AND still filters with ownedBy; the two barriers hold together.
//
// The owner is set for this transaction only (set_config's third argument). Neon's pooler runs in
// transaction mode, so a session-level setting would survive on the pooled connection and hand the
// next request someone else's rows. Nothing else in the code may set app.user_id (architecture test
// in owner-guc.test.ts), and only repositories may import this module.

export type OwnerTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export async function withOwner<T>(
  userId: string,
  run: (tx: OwnerTransaction) => Promise<T>,
  db: Database = getDb(),
): Promise<T> {
  // An empty id would only make RLS show nothing, but it means the caller skipped requireUser().
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("repository called without a userId");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return run(tx);
  });
}

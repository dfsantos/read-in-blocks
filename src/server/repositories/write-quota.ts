import { sql } from "drizzle-orm";

import { getDb, type Database } from "@/db/client";
import { writeQuota } from "@/db/schema";

import { ownedBy } from "./owner-scope";
import { withOwner } from "./with-owner";

// Per-reader rate limit of write Server Actions (US-007, docs/security/headers.md). Fixed window
// counted in the database, so every serverless instance shares it; the clock is the database's,
// never the instance's. One atomic upsert per call: concurrent calls cannot both slip through.

export type WriteQuota = {
  // Stable name of the action, e.g. "books.create" (at most 64 characters).
  action: string;
  limit: number;
  windowSeconds: number;
};

// Counts one write and tells whether it is within the reader's quota. Calls over the limit still
// count, so a client hammering the action stays blocked until the window ends.
export async function consumeWriteQuota(
  userId: string,
  quota: WriteQuota,
  db: Database = getDb(),
): Promise<boolean> {
  const window = sql`make_interval(secs => ${quota.windowSeconds})`;
  const expired = sql`${writeQuota.windowStart} <= now() - ${window}`;
  return withOwner(
    userId,
    async (tx) => {
      const [row] = await tx
        .insert(writeQuota)
        .values({
          ownerId: userId,
          action: quota.action,
          windowStart: sql`now()`,
          count: 1,
        })
        .onConflictDoUpdate({
          target: [writeQuota.ownerId, writeQuota.action],
          set: {
            windowStart: sql`case when ${expired} then now() else ${writeQuota.windowStart} end`,
            count: sql`case when ${expired} then 1 else ${writeQuota.count} + 1 end`,
          },
          // Never reached for another owner (the key includes owner_id); kept as the second barrier.
          setWhere: ownedBy(writeQuota.ownerId, userId),
        })
        .returning({ count: writeQuota.count });
      return row !== undefined && row.count <= quota.limit;
    },
    db,
  );
}

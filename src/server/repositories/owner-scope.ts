import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// The owner filter every repository query starts from (ADR-0008, docs/architecture/data-access.md).
// The userId always comes from requireUser(), never from the client. An empty id would match
// nothing, but it means the caller skipped the session check: fail loudly instead.
export function ownedBy(
  ownerColumn: PgColumn,
  userId: string,
  ...conditions: (SQL | undefined)[]
): SQL | undefined {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("repository called without a userId");
  }
  return and(eq(ownerColumn, userId), ...conditions);
}

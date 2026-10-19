import { sql } from "drizzle-orm";
import { pgPolicy, pgRole } from "drizzle-orm/pg-core";

// Row Level Security for content tables (US-033, ADR-0008 item 6, docs/architecture/database.md).
// A content table declares the owner policy in its pgTable config, and drizzle-kit generates the
// ENABLE ROW LEVEL SECURITY and CREATE POLICY statements in its migration:
//
//   export const book = pgTable("book", { ..., ownerId: text("owner_id").notNull() },
//     () => [ownerPolicy()]);
//
// The owner is set per transaction by withOwner (src/server/repositories/with-owner.ts). With no
// owner set, current_setting(..., true) is NULL or '' and matches no owner_id: no rows (fails
// closed). This only holds while owner_id is text, like Better Auth's user.id; a uuid column would
// need nullif(current_setting('app.user_id', true), '')::uuid.

// Created by src/db/bootstrap/roles.sql; drizzle-kit must not create or drop it.
export const appRole = pgRole("app").existing();

const isOwner = sql.raw(`owner_id = current_setting('app.user_id', true)`);

export function ownerPolicy() {
  return pgPolicy("owner_only", {
    as: "permissive",
    to: appRole,
    for: "all",
    using: isOwner,
    withCheck: isOwner,
  });
}

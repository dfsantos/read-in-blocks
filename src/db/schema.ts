import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Technical key/value table used to prove migrations and app-role privileges.
// Holds no user content, so it has no owner_id (ADR-0008 applies to content tables).
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

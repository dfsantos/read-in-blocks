import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { ownerPolicy } from "./rls";

// Technical key/value table used to prove migrations and app-role privileges.
// Holds no user content, so it has no owner_id (ADR-0008 applies to content tables).
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A reader's book (US-007, RF-001, D-08): title required, author optional. Content table: owner_id,
// owner RLS policy and access only through withOwner (docs/architecture/database.md).
export const book = pgTable(
  "book",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    author: text("author"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Indexes owner_id (leading column) and is the target of the composite foreign keys of the
    // tables that point at a book (owner_id, book_id), from US-010 on: an FK ignores RLS.
    unique("book_owner_id_id_unique").on(table.ownerId, table.id),
    // Last line of the limits the Server Action already checks with Zod (src/domain/books).
    check(
      "book_title_length",
      sql`char_length(${table.title}) between 1 and 200`,
    ),
    check(
      "book_author_length",
      sql`${table.author} is null or char_length(${table.author}) between 1 and 200`,
    ),
    ownerPolicy(),
  ],
);

// A node of a book's structure (US-010, ADR-0009): part, chapter or topic, as an adjacency list.
// Content table with its own owner_id and the owner RLS policy. Both foreign keys are composite
// with the owner, because a foreign key ignores RLS (docs/architecture/database.md): a node can only
// hang from its owner's book, and its parent can only be a node of the same owner and book.
// Deleting the book or the parent deletes the subtree (D-09).
export const bookNode = pgTable(
  "book_node",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bookId: uuid("book_id").notNull(),
    // null: the node sits at the book's root.
    parentId: uuid("parent_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    // Order among siblings, from 0; reordering arrives in US-012.
    position: integer("position").notNull(),
    // Plain text summary and goal in pages (US-011, D-02); both optional. A node without a goal
    // takes the default weight (src/domain/progress/weight.ts).
    summary: text("summary"),
    goalPages: integer("goal_pages"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Indexes owner_id and book_id (leading columns) and is the target of the parent key.
    unique("book_node_owner_id_book_id_id_unique").on(
      table.ownerId,
      table.bookId,
      table.id,
    ),
    // One node per place among its siblings; the book's root counts as one group (NULLS NOT
    // DISTINCT). Also indexes the children of a node, which the parent's cascade looks up.
    unique("book_node_sibling_position_unique")
      .on(table.bookId, table.parentId, table.position)
      .nullsNotDistinct(),
    foreignKey({
      name: "book_node_book_fk",
      columns: [table.ownerId, table.bookId],
      foreignColumns: [book.ownerId, book.id],
    }).onDelete("cascade"),
    // MATCH SIMPLE: a root node (parent_id null) is not checked against any parent.
    foreignKey({
      name: "book_node_parent_fk",
      columns: [table.ownerId, table.bookId, table.parentId],
      foreignColumns: [table.ownerId, table.bookId, table.id],
    }).onDelete("cascade"),
    // Last line of the rules the repository already checks (src/domain/structure): a part is
    // always at the root and a topic never is. What may sit under which parent needs the parent's
    // kind, so it stays in the repository.
    check("book_node_kind", sql`${table.kind} in ('part', 'chapter', 'topic')`),
    check(
      "book_node_root_kind",
      sql`(${table.kind} = 'part' and ${table.parentId} is null) or ${table.kind} = 'chapter' or (${table.kind} = 'topic' and ${table.parentId} is not null)`,
    ),
    check(
      "book_node_title_length",
      sql`char_length(${table.title}) between 1 and 200`,
    ),
    check("book_node_position", sql`${table.position} >= 0`),
    check(
      "book_node_summary_length",
      sql`${table.summary} is null or char_length(${table.summary}) between 1 and 1000`,
    ),
    check(
      "book_node_goal_pages",
      sql`${table.goalPages} is null or ${table.goalPages} between 1 and 10000`,
    ),
    ownerPolicy(),
  ],
);

// Per-reader counters of write Server Actions (US-007, docs/security/headers.md): one row per
// reader and action, fixed window. Holds the reader's id, so it is owner-scoped like content.
export const writeQuota = pgTable(
  "write_quota",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.action] }),
    check("write_quota_action_length", sql`char_length(${table.action}) <= 64`),
    ownerPolicy(),
  ],
);

// Better Auth tables (US-004), generated by its CLI: regenerate with
// `pnpm dlx auth@<version> generate --config src/server/auth/cli.ts --output src/db/auth-schema.ts`.
export * from "./auth-schema";

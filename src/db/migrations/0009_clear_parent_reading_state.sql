-- US-014: a node with children derives its reading state from them and never stores one. Rows
-- that kept a state from before they gained children (US-013) go back to "not started", as the
-- repositories now do when a node gains its first child. Data only: no schema change.
UPDATE "book_node" AS "parent"
SET "status" = 'not_started', "started_at" = NULL, "completed_at" = NULL, "updated_at" = now()
WHERE "parent"."status" <> 'not_started'
  AND EXISTS (
    SELECT 1 FROM "book_node" AS "child"
    WHERE "child"."owner_id" = "parent"."owner_id" AND "child"."parent_id" = "parent"."id"
  );

-- US-019: notes written as plain text (US-018) get their rich content, one paragraph per line and
-- an empty paragraph for an empty line: the same document textToDoc (src/domain/notes/rich-text.ts)
-- builds. `body` keeps the plain text and `updated_at` is left alone (the reader edited nothing).
-- Data only, idempotent: rows that already have content are skipped.
UPDATE "note"
SET "content" = jsonb_build_object(
  'type', 'doc',
  'content', (
    SELECT jsonb_agg(
      CASE
        WHEN "line" = '' THEN jsonb_build_object('type', 'paragraph')
        ELSE jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', "line"))
        )
      END
      ORDER BY "position"
    )
    FROM unnest(string_to_array(replace("note"."body", E'\r', ''), E'\n'))
      WITH ORDINALITY AS "lines" ("line", "position")
  )
)
WHERE "content" IS NULL;

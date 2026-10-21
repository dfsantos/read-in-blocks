ALTER TABLE "note" ADD COLUMN "type" text DEFAULT 'key_concept' NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_type" CHECK ("note"."type" in ('key_concept', 'quote', 'action_or_question'));--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_reference" CHECK (("note"."type" = 'quote' and "note"."reference" is not null and char_length("note"."reference") between 1 and 50) or ("note"."type" <> 'quote' and "note"."reference" is null));--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_resolved" CHECK ("note"."resolved_at" is null or "note"."type" = 'action_or_question');
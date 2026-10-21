CREATE TABLE "note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"book_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_body_length" CHECK (char_length("note"."body") between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "note" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_book_fk" FOREIGN KEY ("owner_id","book_id") REFERENCES "public"."book"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_node_fk" FOREIGN KEY ("owner_id","book_id","node_id") REFERENCES "public"."book_node"("owner_id","book_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_owner_book_node_created_idx" ON "note" USING btree ("owner_id","book_id","node_id","created_at");--> statement-breakpoint
CREATE POLICY "owner_only" ON "note" AS PERMISSIVE FOR ALL TO "app" USING (owner_id = nullif(current_setting('app.user_id', true), '')) WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), ''));
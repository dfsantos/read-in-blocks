CREATE TABLE "book_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"book_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_node_owner_id_book_id_id_unique" UNIQUE("owner_id","book_id","id"),
	CONSTRAINT "book_node_sibling_position_unique" UNIQUE NULLS NOT DISTINCT("book_id","parent_id","position"),
	CONSTRAINT "book_node_kind" CHECK ("book_node"."kind" in ('part', 'chapter', 'topic')),
	CONSTRAINT "book_node_root_kind" CHECK (("book_node"."kind" = 'part' and "book_node"."parent_id" is null) or "book_node"."kind" = 'chapter' or ("book_node"."kind" = 'topic' and "book_node"."parent_id" is not null)),
	CONSTRAINT "book_node_title_length" CHECK (char_length("book_node"."title") between 1 and 200),
	CONSTRAINT "book_node_position" CHECK ("book_node"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "book_node" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "book_node" ADD CONSTRAINT "book_node_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_node" ADD CONSTRAINT "book_node_book_fk" FOREIGN KEY ("owner_id","book_id") REFERENCES "public"."book"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_node" ADD CONSTRAINT "book_node_parent_fk" FOREIGN KEY ("owner_id","book_id","parent_id") REFERENCES "public"."book_node"("owner_id","book_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "owner_only" ON "book_node" AS PERMISSIVE FOR ALL TO "app" USING (owner_id = nullif(current_setting('app.user_id', true), '')) WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), ''));
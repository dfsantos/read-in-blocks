CREATE TABLE "book" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_owner_id_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "book_title_length" CHECK (char_length("book"."title") between 1 and 200),
	CONSTRAINT "book_author_length" CHECK ("book"."author" is null or char_length("book"."author") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "book" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "write_quota" (
	"owner_id" text NOT NULL,
	"action" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "write_quota_owner_id_action_pk" PRIMARY KEY("owner_id","action"),
	CONSTRAINT "write_quota_action_length" CHECK (char_length("write_quota"."action") <= 64)
);
--> statement-breakpoint
ALTER TABLE "write_quota" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "book" ADD CONSTRAINT "book_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "write_quota" ADD CONSTRAINT "write_quota_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "owner_only" ON "book" AS PERMISSIVE FOR ALL TO "app" USING (owner_id = nullif(current_setting('app.user_id', true), '')) WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_only" ON "write_quota" AS PERMISSIVE FOR ALL TO "app" USING (owner_id = nullif(current_setting('app.user_id', true), '')) WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), ''));
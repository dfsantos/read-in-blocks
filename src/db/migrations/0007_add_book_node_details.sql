ALTER TABLE "book_node" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "book_node" ADD COLUMN "goal_pages" integer;--> statement-breakpoint
ALTER TABLE "book_node" ADD CONSTRAINT "book_node_summary_length" CHECK ("book_node"."summary" is null or char_length("book_node"."summary") between 1 and 1000);--> statement-breakpoint
ALTER TABLE "book_node" ADD CONSTRAINT "book_node_goal_pages" CHECK ("book_node"."goal_pages" is null or "book_node"."goal_pages" between 1 and 10000);
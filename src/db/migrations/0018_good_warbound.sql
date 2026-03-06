CREATE TABLE "cbo_occupations" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(7) NOT NULL,
	"title" text NOT NULL,
	"family_code" varchar(4) NOT NULL,
	"family_title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cbo_occupations_code_idx" ON "cbo_occupations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "cbo_occupations_title_idx" ON "cbo_occupations" USING btree ("title");--> statement-breakpoint
CREATE INDEX "cbo_occupations_family_code_idx" ON "cbo_occupations" USING btree ("family_code");
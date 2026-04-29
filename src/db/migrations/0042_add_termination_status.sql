CREATE TYPE "public"."termination_status" AS ENUM('scheduled', 'completed', 'canceled');
--> statement-breakpoint
ALTER TYPE "public"."employee_status" ADD VALUE 'TERMINATION_SCHEDULED';
--> statement-breakpoint
ALTER TABLE "terminations" ADD COLUMN "status" "termination_status" DEFAULT 'completed' NOT NULL;
--> statement-breakpoint
CREATE INDEX "terminations_status_idx" ON "terminations" USING btree ("status");
--> statement-breakpoint
UPDATE "terminations" SET "status" = 'canceled' WHERE "deleted_at" IS NOT NULL;

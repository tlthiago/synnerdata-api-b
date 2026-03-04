CREATE TABLE "plan_limits" (
	"plan_id" text NOT NULL,
	"limit_key" text NOT NULL,
	"limit_value" integer NOT NULL,
	CONSTRAINT "plan_limits_plan_id_limit_key_pk" PRIMARY KEY("plan_id","limit_key")
);
--> statement-breakpoint
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Seed: trial plan max_employees = 10
INSERT INTO "plan_limits" ("plan_id", "limit_key", "limit_value")
VALUES ('plan-trial', 'max_employees', 10)
ON CONFLICT ("plan_id", "limit_key") DO UPDATE SET "limit_value" = EXCLUDED."limit_value";
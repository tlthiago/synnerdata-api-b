-- Allow multiple private trial plans (admin provisions with custom tiers)
-- while keeping the unique constraint for the default public trial plan.
-- Private plans have organization_id set, public plans don't.

DROP INDEX IF EXISTS "subscription_plans_single_active_trial";
--> statement-breakpoint

CREATE UNIQUE INDEX "subscription_plans_single_active_trial"
ON "subscription_plans" ("is_trial")
WHERE "is_trial" = true AND "archived_at" IS NULL AND "organization_id" IS NULL;

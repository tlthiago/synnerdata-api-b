ALTER TABLE "subscription_plans" ADD COLUMN "yearly_discount_percent" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
-- Archive non-seed trial plans to allow unique active trial constraint
UPDATE "subscription_plans"
SET "archived_at" = NOW()
WHERE "is_trial" = true AND "archived_at" IS NULL AND "id" != 'plan-trial';--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_single_active_trial" ON "subscription_plans" USING btree ("is_trial") WHERE "subscription_plans"."is_trial" = true AND "subscription_plans"."archived_at" IS NULL;--> statement-breakpoint
-- Seed: populate yearly_discount_percent = 20 for existing plans
UPDATE "subscription_plans"
SET "yearly_discount_percent" = 20
WHERE "id" IN ('plan-trial', 'plan-gold', 'plan-diamond', 'plan-platinum');
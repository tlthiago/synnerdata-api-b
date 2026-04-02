-- Fix: archive orphaned custom tiers on the default trial plan
-- Root cause: admin-provision's createCustomTrialTier() adds custom tiers
-- directly to the default trial plan (plan-trial), polluting it.
-- This migration cleans up the default plan and restores its original state.

-- 1. Archive any active trial plan that is NOT the default (plan-trial)
--    This satisfies the unique constraint before we un-archive plan-trial
UPDATE "subscription_plans"
SET "archived_at" = NOW()
WHERE "is_trial" = true
  AND "archived_at" IS NULL
  AND "id" != 'plan-trial';
--> statement-breakpoint

-- 2. Ensure the default trial plan is not archived
UPDATE "subscription_plans"
SET "archived_at" = NULL
WHERE "id" = 'plan-trial'
  AND "archived_at" IS NOT NULL;
--> statement-breakpoint

-- 3. Ensure the original tier (0-10) is not archived
UPDATE "plan_pricing_tiers"
SET "archived_at" = NULL
WHERE "id" = 'tier-trial-0-10'
  AND "archived_at" IS NOT NULL;
--> statement-breakpoint

-- 4. Archive all other tiers on the default trial plan (orphaned custom tiers)
UPDATE "plan_pricing_tiers"
SET "archived_at" = NOW()
WHERE "plan_id" = 'plan-trial'
  AND "id" != 'tier-trial-0-10'
  AND "archived_at" IS NULL;

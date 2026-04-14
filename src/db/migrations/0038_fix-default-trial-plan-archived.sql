-- Fix: restore default trial plan that was incorrectly archived.
--
-- Root cause: subscription-mutation.service.ts and plan-change.service.ts
-- archived any plan with is_public=false when a subscription changed plans.
-- The default trial plan (plan-trial) has is_public=false but is a shared
-- plan (organization_id IS NULL) — it should never be archived.
--
-- The archiving code has been fixed to only archive org-specific plans
-- (organization_id IS NOT NULL).

UPDATE "subscription_plans"
SET "archived_at" = NULL
WHERE "id" = 'plan-trial'
  AND "archived_at" IS NOT NULL;

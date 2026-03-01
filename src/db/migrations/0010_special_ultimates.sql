ALTER TABLE "organization_profiles" ALTER COLUMN "legal_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_profiles" ALTER COLUMN "tax_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_profiles" ALTER COLUMN "mobile" DROP NOT NULL;--> statement-breakpoint

-- Backfill: create minimal profiles for organizations that don't have one
INSERT INTO "organization_profiles" ("id", "organization_id", "trade_name", "status", "created_at", "updated_at")
SELECT
  'profile-' || gen_random_uuid(),
  o."id",
  o."name",
  'ACTIVE',
  NOW(),
  NOW()
FROM "organizations" o
LEFT JOIN "organization_profiles" op ON op."organization_id" = o."id"
WHERE op."id" IS NULL;
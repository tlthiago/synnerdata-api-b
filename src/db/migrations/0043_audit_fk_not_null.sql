-- ============================================================================
-- PRD #3 — Audit FK + NOT NULL + drop deletedBy
--
-- This migration enforces referential integrity on createdBy/updatedBy across
-- 26 in-scope domain tables and drops deletedBy on 24 of them. audit_logs
-- (populated by PRD #1) is now the authoritative source of deletion attribution.
--
-- Production safety:
--   - Pre-deploy gate: both null-audit.sql (zero NULLs on createdBy/updatedBy)
--     AND orphan-audit-pre.sql (zero FK orphans) must clear within 24h of merge.
--     Scripts: .compozy/tasks/audit-fk-not-null/scripts/null-audit.sql and
--              .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-pre.sql
--   - Backfill: updated_by = created_by for any row with updated_by IS NULL
--     (Semantic A normalization). The features table is special-cased because
--     migration 0012 seeded its rows with NULL audit columns; both columns are
--     backfilled to the oldest user.id (minimum-disruption convention).
--   - FK constraints added with NOT VALID (no table scan), then VALIDATE
--     CONSTRAINT in a separate statement (ShareUpdateExclusiveLock — allows
--     concurrent reads/writes; aborts atomically if any orphan slips through).
--   - DROP COLUMN deleted_by is irreversible. Rollback strategy in
--     .compozy/tasks/audit-fk-not-null/deploy-gate.md (re-add column without
--     historical values; deletion attribution before this migration is in
--     audit_logs from PRD #1).
-- ============================================================================
--> statement-breakpoint

-- Step 1a: Ensure at least one user exists for the features backfill below.
-- Idempotent: in production this is a no-op (users.id 'system-migration-user' will not
-- collide with any real user_<…>/admin_<…> id, and the WHERE NOT EXISTS clause makes
-- the INSERT skip if any user is already present). In a fresh test/CI DB (no users
-- seeded by migrations), this seeds the sentinel that the next step uses.
INSERT INTO "users" ("id", "name", "email", "email_verified", "created_at", "updated_at")
SELECT 'system-migration-user', 'System Migration User',
       'system-migration@synnerdata.local', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "users");
--> statement-breakpoint

-- Step 1b: Backfill features (special — migration 0012 seeded with NULL audit columns).
-- Pick the oldest user.id (the system user in any environment that has one; the
-- sentinel inserted by Step 1a in test/CI; the original platform owner in prod).
UPDATE "features"
SET "created_by" = (SELECT id FROM "users" ORDER BY created_at ASC LIMIT 1),
    "updated_by" = (SELECT id FROM "users" ORDER BY created_at ASC LIMIT 1)
WHERE "created_by" IS NULL OR "updated_by" IS NULL;
--> statement-breakpoint

-- Step 2: Backfill updated_by = created_by where NULL (22 tables with updatedBy)
UPDATE "absences" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "accidents" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "admin_org_provisions" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "billing_profiles" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "branches" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "cost_centers" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "cpf_analyses" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "employees" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "job_classifications" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "job_positions" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "labor_lawsuits" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "medical_certificates" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "organization_profiles" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "ppe_deliveries" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "ppe_items" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "projects" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "promotions" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "sectors" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "terminations" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "vacations" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
UPDATE "warnings" SET "updated_by" = "created_by" WHERE "updated_by" IS NULL;
--> statement-breakpoint

-- Step 3: SET NOT NULL on 26 createdBy + 22 updatedBy (48 statements)
ALTER TABLE "absences" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "absences" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "accidents" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "accidents" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "admin_org_provisions" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "admin_org_provisions" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "billing_profiles" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "billing_profiles" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "branches" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "branches" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "cost_centers" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "cost_centers" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "cpf_analyses" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "cpf_analyses" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "features" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "features" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "job_classifications" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "job_classifications" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "job_positions" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "job_positions" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "labor_lawsuits" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "labor_lawsuits" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "medical_certificates" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "medical_certificates" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "organization_profiles" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "organization_profiles" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "ppe_deliveries" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "ppe_deliveries" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "ppe_delivery_items" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "ppe_delivery_logs" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "ppe_items" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "ppe_items" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "ppe_job_positions" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "project_employees" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "promotions" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "promotions" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "sectors" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "sectors" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "terminations" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "terminations" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "vacations" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "vacations" ALTER COLUMN "updated_by" SET NOT NULL;
ALTER TABLE "warnings" ALTER COLUMN "created_by" SET NOT NULL;
ALTER TABLE "warnings" ALTER COLUMN "updated_by" SET NOT NULL;
--> statement-breakpoint

-- Step 4: ADD CONSTRAINT FOREIGN KEY NOT VALID on 26 createdBy + 22 updatedBy (48 statements)
ALTER TABLE "absences" ADD CONSTRAINT "absences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "absences" ADD CONSTRAINT "absences_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "admin_org_provisions" ADD CONSTRAINT "admin_org_provisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "admin_org_provisions" ADD CONSTRAINT "admin_org_provisions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "branches" ADD CONSTRAINT "branches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "branches" ADD CONSTRAINT "branches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "cpf_analyses" ADD CONSTRAINT "cpf_analyses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "cpf_analyses" ADD CONSTRAINT "cpf_analyses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "employees" ADD CONSTRAINT "employees_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "features" ADD CONSTRAINT "features_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "features" ADD CONSTRAINT "features_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "job_classifications" ADD CONSTRAINT "job_classifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "job_classifications" ADD CONSTRAINT "job_classifications_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "labor_lawsuits" ADD CONSTRAINT "labor_lawsuits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "labor_lawsuits" ADD CONSTRAINT "labor_lawsuits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "ppe_delivery_items" ADD CONSTRAINT "ppe_delivery_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "ppe_delivery_logs" ADD CONSTRAINT "ppe_delivery_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "ppe_items" ADD CONSTRAINT "ppe_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "ppe_items" ADD CONSTRAINT "ppe_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "ppe_job_positions" ADD CONSTRAINT "ppe_job_positions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "project_employees" ADD CONSTRAINT "project_employees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint

-- Step 5: VALIDATE CONSTRAINT for all 48 added above (48 statements)
ALTER TABLE "absences" VALIDATE CONSTRAINT "absences_created_by_users_id_fk";
ALTER TABLE "absences" VALIDATE CONSTRAINT "absences_updated_by_users_id_fk";
ALTER TABLE "accidents" VALIDATE CONSTRAINT "accidents_created_by_users_id_fk";
ALTER TABLE "accidents" VALIDATE CONSTRAINT "accidents_updated_by_users_id_fk";
ALTER TABLE "admin_org_provisions" VALIDATE CONSTRAINT "admin_org_provisions_created_by_users_id_fk";
ALTER TABLE "admin_org_provisions" VALIDATE CONSTRAINT "admin_org_provisions_updated_by_users_id_fk";
ALTER TABLE "billing_profiles" VALIDATE CONSTRAINT "billing_profiles_created_by_users_id_fk";
ALTER TABLE "billing_profiles" VALIDATE CONSTRAINT "billing_profiles_updated_by_users_id_fk";
ALTER TABLE "branches" VALIDATE CONSTRAINT "branches_created_by_users_id_fk";
ALTER TABLE "branches" VALIDATE CONSTRAINT "branches_updated_by_users_id_fk";
ALTER TABLE "cost_centers" VALIDATE CONSTRAINT "cost_centers_created_by_users_id_fk";
ALTER TABLE "cost_centers" VALIDATE CONSTRAINT "cost_centers_updated_by_users_id_fk";
ALTER TABLE "cpf_analyses" VALIDATE CONSTRAINT "cpf_analyses_created_by_users_id_fk";
ALTER TABLE "cpf_analyses" VALIDATE CONSTRAINT "cpf_analyses_updated_by_users_id_fk";
ALTER TABLE "employees" VALIDATE CONSTRAINT "employees_created_by_users_id_fk";
ALTER TABLE "employees" VALIDATE CONSTRAINT "employees_updated_by_users_id_fk";
ALTER TABLE "features" VALIDATE CONSTRAINT "features_created_by_users_id_fk";
ALTER TABLE "features" VALIDATE CONSTRAINT "features_updated_by_users_id_fk";
ALTER TABLE "job_classifications" VALIDATE CONSTRAINT "job_classifications_created_by_users_id_fk";
ALTER TABLE "job_classifications" VALIDATE CONSTRAINT "job_classifications_updated_by_users_id_fk";
ALTER TABLE "job_positions" VALIDATE CONSTRAINT "job_positions_created_by_users_id_fk";
ALTER TABLE "job_positions" VALIDATE CONSTRAINT "job_positions_updated_by_users_id_fk";
ALTER TABLE "labor_lawsuits" VALIDATE CONSTRAINT "labor_lawsuits_created_by_users_id_fk";
ALTER TABLE "labor_lawsuits" VALIDATE CONSTRAINT "labor_lawsuits_updated_by_users_id_fk";
ALTER TABLE "medical_certificates" VALIDATE CONSTRAINT "medical_certificates_created_by_users_id_fk";
ALTER TABLE "medical_certificates" VALIDATE CONSTRAINT "medical_certificates_updated_by_users_id_fk";
ALTER TABLE "organization_profiles" VALIDATE CONSTRAINT "organization_profiles_created_by_users_id_fk";
ALTER TABLE "organization_profiles" VALIDATE CONSTRAINT "organization_profiles_updated_by_users_id_fk";
ALTER TABLE "ppe_deliveries" VALIDATE CONSTRAINT "ppe_deliveries_created_by_users_id_fk";
ALTER TABLE "ppe_deliveries" VALIDATE CONSTRAINT "ppe_deliveries_updated_by_users_id_fk";
ALTER TABLE "ppe_delivery_items" VALIDATE CONSTRAINT "ppe_delivery_items_created_by_users_id_fk";
ALTER TABLE "ppe_delivery_logs" VALIDATE CONSTRAINT "ppe_delivery_logs_created_by_users_id_fk";
ALTER TABLE "ppe_items" VALIDATE CONSTRAINT "ppe_items_created_by_users_id_fk";
ALTER TABLE "ppe_items" VALIDATE CONSTRAINT "ppe_items_updated_by_users_id_fk";
ALTER TABLE "ppe_job_positions" VALIDATE CONSTRAINT "ppe_job_positions_created_by_users_id_fk";
ALTER TABLE "project_employees" VALIDATE CONSTRAINT "project_employees_created_by_users_id_fk";
ALTER TABLE "projects" VALIDATE CONSTRAINT "projects_created_by_users_id_fk";
ALTER TABLE "projects" VALIDATE CONSTRAINT "projects_updated_by_users_id_fk";
ALTER TABLE "promotions" VALIDATE CONSTRAINT "promotions_created_by_users_id_fk";
ALTER TABLE "promotions" VALIDATE CONSTRAINT "promotions_updated_by_users_id_fk";
ALTER TABLE "sectors" VALIDATE CONSTRAINT "sectors_created_by_users_id_fk";
ALTER TABLE "sectors" VALIDATE CONSTRAINT "sectors_updated_by_users_id_fk";
ALTER TABLE "terminations" VALIDATE CONSTRAINT "terminations_created_by_users_id_fk";
ALTER TABLE "terminations" VALIDATE CONSTRAINT "terminations_updated_by_users_id_fk";
ALTER TABLE "vacations" VALIDATE CONSTRAINT "vacations_created_by_users_id_fk";
ALTER TABLE "vacations" VALIDATE CONSTRAINT "vacations_updated_by_users_id_fk";
ALTER TABLE "warnings" VALIDATE CONSTRAINT "warnings_created_by_users_id_fk";
ALTER TABLE "warnings" VALIDATE CONSTRAINT "warnings_updated_by_users_id_fk";
--> statement-breakpoint

-- Step 6: DROP COLUMN deleted_by on 24 tables (24 statements)
ALTER TABLE "absences" DROP COLUMN "deleted_by";
ALTER TABLE "accidents" DROP COLUMN "deleted_by";
ALTER TABLE "admin_org_provisions" DROP COLUMN "deleted_by";
ALTER TABLE "billing_profiles" DROP COLUMN "deleted_by";
ALTER TABLE "branches" DROP COLUMN "deleted_by";
ALTER TABLE "cost_centers" DROP COLUMN "deleted_by";
ALTER TABLE "cpf_analyses" DROP COLUMN "deleted_by";
ALTER TABLE "employees" DROP COLUMN "deleted_by";
ALTER TABLE "job_classifications" DROP COLUMN "deleted_by";
ALTER TABLE "job_positions" DROP COLUMN "deleted_by";
ALTER TABLE "labor_lawsuits" DROP COLUMN "deleted_by";
ALTER TABLE "medical_certificates" DROP COLUMN "deleted_by";
ALTER TABLE "organization_profiles" DROP COLUMN "deleted_by";
ALTER TABLE "ppe_deliveries" DROP COLUMN "deleted_by";
ALTER TABLE "ppe_delivery_items" DROP COLUMN "deleted_by";
ALTER TABLE "ppe_items" DROP COLUMN "deleted_by";
ALTER TABLE "ppe_job_positions" DROP COLUMN "deleted_by";
ALTER TABLE "project_employees" DROP COLUMN "deleted_by";
ALTER TABLE "projects" DROP COLUMN "deleted_by";
ALTER TABLE "promotions" DROP COLUMN "deleted_by";
ALTER TABLE "sectors" DROP COLUMN "deleted_by";
ALTER TABLE "terminations" DROP COLUMN "deleted_by";
ALTER TABLE "vacations" DROP COLUMN "deleted_by";
ALTER TABLE "warnings" DROP COLUMN "deleted_by";

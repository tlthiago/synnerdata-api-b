DO $$ BEGIN
  CREATE TYPE "public"."acquisition_period_status" AS ENUM('pending', 'available', 'used', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "vacation_acquisition_periods" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "employee_id" text NOT NULL REFERENCES "employees" ("id") ON DELETE CASCADE,
  "acquisition_start" date NOT NULL,
  "acquisition_end" date NOT NULL,
  "concession_start" date NOT NULL,
  "concession_end" date NOT NULL,
  "days_entitled" integer NOT NULL DEFAULT 30,
  "days_used" integer NOT NULL DEFAULT 0,
  "status" "acquisition_period_status" NOT NULL DEFAULT 'pending',
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" text,
  "updated_by" text,
  "deleted_at" timestamp with time zone,
  "deleted_by" text
);

ALTER TABLE "vacations" DROP COLUMN IF EXISTS "days_total";
ALTER TABLE "vacations" DROP COLUMN IF EXISTS "acquisition_period_start";
ALTER TABLE "vacations" DROP COLUMN IF EXISTS "acquisition_period_end";
ALTER TABLE "vacations" ADD COLUMN IF NOT EXISTS "acquisition_period_id" text REFERENCES "vacation_acquisition_periods" ("id");

CREATE INDEX IF NOT EXISTS "vap_organization_id_idx" ON "vacation_acquisition_periods" ("organization_id");
CREATE INDEX IF NOT EXISTS "vap_employee_id_idx" ON "vacation_acquisition_periods" ("employee_id");
CREATE INDEX IF NOT EXISTS "vap_status_idx" ON "vacation_acquisition_periods" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "vap_employee_acquisition_start_idx" ON "vacation_acquisition_periods" ("employee_id", "acquisition_start");

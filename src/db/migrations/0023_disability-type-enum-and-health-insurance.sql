-- Create disability_type enum
CREATE TYPE "public"."disability_type" AS ENUM('AUDITIVA', 'VISUAL', 'FISICA', 'INTELECTUAL', 'MENTAL', 'MULTIPLA');

-- Normalize existing data before converting to enum
UPDATE "employees" SET "disability_type" = UPPER(TRIM("disability_type")) WHERE "disability_type" IS NOT NULL;

-- Convert disability_type column from text to enum
ALTER TABLE "employees" ALTER COLUMN "disability_type" TYPE "public"."disability_type" USING "disability_type"::"public"."disability_type";

-- Add health_insurance column
ALTER TABLE "employees" ADD COLUMN "health_insurance" numeric(10, 2);

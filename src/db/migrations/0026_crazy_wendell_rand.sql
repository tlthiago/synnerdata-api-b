ALTER TABLE "vacation_acquisition_periods" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "vacation_acquisition_periods" CASCADE;--> statement-breakpoint
ALTER TABLE "vacations" DROP CONSTRAINT "vacations_acquisition_period_id_vacation_acquisition_periods_id_fk";
--> statement-breakpoint
ALTER TABLE "vacations" ADD COLUMN "acquisition_period_start" date;--> statement-breakpoint
ALTER TABLE "vacations" ADD COLUMN "acquisition_period_end" date;--> statement-breakpoint
ALTER TABLE "vacations" ADD COLUMN "concessive_period_start" date;--> statement-breakpoint
ALTER TABLE "vacations" ADD COLUMN "concessive_period_end" date;--> statement-breakpoint
ALTER TABLE "vacations" ADD COLUMN "days_entitled" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "vacations" DROP COLUMN "acquisition_period_id";--> statement-breakpoint
DROP TYPE "public"."acquisition_period_status";
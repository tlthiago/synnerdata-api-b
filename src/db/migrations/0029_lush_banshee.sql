ALTER TABLE "employees" ALTER COLUMN "work_shift" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "education_level" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "has_special_needs" SET DEFAULT false;
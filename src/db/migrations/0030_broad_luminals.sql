ALTER TABLE "employees" ALTER COLUMN "pis" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "work_permit_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "has_children" SET DEFAULT false;
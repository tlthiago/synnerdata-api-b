CREATE TYPE "public"."contract_type" AS ENUM('CLT', 'PJ');--> statement-breakpoint
CREATE TYPE "public"."education_level" AS ENUM('ELEMENTARY', 'HIGH_SCHOOL', 'BACHELOR', 'POST_GRADUATE', 'MASTER', 'DOCTORATE');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('ACTIVE', 'TERMINATED', 'ON_LEAVE', 'ON_VACATION', 'VACATION_SCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE', 'NOT_DECLARED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'STABLE_UNION', 'SEPARATED');--> statement-breakpoint
CREATE TYPE "public"."work_shift" AS ENUM('TWELVE_THIRTY_SIX', 'SIX_ONE', 'FIVE_TWO', 'FOUR_THREE');--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"mobile" text NOT NULL,
	"birth_date" date NOT NULL,
	"gender" "gender" NOT NULL,
	"marital_status" "marital_status" NOT NULL,
	"birthplace" text NOT NULL,
	"nationality" text NOT NULL,
	"height" numeric(4, 2),
	"weight" numeric(6, 2),
	"father_name" text,
	"mother_name" text NOT NULL,
	"cpf" text NOT NULL,
	"identity_card" text NOT NULL,
	"pis" text NOT NULL,
	"work_permit_number" text NOT NULL,
	"work_permit_series" text NOT NULL,
	"military_certificate" text,
	"street" text NOT NULL,
	"street_number" text NOT NULL,
	"complement" text,
	"neighborhood" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip_code" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"hire_date" date NOT NULL,
	"contract_type" "contract_type" NOT NULL,
	"salary" numeric(10, 2) NOT NULL,
	"status" "employee_status" DEFAULT 'ACTIVE' NOT NULL,
	"manager" text,
	"branch_id" text,
	"sector_id" text NOT NULL,
	"cost_center_id" text,
	"job_position_id" text NOT NULL,
	"job_classification_id" text NOT NULL,
	"work_shift" "work_shift" NOT NULL,
	"weekly_hours" numeric(5, 2) NOT NULL,
	"bus_count" integer,
	"meal_allowance" numeric(10, 2),
	"transport_allowance" numeric(10, 2),
	"education_level" "education_level" NOT NULL,
	"has_special_needs" boolean NOT NULL,
	"disability_type" text,
	"has_children" boolean NOT NULL,
	"children_count" integer,
	"has_children_under_21" boolean,
	"last_health_exam_date" date,
	"admission_exam_date" date,
	"termination_exam_date" date,
	"probation1_expiry_date" date,
	"probation2_expiry_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_job_position_id_job_positions_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_job_classification_id_job_classifications_id_fk" FOREIGN KEY ("job_classification_id") REFERENCES "public"."job_classifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employees_organization_id_idx" ON "employees" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employees_cpf_idx" ON "employees" USING btree ("cpf");--> statement-breakpoint
CREATE INDEX "employees_name_idx" ON "employees" USING btree ("name");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employees_branch_id_idx" ON "employees" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "employees_sector_id_idx" ON "employees" USING btree ("sector_id");--> statement-breakpoint
CREATE INDEX "employees_job_position_id_idx" ON "employees" USING btree ("job_position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_cpf_org_unique_idx" ON "employees" USING btree ("cpf","organization_id") WHERE deleted_at IS NULL;
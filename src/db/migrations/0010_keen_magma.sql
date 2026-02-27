CREATE TYPE "public"."ppe_delivery_action" AS ENUM('ADDED', 'REMOVED');--> statement-breakpoint
CREATE TABLE "project_employees" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ppe_job_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ppe_item_id" text NOT NULL,
	"job_position_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "ppe_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"delivery_date" date NOT NULL,
	"reason" text NOT NULL,
	"delivered_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "labor_lawsuits" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"process_number" varchar(25) NOT NULL,
	"court" varchar(255) NOT NULL,
	"filing_date" date NOT NULL,
	"knowledge_date" date NOT NULL,
	"plaintiff" varchar(255) NOT NULL,
	"defendant" varchar(255) NOT NULL,
	"plaintiff_lawyer" varchar(255),
	"defendant_lawyer" varchar(255),
	"description" text NOT NULL,
	"claim_amount" numeric(12, 2),
	"progress" text,
	"decision" text,
	"conclusion_date" date,
	"appeals" text,
	"costs_expenses" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "ppe_delivery_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"ppe_delivery_id" text NOT NULL,
	"ppe_item_id" text NOT NULL,
	"action" "ppe_delivery_action" NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255) NOT NULL,
	"start_date" date NOT NULL,
	"cno" varchar(12) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "billing_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"street" text,
	"number" text,
	"complement" text,
	"neighborhood" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"pagarme_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_profiles_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "ppe_delivery_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ppe_delivery_id" text NOT NULL,
	"ppe_item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "ppe_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"equipment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
ALTER TABLE "org_subscriptions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ALTER COLUMN "status" SET DEFAULT 'active'::text;--> statement-breakpoint
DROP TYPE "public"."subscription_status";--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
ALTER TABLE "org_subscriptions" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."subscription_status";--> statement-breakpoint
ALTER TABLE "org_subscriptions" ALTER COLUMN "status" SET DATA TYPE "public"."subscription_status" USING "status"::"public"."subscription_status";--> statement-breakpoint
ALTER TABLE "terminations" ALTER COLUMN "notice_period_worked" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plans" ALTER COLUMN "trial_days" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD COLUMN "pagarme_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD COLUMN "price_at_purchase" integer;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD COLUMN "is_custom_price" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD COLUMN "custom_price_monthly" integer;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD COLUMN "custom_price_yearly" integer;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD COLUMN "created_by_admin_id" text;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD COLUMN "pagarme_plan_id" text;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_employees" ADD CONSTRAINT "project_employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_employees" ADD CONSTRAINT "project_employees_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_employees" ADD CONSTRAINT "project_employees_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_job_positions" ADD CONSTRAINT "ppe_job_positions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_job_positions" ADD CONSTRAINT "ppe_job_positions_ppe_item_id_ppe_items_id_fk" FOREIGN KEY ("ppe_item_id") REFERENCES "public"."ppe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_job_positions" ADD CONSTRAINT "ppe_job_positions_job_position_id_job_positions_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_lawsuits" ADD CONSTRAINT "labor_lawsuits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_lawsuits" ADD CONSTRAINT "labor_lawsuits_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_logs" ADD CONSTRAINT "ppe_delivery_logs_ppe_delivery_id_ppe_deliveries_id_fk" FOREIGN KEY ("ppe_delivery_id") REFERENCES "public"."ppe_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_logs" ADD CONSTRAINT "ppe_delivery_logs_ppe_item_id_ppe_items_id_fk" FOREIGN KEY ("ppe_item_id") REFERENCES "public"."ppe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" ADD CONSTRAINT "ppe_delivery_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" ADD CONSTRAINT "ppe_delivery_items_ppe_delivery_id_ppe_deliveries_id_fk" FOREIGN KEY ("ppe_delivery_id") REFERENCES "public"."ppe_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" ADD CONSTRAINT "ppe_delivery_items_ppe_item_id_ppe_items_id_fk" FOREIGN KEY ("ppe_item_id") REFERENCES "public"."ppe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_items" ADD CONSTRAINT "ppe_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_employees_organization_id_idx" ON "project_employees" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_employees_project_id_idx" ON "project_employees" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_employees_employee_id_idx" ON "project_employees" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_employees_unique_idx" ON "project_employees" USING btree ("project_id","employee_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "twoFactors_secret_idx" ON "two_factors" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactors_userId_idx" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ppe_job_positions_organization_id_idx" ON "ppe_job_positions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ppe_job_positions_ppe_item_id_idx" ON "ppe_job_positions" USING btree ("ppe_item_id");--> statement-breakpoint
CREATE INDEX "ppe_job_positions_job_position_id_idx" ON "ppe_job_positions" USING btree ("job_position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ppe_job_positions_unique_idx" ON "ppe_job_positions" USING btree ("ppe_item_id","job_position_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "ppe_deliveries_organization_id_idx" ON "ppe_deliveries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ppe_deliveries_employee_id_idx" ON "ppe_deliveries" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ppe_deliveries_delivery_date_idx" ON "ppe_deliveries" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "labor_lawsuits_organization_id_idx" ON "labor_lawsuits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "labor_lawsuits_employee_id_idx" ON "labor_lawsuits" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "labor_lawsuits_process_number_idx" ON "labor_lawsuits" USING btree ("process_number");--> statement-breakpoint
CREATE INDEX "labor_lawsuits_filing_date_idx" ON "labor_lawsuits" USING btree ("filing_date");--> statement-breakpoint
CREATE INDEX "ppe_delivery_logs_ppe_delivery_id_idx" ON "ppe_delivery_logs" USING btree ("ppe_delivery_id");--> statement-breakpoint
CREATE INDEX "ppe_delivery_logs_ppe_item_id_idx" ON "ppe_delivery_logs" USING btree ("ppe_item_id");--> statement-breakpoint
CREATE INDEX "projects_organization_id_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_cno_idx" ON "projects" USING btree ("cno");--> statement-breakpoint
CREATE INDEX "projects_start_date_idx" ON "projects" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "billing_profiles_organization_id_idx" ON "billing_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billing_profiles_tax_id_idx" ON "billing_profiles" USING btree ("tax_id");--> statement-breakpoint
CREATE INDEX "billing_profiles_pagarme_customer_id_idx" ON "billing_profiles" USING btree ("pagarme_customer_id");--> statement-breakpoint
CREATE INDEX "ppe_delivery_items_organization_id_idx" ON "ppe_delivery_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ppe_delivery_items_ppe_delivery_id_idx" ON "ppe_delivery_items" USING btree ("ppe_delivery_id");--> statement-breakpoint
CREATE INDEX "ppe_delivery_items_ppe_item_id_idx" ON "ppe_delivery_items" USING btree ("ppe_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ppe_delivery_items_unique_idx" ON "ppe_delivery_items" USING btree ("ppe_delivery_id","ppe_item_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "ppe_items_organization_id_idx" ON "ppe_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ppe_items_name_idx" ON "ppe_items" USING btree ("name");--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "registration_number";--> statement-breakpoint
ALTER TABLE "org_subscriptions" DROP COLUMN "employee_count";--> statement-breakpoint
ALTER TABLE "org_subscriptions" DROP COLUMN "pagarme_customer_id";--> statement-breakpoint
ALTER TABLE "pending_checkouts" DROP COLUMN "employee_count";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "pagarme_plan_id_monthly";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "pagarme_plan_id_yearly";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "price_monthly";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "price_yearly";
CREATE TYPE "public"."contract_type" AS ENUM('CLT', 'PJ');--> statement-breakpoint
CREATE TYPE "public"."education_level" AS ENUM('ELEMENTARY', 'HIGH_SCHOOL', 'BACHELOR', 'POST_GRADUATE', 'MASTER', 'DOCTORATE');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('ACTIVE', 'TERMINATED', 'ON_LEAVE', 'ON_VACATION', 'VACATION_SCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE', 'NOT_DECLARED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'STABLE_UNION', 'SEPARATED');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('ACTIVE', 'INACTIVE', 'UNDER_REVIEW', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."ppe_delivery_action" AS ENUM('ADDED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."termination_type" AS ENUM('RESIGNATION', 'DISMISSAL_WITH_CAUSE', 'DISMISSAL_WITHOUT_CAUSE', 'MUTUAL_AGREEMENT', 'CONTRACT_END');--> statement-breakpoint
CREATE TYPE "public"."vacation_status" AS ENUM('scheduled', 'in_progress', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."warning_type" AS ENUM('verbal', 'written', 'suspension');--> statement-breakpoint
CREATE TYPE "public"."work_shift" AS ENUM('TWELVE_THIRTY_SIX', 'SIX_ONE', 'FIVE_TWO', 'FOUR_THREE');--> statement-breakpoint
CREATE TYPE "public"."cpf_analysis_status" AS ENUM('pending', 'approved', 'rejected', 'review');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'supervisor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."pending_checkout_status" AS ENUM('pending', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
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
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"tax_id" text NOT NULL,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text,
	"neighborhood" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip_code" text NOT NULL,
	"phone" text,
	"mobile" text NOT NULL,
	"founded_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "medical_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days_off" integer NOT NULL,
	"cid" text,
	"doctor_name" text,
	"doctor_crm" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accidents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"nature" text NOT NULL,
	"cat" text,
	"measures_taken" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "cpf_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"analysis_date" date NOT NULL,
	"status" "cpf_analysis_status" NOT NULL,
	"score" integer,
	"risk_level" "risk_level",
	"observations" text,
	"external_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "organization_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"trade_name" text NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"street" text,
	"number" text,
	"complement" text,
	"neighborhood" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"email" text,
	"phone" text,
	"mobile" text NOT NULL,
	"tax_regime" text,
	"state_registration" text,
	"main_activity_code" text,
	"founding_date" date,
	"revenue" numeric(10, 2),
	"industry" text,
	"business_area" text,
	"max_users" integer DEFAULT 4,
	"max_employees" integer DEFAULT 10,
	"logo_url" text,
	"pb_url" text,
	"pagarme_customer_id" text,
	"status" "organization_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "organization_profiles_tax_id_unique" UNIQUE("tax_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikeys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean DEFAULT false,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"pagarme_customer_id" text,
	"pagarme_subscription_id" text,
	"status" text NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"cancel_at_period_end" boolean,
	"seats" integer,
	"trial_start" timestamp,
	"trial_end" timestamp
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"pagarme_customer_id" text,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "absences" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"type" text NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
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
CREATE TABLE "terminations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"termination_date" date NOT NULL,
	"type" "termination_type" NOT NULL,
	"reason" text,
	"notice_period_days" integer,
	"notice_period_worked" boolean DEFAULT false NOT NULL,
	"last_working_day" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
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
CREATE TABLE "warnings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"date" date NOT NULL,
	"type" "warning_type" NOT NULL,
	"reason" text NOT NULL,
	"description" text,
	"witness_name" text,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "vacations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days_total" integer NOT NULL,
	"days_used" integer NOT NULL,
	"acquisition_period_start" date NOT NULL,
	"acquisition_period_end" date NOT NULL,
	"status" "vacation_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
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
CREATE TABLE "promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"promotion_date" date NOT NULL,
	"previous_job_position_id" text NOT NULL,
	"new_job_position_id" text NOT NULL,
	"previous_salary" numeric(12, 2) NOT NULL,
	"new_salary" numeric(12, 2) NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "org_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"pricing_tier_id" text,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"pagarme_subscription_id" text,
	"pagarme_updated_at" timestamp with time zone,
	"trial_start" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"trial_used" boolean DEFAULT false NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"past_due_since" timestamp with time zone,
	"grace_period_ends" timestamp with time zone,
	"billing_cycle" text DEFAULT 'monthly',
	"pending_plan_id" text,
	"pending_billing_cycle" text,
	"pending_pricing_tier_id" text,
	"plan_change_at" timestamp with time zone,
	"seats" integer DEFAULT 1 NOT NULL,
	"price_at_purchase" integer,
	"is_custom_price" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_checkouts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"pricing_tier_id" text,
	"billing_cycle" text DEFAULT 'monthly',
	"payment_link_id" text NOT NULL,
	"status" "pending_checkout_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"custom_price_monthly" integer,
	"custom_price_yearly" integer,
	"created_by_admin_id" text,
	"notes" text,
	"pagarme_plan_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_pricing_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"min_employees" integer NOT NULL,
	"max_employees" integer NOT NULL,
	"price_monthly" integer NOT NULL,
	"price_yearly" integer NOT NULL,
	"pagarme_plan_id_monthly" text,
	"pagarme_plan_id_yearly" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text,
	"event_type" text NOT NULL,
	"pagarme_event_id" text,
	"payload" jsonb,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_events_pagarme_event_id_unique" UNIQUE("pagarme_event_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"limits" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "job_classifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
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
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
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
CREATE TABLE "job_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_employees" ADD CONSTRAINT "project_employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_employees" ADD CONSTRAINT "project_employees_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_employees" ADD CONSTRAINT "project_employees_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpf_analyses" ADD CONSTRAINT "cpf_analyses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpf_analyses" ADD CONSTRAINT "cpf_analyses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_job_positions" ADD CONSTRAINT "ppe_job_positions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_job_positions" ADD CONSTRAINT "ppe_job_positions_ppe_item_id_ppe_items_id_fk" FOREIGN KEY ("ppe_item_id") REFERENCES "public"."ppe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_job_positions" ADD CONSTRAINT "ppe_job_positions_job_position_id_job_positions_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_lawsuits" ADD CONSTRAINT "labor_lawsuits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_lawsuits" ADD CONSTRAINT "labor_lawsuits_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_job_position_id_job_positions_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_job_classification_id_job_classifications_id_fk" FOREIGN KEY ("job_classification_id") REFERENCES "public"."job_classifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_logs" ADD CONSTRAINT "ppe_delivery_logs_ppe_delivery_id_ppe_deliveries_id_fk" FOREIGN KEY ("ppe_delivery_id") REFERENCES "public"."ppe_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_logs" ADD CONSTRAINT "ppe_delivery_logs_ppe_item_id_ppe_items_id_fk" FOREIGN KEY ("ppe_item_id") REFERENCES "public"."ppe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_previous_job_position_id_job_positions_id_fk" FOREIGN KEY ("previous_job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_new_job_position_id_job_positions_id_fk" FOREIGN KEY ("new_job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_pricing_tier_id_plan_pricing_tiers_id_fk" FOREIGN KEY ("pricing_tier_id") REFERENCES "public"."plan_pricing_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_pending_plan_id_subscription_plans_id_fk" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_pending_pricing_tier_id_plan_pricing_tiers_id_fk" FOREIGN KEY ("pending_pricing_tier_id") REFERENCES "public"."plan_pricing_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD CONSTRAINT "pending_checkouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD CONSTRAINT "pending_checkouts_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD CONSTRAINT "pending_checkouts_pricing_tier_id_plan_pricing_tiers_id_fk" FOREIGN KEY ("pricing_tier_id") REFERENCES "public"."plan_pricing_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_pricing_tiers" ADD CONSTRAINT "plan_pricing_tiers_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_org_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."org_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_classifications" ADD CONSTRAINT "job_classifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" ADD CONSTRAINT "ppe_delivery_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" ADD CONSTRAINT "ppe_delivery_items_ppe_delivery_id_ppe_deliveries_id_fk" FOREIGN KEY ("ppe_delivery_id") REFERENCES "public"."ppe_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_delivery_items" ADD CONSTRAINT "ppe_delivery_items_ppe_item_id_ppe_items_id_fk" FOREIGN KEY ("ppe_item_id") REFERENCES "public"."ppe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_items" ADD CONSTRAINT "ppe_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_centers_organization_id_idx" ON "cost_centers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cost_centers_name_idx" ON "cost_centers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "project_employees_organization_id_idx" ON "project_employees" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_employees_project_id_idx" ON "project_employees" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_employees_employee_id_idx" ON "project_employees" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_employees_unique_idx" ON "project_employees" USING btree ("project_id","employee_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "branches_organization_id_idx" ON "branches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "branches_tax_id_idx" ON "branches" USING btree ("tax_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_tax_id_unique_idx" ON "branches" USING btree ("tax_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "medical_certificates_organization_id_idx" ON "medical_certificates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "medical_certificates_employee_id_idx" ON "medical_certificates" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_date_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "accidents_organization_id_idx" ON "accidents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "accidents_employee_id_idx" ON "accidents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "accidents_date_idx" ON "accidents" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sectors_organization_id_idx" ON "sectors" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sectors_name_idx" ON "sectors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "cpf_analyses_organization_id_idx" ON "cpf_analyses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cpf_analyses_employee_id_idx" ON "cpf_analyses" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "cpf_analyses_status_idx" ON "cpf_analyses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cpf_analyses_analysis_date_idx" ON "cpf_analyses" USING btree ("analysis_date");--> statement-breakpoint
CREATE INDEX "organization_profiles_organization_id_idx" ON "organization_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_profiles_tax_id_idx" ON "organization_profiles" USING btree ("tax_id");--> statement-breakpoint
CREATE INDEX "organization_profiles_status_idx" ON "organization_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "organization_profiles_industry_idx" ON "organization_profiles" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikeys_userId_idx" ON "apikeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_organizationId_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "members_organizationId_idx" ON "members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "members_userId_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_referenceId_idx" ON "subscriptions" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "twoFactors_secret_idx" ON "two_factors" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactors_userId_idx" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "absences_organization_id_idx" ON "absences" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "absences_employee_id_idx" ON "absences" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ppe_job_positions_organization_id_idx" ON "ppe_job_positions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ppe_job_positions_ppe_item_id_idx" ON "ppe_job_positions" USING btree ("ppe_item_id");--> statement-breakpoint
CREATE INDEX "ppe_job_positions_job_position_id_idx" ON "ppe_job_positions" USING btree ("job_position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ppe_job_positions_unique_idx" ON "ppe_job_positions" USING btree ("ppe_item_id","job_position_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "terminations_organization_id_idx" ON "terminations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "terminations_employee_id_idx" ON "terminations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "terminations_termination_date_idx" ON "terminations" USING btree ("termination_date");--> statement-breakpoint
CREATE INDEX "terminations_type_idx" ON "terminations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ppe_deliveries_organization_id_idx" ON "ppe_deliveries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ppe_deliveries_employee_id_idx" ON "ppe_deliveries" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ppe_deliveries_delivery_date_idx" ON "ppe_deliveries" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "labor_lawsuits_organization_id_idx" ON "labor_lawsuits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "labor_lawsuits_employee_id_idx" ON "labor_lawsuits" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "labor_lawsuits_process_number_idx" ON "labor_lawsuits" USING btree ("process_number");--> statement-breakpoint
CREATE INDEX "labor_lawsuits_filing_date_idx" ON "labor_lawsuits" USING btree ("filing_date");--> statement-breakpoint
CREATE INDEX "warnings_organization_id_idx" ON "warnings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "warnings_employee_id_idx" ON "warnings" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "warnings_date_idx" ON "warnings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "vacations_organization_id_idx" ON "vacations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "vacations_employee_id_idx" ON "vacations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "vacations_status_idx" ON "vacations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vacations_start_date_idx" ON "vacations" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "employees_organization_id_idx" ON "employees" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employees_cpf_idx" ON "employees" USING btree ("cpf");--> statement-breakpoint
CREATE INDEX "employees_name_idx" ON "employees" USING btree ("name");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employees_branch_id_idx" ON "employees" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "employees_sector_id_idx" ON "employees" USING btree ("sector_id");--> statement-breakpoint
CREATE INDEX "employees_job_position_id_idx" ON "employees" USING btree ("job_position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_cpf_org_unique_idx" ON "employees" USING btree ("cpf","organization_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "ppe_delivery_logs_ppe_delivery_id_idx" ON "ppe_delivery_logs" USING btree ("ppe_delivery_id");--> statement-breakpoint
CREATE INDEX "ppe_delivery_logs_ppe_item_id_idx" ON "ppe_delivery_logs" USING btree ("ppe_item_id");--> statement-breakpoint
CREATE INDEX "promotions_organization_id_idx" ON "promotions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "promotions_employee_id_idx" ON "promotions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "org_subscriptions_organization_id_idx" ON "org_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_subscriptions_status_idx" ON "org_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_subscriptions_pagarme_subscription_id_idx" ON "org_subscriptions" USING btree ("pagarme_subscription_id");--> statement-breakpoint
CREATE INDEX "org_subscriptions_plan_change_at_idx" ON "org_subscriptions" USING btree ("plan_change_at");--> statement-breakpoint
CREATE INDEX "pending_checkouts_organization_id_idx" ON "pending_checkouts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pending_checkouts_plan_id_idx" ON "pending_checkouts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "pending_checkouts_payment_link_id_idx" ON "pending_checkouts" USING btree ("payment_link_id");--> statement-breakpoint
CREATE INDEX "pending_checkouts_status_idx" ON "pending_checkouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "plan_pricing_tiers_plan_id_idx" ON "plan_pricing_tiers" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_pricing_tiers_employee_range_idx" ON "plan_pricing_tiers" USING btree ("min_employees","max_employees");--> statement-breakpoint
CREATE INDEX "subscription_events_subscription_id_idx" ON "subscription_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_events_pagarme_event_id_idx" ON "subscription_events" USING btree ("pagarme_event_id");--> statement-breakpoint
CREATE INDEX "subscription_events_event_type_idx" ON "subscription_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "job_classifications_organization_id_idx" ON "job_classifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_classifications_name_idx" ON "job_classifications" USING btree ("name");--> statement-breakpoint
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
CREATE INDEX "job_positions_organization_id_idx" ON "job_positions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "job_positions_name_idx" ON "job_positions" USING btree ("name");
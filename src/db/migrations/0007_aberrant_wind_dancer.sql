CREATE TYPE "public"."cpf_analysis_status" AS ENUM('pending', 'approved', 'rejected', 'review');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."vacation_status" AS ENUM('scheduled', 'in_progress', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."warning_type" AS ENUM('verbal', 'written', 'suspension');--> statement-breakpoint
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
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpf_analyses" ADD CONSTRAINT "cpf_analyses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpf_analyses" ADD CONSTRAINT "cpf_analyses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medical_certificates_organization_id_idx" ON "medical_certificates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "medical_certificates_employee_id_idx" ON "medical_certificates" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "cpf_analyses_organization_id_idx" ON "cpf_analyses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cpf_analyses_employee_id_idx" ON "cpf_analyses" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "cpf_analyses_status_idx" ON "cpf_analyses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cpf_analyses_analysis_date_idx" ON "cpf_analyses" USING btree ("analysis_date");--> statement-breakpoint
CREATE INDEX "absences_organization_id_idx" ON "absences" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "absences_employee_id_idx" ON "absences" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "warnings_organization_id_idx" ON "warnings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "warnings_employee_id_idx" ON "warnings" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "warnings_date_idx" ON "warnings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "vacations_organization_id_idx" ON "vacations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "vacations_employee_id_idx" ON "vacations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "vacations_status_idx" ON "vacations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vacations_start_date_idx" ON "vacations" USING btree ("start_date");
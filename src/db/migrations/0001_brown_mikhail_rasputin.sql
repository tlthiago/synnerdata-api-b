CREATE TYPE "public"."organization_status" AS ENUM('ACTIVE', 'INACTIVE', 'UNDER_REVIEW', 'PENDING');--> statement-breakpoint
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
	CONSTRAINT "organization_profiles_tax_id_unique" UNIQUE("tax_id")
);
--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_profiles_organization_id_idx" ON "organization_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_profiles_tax_id_idx" ON "organization_profiles" USING btree ("tax_id");--> statement-breakpoint
CREATE INDEX "organization_profiles_status_idx" ON "organization_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "organization_profiles_industry_idx" ON "organization_profiles" USING btree ("industry");--> statement-breakpoint
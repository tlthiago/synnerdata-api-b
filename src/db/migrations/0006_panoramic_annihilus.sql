CREATE TYPE "public"."provision_status" AS ENUM('pending_payment', 'pending_activation', 'active', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."provision_type" AS ENUM('trial', 'checkout');--> statement-breakpoint
CREATE TABLE "admin_org_provisions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"type" "provision_type" NOT NULL,
	"status" "provision_status" DEFAULT 'pending_activation' NOT NULL,
	"activation_url" text,
	"activation_sent_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"checkout_url" text,
	"checkout_expires_at" timestamp with time zone,
	"pending_checkout_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
ALTER TABLE "admin_org_provisions" ADD CONSTRAINT "admin_org_provisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_org_provisions" ADD CONSTRAINT "admin_org_provisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_org_provisions_user_id_idx" ON "admin_org_provisions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_org_provisions_organization_id_idx" ON "admin_org_provisions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "admin_org_provisions_created_by_idx" ON "admin_org_provisions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "admin_org_provisions_status_idx" ON "admin_org_provisions" USING btree ("status");
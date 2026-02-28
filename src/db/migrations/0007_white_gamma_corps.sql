ALTER TABLE "admin_org_provisions" DROP CONSTRAINT "admin_org_provisions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "admin_org_provisions" DROP CONSTRAINT "admin_org_provisions_organization_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "admin_org_provisions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_org_provisions" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_org_provisions" ADD CONSTRAINT "admin_org_provisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_org_provisions" ADD CONSTRAINT "admin_org_provisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
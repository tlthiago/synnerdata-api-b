ALTER TABLE "pagarme_plan_history" DROP CONSTRAINT "pagarme_plan_history_local_plan_id_subscription_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_pricing_tiers" DROP CONSTRAINT "plan_pricing_tiers_plan_id_subscription_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "base_plan_id" text;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pagarme_plan_history" ADD CONSTRAINT "pagarme_plan_history_local_plan_id_subscription_plans_id_fk" FOREIGN KEY ("local_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_pricing_tiers" ADD CONSTRAINT "plan_pricing_tiers_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_base_plan_id_subscription_plans_id_fk" FOREIGN KEY ("base_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_plans_organization_id_idx" ON "subscription_plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscription_plans_base_plan_id_idx" ON "subscription_plans" USING btree ("base_plan_id");--> statement-breakpoint
CREATE INDEX "subscription_plans_archived_at_idx" ON "subscription_plans" USING btree ("archived_at");
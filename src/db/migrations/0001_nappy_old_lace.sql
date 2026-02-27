CREATE TYPE "public"."adjustment_type" AS ENUM('individual', 'bulk');--> statement-breakpoint
CREATE TABLE "price_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"old_price" integer NOT NULL,
	"new_price" integer NOT NULL,
	"reason" text NOT NULL,
	"adjustment_type" "adjustment_type" NOT NULL,
	"billing_cycle" text NOT NULL,
	"pricing_tier_id" text,
	"admin_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_subscription_id_org_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."org_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_pricing_tier_id_plan_pricing_tiers_id_fk" FOREIGN KEY ("pricing_tier_id") REFERENCES "public"."plan_pricing_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_adjustments_subscription_id_idx" ON "price_adjustments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "price_adjustments_organization_id_idx" ON "price_adjustments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "price_adjustments_admin_id_idx" ON "price_adjustments" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "price_adjustments_created_at_idx" ON "price_adjustments" USING btree ("created_at");
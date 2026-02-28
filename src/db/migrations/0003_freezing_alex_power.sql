ALTER TABLE "org_subscriptions" DROP CONSTRAINT "org_subscriptions_pricing_tier_id_plan_pricing_tiers_id_fk";
--> statement-breakpoint
ALTER TABLE "org_subscriptions" DROP CONSTRAINT "org_subscriptions_pending_pricing_tier_id_plan_pricing_tiers_id_fk";
--> statement-breakpoint
ALTER TABLE "pending_checkouts" DROP CONSTRAINT "pending_checkouts_pricing_tier_id_plan_pricing_tiers_id_fk";
--> statement-breakpoint
ALTER TABLE "price_adjustments" DROP CONSTRAINT "price_adjustments_pricing_tier_id_plan_pricing_tiers_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_pricing_tiers" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_pricing_tier_id_plan_pricing_tiers_id_fk" FOREIGN KEY ("pricing_tier_id") REFERENCES "public"."plan_pricing_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_pending_pricing_tier_id_plan_pricing_tiers_id_fk" FOREIGN KEY ("pending_pricing_tier_id") REFERENCES "public"."plan_pricing_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD CONSTRAINT "pending_checkouts_pricing_tier_id_plan_pricing_tiers_id_fk" FOREIGN KEY ("pricing_tier_id") REFERENCES "public"."plan_pricing_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_pricing_tier_id_plan_pricing_tiers_id_fk" FOREIGN KEY ("pricing_tier_id") REFERENCES "public"."plan_pricing_tiers"("id") ON DELETE set null ON UPDATE no action;
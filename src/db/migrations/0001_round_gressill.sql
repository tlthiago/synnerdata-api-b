CREATE TABLE "pagarme_plan_history" (
	"id" text PRIMARY KEY NOT NULL,
	"local_plan_id" text NOT NULL,
	"local_tier_id" text NOT NULL,
	"pagarme_plan_id" text NOT NULL,
	"billing_cycle" text NOT NULL,
	"price_at_creation" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pagarme_plan_history" ADD CONSTRAINT "pagarme_plan_history_local_plan_id_subscription_plans_id_fk" FOREIGN KEY ("local_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pagarme_plan_history_is_active_idx" ON "pagarme_plan_history" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "pagarme_plan_history_pagarme_plan_id_idx" ON "pagarme_plan_history" USING btree ("pagarme_plan_id");--> statement-breakpoint
CREATE INDEX "pagarme_plan_history_local_plan_id_idx" ON "pagarme_plan_history" USING btree ("local_plan_id");
CREATE TYPE "public"."organization_status" AS ENUM('ACTIVE', 'INACTIVE', 'UNDER_REVIEW', 'PENDING');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'supervisor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."pending_checkout_status" AS ENUM('pending', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
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
CREATE TABLE "org_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"pricing_tier_id" text,
	"employee_count" integer,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"pagarme_subscription_id" text,
	"pagarme_customer_id" text,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_checkouts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"pricing_tier_id" text,
	"employee_count" integer,
	"billing_cycle" text DEFAULT 'monthly',
	"payment_link_id" text NOT NULL,
	"status" "pending_checkout_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
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
	"pagarme_plan_id_monthly" text,
	"pagarme_plan_id_yearly" text,
	"price_monthly" integer NOT NULL,
	"price_yearly" integer NOT NULL,
	"trial_days" integer DEFAULT 14 NOT NULL,
	"limits" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "audit_logs_org_date_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
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
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
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
CREATE INDEX "subscription_events_event_type_idx" ON "subscription_events" USING btree ("event_type");
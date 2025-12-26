CREATE TYPE "public"."termination_type" AS ENUM('RESIGNATION', 'DISMISSAL_WITH_CAUSE', 'DISMISSAL_WITHOUT_CAUSE', 'MUTUAL_AGREEMENT', 'CONTRACT_END');--> statement-breakpoint
CREATE TABLE "terminations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"termination_date" date NOT NULL,
	"type" "termination_type" NOT NULL,
	"reason" text,
	"notice_period_days" integer,
	"notice_period_worked" boolean DEFAULT false,
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
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_previous_job_position_id_job_positions_id_fk" FOREIGN KEY ("previous_job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_new_job_position_id_job_positions_id_fk" FOREIGN KEY ("new_job_position_id") REFERENCES "public"."job_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "terminations_organization_id_idx" ON "terminations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "terminations_employee_id_idx" ON "terminations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "terminations_termination_date_idx" ON "terminations" USING btree ("termination_date");--> statement-breakpoint
CREATE INDEX "terminations_type_idx" ON "terminations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "promotions_organization_id_idx" ON "promotions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "promotions_employee_id_idx" ON "promotions" USING btree ("employee_id");
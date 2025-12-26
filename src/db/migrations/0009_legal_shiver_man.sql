CREATE TABLE "accidents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"nature" text NOT NULL,
	"cat" text,
	"measures_taken" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accidents_organization_id_idx" ON "accidents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "accidents_employee_id_idx" ON "accidents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "accidents_date_idx" ON "accidents" USING btree ("date");
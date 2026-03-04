CREATE TABLE "features" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"category" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"plan_id" text NOT NULL,
	"feature_id" text NOT NULL,
	CONSTRAINT "plan_features_plan_id_feature_id_pk" PRIMARY KEY("plan_id","feature_id")
);
--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_features_feature_id_idx" ON "plan_features" USING btree ("feature_id");--> statement-breakpoint

-- Seed features (10 features with metadata)
INSERT INTO "features" ("id", "display_name", "description", "category", "sort_order", "is_active", "is_default", "is_premium")
VALUES
  ('terminated_employees', 'Demitidos',            NULL, NULL, 0, true, true,  false),
  ('absences',             'Faltas',               NULL, NULL, 1, true, true,  false),
  ('medical_certificates', 'Atestados',            NULL, NULL, 2, true, true,  false),
  ('accidents',            'Acidentes',             NULL, NULL, 3, true, true,  false),
  ('warnings',             'Advertências',          NULL, NULL, 4, true, true,  false),
  ('employee_status',      'Status do Trabalhador', NULL, NULL, 5, true, true,  false),
  ('birthdays',            'Aniversariantes',       NULL, NULL, 6, true, false, false),
  ('ppe',                  'EPI',                   NULL, NULL, 7, true, false, false),
  ('employee_record',      'Ficha Cadastral',       NULL, NULL, 8, true, false, true),
  ('payroll',              'Folha',                 NULL, NULL, 9, true, false, true)
ON CONFLICT ("id") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "is_default" = EXCLUDED."is_default",
  "is_premium" = EXCLUDED."is_premium",
  "sort_order" = EXCLUDED."sort_order";--> statement-breakpoint

-- Seed plan_features: Trial (all 10 features)
INSERT INTO "plan_features" ("plan_id", "feature_id")
VALUES
  ('plan-trial', 'terminated_employees'),
  ('plan-trial', 'absences'),
  ('plan-trial', 'medical_certificates'),
  ('plan-trial', 'accidents'),
  ('plan-trial', 'warnings'),
  ('plan-trial', 'employee_status'),
  ('plan-trial', 'birthdays'),
  ('plan-trial', 'ppe'),
  ('plan-trial', 'employee_record'),
  ('plan-trial', 'payroll')
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;--> statement-breakpoint

-- Seed plan_features: Gold (6 default features)
INSERT INTO "plan_features" ("plan_id", "feature_id")
VALUES
  ('plan-gold', 'terminated_employees'),
  ('plan-gold', 'absences'),
  ('plan-gold', 'medical_certificates'),
  ('plan-gold', 'accidents'),
  ('plan-gold', 'warnings'),
  ('plan-gold', 'employee_status')
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;--> statement-breakpoint

-- Seed plan_features: Diamond (Gold + birthdays, ppe, employee_record)
INSERT INTO "plan_features" ("plan_id", "feature_id")
VALUES
  ('plan-diamond', 'terminated_employees'),
  ('plan-diamond', 'absences'),
  ('plan-diamond', 'medical_certificates'),
  ('plan-diamond', 'accidents'),
  ('plan-diamond', 'warnings'),
  ('plan-diamond', 'employee_status'),
  ('plan-diamond', 'birthdays'),
  ('plan-diamond', 'ppe'),
  ('plan-diamond', 'employee_record')
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;--> statement-breakpoint

-- Seed plan_features: Platinum (Diamond + payroll)
INSERT INTO "plan_features" ("plan_id", "feature_id")
VALUES
  ('plan-platinum', 'terminated_employees'),
  ('plan-platinum', 'absences'),
  ('plan-platinum', 'medical_certificates'),
  ('plan-platinum', 'accidents'),
  ('plan-platinum', 'warnings'),
  ('plan-platinum', 'employee_status'),
  ('plan-platinum', 'birthdays'),
  ('plan-platinum', 'ppe'),
  ('plan-platinum', 'employee_record'),
  ('plan-platinum', 'payroll')
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;
-- Seed subscription plans and pricing tiers (idempotent)
-- Source of truth: src/modules/payments/plans/plans.constants.ts
-- Note: features are seeded in plan_features (see migration from #133)
-- Note: limits are seeded in plan_limits (see migration from #134)

-- Trial plan (14 days, not public)
INSERT INTO "subscription_plans" ("id", "name", "display_name", "description", "trial_days", "is_active", "is_public", "is_trial", "sort_order")
VALUES (
  'plan-trial',
  'trial',
  'Trial',
  'Período de avaliação gratuito com acesso completo',
  14,
  true,
  false,
  true,
  -1
)
ON CONFLICT ("id") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "description" = EXCLUDED."description",
  "trial_days" = EXCLUDED."trial_days",
  "is_active" = EXCLUDED."is_active",
  "is_public" = EXCLUDED."is_public",
  "is_trial" = EXCLUDED."is_trial",
  "sort_order" = EXCLUDED."sort_order";
--> statement-breakpoint

-- Gold plan (Ouro Insights)
INSERT INTO "subscription_plans" ("id", "name", "display_name", "description", "trial_days", "is_active", "is_public", "is_trial", "sort_order")
VALUES (
  'plan-gold',
  'gold',
  'Ouro Insights',
  'Essencial para contratações eficazes',
  0,
  true,
  true,
  false,
  0
)
ON CONFLICT ("id") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "description" = EXCLUDED."description",
  "trial_days" = EXCLUDED."trial_days",
  "is_active" = EXCLUDED."is_active",
  "is_public" = EXCLUDED."is_public",
  "is_trial" = EXCLUDED."is_trial",
  "sort_order" = EXCLUDED."sort_order";
--> statement-breakpoint

-- Diamond plan (Diamante Analytics)
INSERT INTO "subscription_plans" ("id", "name", "display_name", "description", "trial_days", "is_active", "is_public", "is_trial", "sort_order")
VALUES (
  'plan-diamond',
  'diamond',
  'Diamante Analytics',
  'Todos os recursos premium',
  0,
  true,
  true,
  false,
  1
)
ON CONFLICT ("id") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "description" = EXCLUDED."description",
  "trial_days" = EXCLUDED."trial_days",
  "is_active" = EXCLUDED."is_active",
  "is_public" = EXCLUDED."is_public",
  "is_trial" = EXCLUDED."is_trial",
  "sort_order" = EXCLUDED."sort_order";
--> statement-breakpoint

-- Platinum plan (Platina Vision)
INSERT INTO "subscription_plans" ("id", "name", "display_name", "description", "trial_days", "is_active", "is_public", "is_trial", "sort_order")
VALUES (
  'plan-platinum',
  'platinum',
  'Platina Vision',
  'Recursos avançados de analytics',
  0,
  true,
  true,
  false,
  2
)
ON CONFLICT ("id") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "description" = EXCLUDED."description",
  "trial_days" = EXCLUDED."trial_days",
  "is_active" = EXCLUDED."is_active",
  "is_public" = EXCLUDED."is_public",
  "is_trial" = EXCLUDED."is_trial",
  "sort_order" = EXCLUDED."sort_order";
--> statement-breakpoint

-- Trial plan pricing tier (0-10 employees, free)
INSERT INTO "plan_pricing_tiers" ("id", "plan_id", "min_employees", "max_employees", "price_monthly", "price_yearly")
VALUES ('tier-trial-0-10', 'plan-trial', 0, 10, 0, 0)
ON CONFLICT ("id") DO UPDATE SET
  "price_monthly" = EXCLUDED."price_monthly",
  "price_yearly" = EXCLUDED."price_yearly";
--> statement-breakpoint

-- Gold pricing tiers (10 tiers)
-- Yearly = monthlyPrice * 12 - round(monthlyPrice * 12 * 0.2)
INSERT INTO "plan_pricing_tiers" ("id", "plan_id", "min_employees", "max_employees", "price_monthly", "price_yearly")
VALUES
  ('tier-gold-0-10',    'plan-gold', 0,  10,  39900,  383040),
  ('tier-gold-11-20',   'plan-gold', 11, 20,  44990,  431904),
  ('tier-gold-21-30',   'plan-gold', 21, 30,  49990,  479904),
  ('tier-gold-31-40',   'plan-gold', 31, 40,  55990,  537504),
  ('tier-gold-41-50',   'plan-gold', 41, 50,  61990,  595104),
  ('tier-gold-51-60',   'plan-gold', 51, 60,  69990,  671904),
  ('tier-gold-61-70',   'plan-gold', 61, 70,  77990,  748704),
  ('tier-gold-71-80',   'plan-gold', 71, 80,  86990,  835104),
  ('tier-gold-81-90',   'plan-gold', 81, 90,  96990,  931104),
  ('tier-gold-91-180',  'plan-gold', 91, 180, 107990, 1036704)
ON CONFLICT ("id") DO UPDATE SET
  "price_monthly" = EXCLUDED."price_monthly",
  "price_yearly" = EXCLUDED."price_yearly";
--> statement-breakpoint

-- Diamond pricing tiers (10 tiers)
INSERT INTO "plan_pricing_tiers" ("id", "plan_id", "min_employees", "max_employees", "price_monthly", "price_yearly")
VALUES
  ('tier-diamond-0-10',    'plan-diamond', 0,  10,  49900,  479040),
  ('tier-diamond-11-20',   'plan-diamond', 11, 20,  55990,  537504),
  ('tier-diamond-21-30',   'plan-diamond', 21, 30,  61990,  595104),
  ('tier-diamond-31-40',   'plan-diamond', 31, 40,  68990,  662304),
  ('tier-diamond-41-50',   'plan-diamond', 41, 50,  76090,  730464),
  ('tier-diamond-51-60',   'plan-diamond', 51, 60,  84990,  815904),
  ('tier-diamond-61-70',   'plan-diamond', 61, 70,  94090,  903264),
  ('tier-diamond-71-80',   'plan-diamond', 71, 80,  104990, 1007904),
  ('tier-diamond-81-90',   'plan-diamond', 81, 90,  115990, 1113504),
  ('tier-diamond-91-180',  'plan-diamond', 91, 180, 128890, 1237344)
ON CONFLICT ("id") DO UPDATE SET
  "price_monthly" = EXCLUDED."price_monthly",
  "price_yearly" = EXCLUDED."price_yearly";
--> statement-breakpoint

-- Platinum pricing tiers (10 tiers)
INSERT INTO "plan_pricing_tiers" ("id", "plan_id", "min_employees", "max_employees", "price_monthly", "price_yearly")
VALUES
  ('tier-platinum-0-10',    'plan-platinum', 0,  10,  59900,  575040),
  ('tier-platinum-11-20',   'plan-platinum', 11, 20,  66990,  643104),
  ('tier-platinum-21-30',   'plan-platinum', 21, 30,  73990,  710304),
  ('tier-platinum-31-40',   'plan-platinum', 31, 40,  82190,  789024),
  ('tier-platinum-41-50',   'plan-platinum', 41, 50,  91290,  876384),
  ('tier-platinum-51-60',   'plan-platinum', 51, 60,  101590, 975264),
  ('tier-platinum-61-70',   'plan-platinum', 61, 70,  112990, 1084704),
  ('tier-platinum-71-80',   'plan-platinum', 71, 80,  125290, 1202784),
  ('tier-platinum-81-90',   'plan-platinum', 81, 90,  139990, 1343904),
  ('tier-platinum-91-180',  'plan-platinum', 91, 180, 154990, 1487904)
ON CONFLICT ("id") DO UPDATE SET
  "price_monthly" = EXCLUDED."price_monthly",
  "price_yearly" = EXCLUDED."price_yearly";

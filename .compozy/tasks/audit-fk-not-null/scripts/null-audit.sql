-- Pre-deploy NULL audit for createdBy/updatedBy across the 26 in-scope tables.
-- Source of truth: schema convention requires NOT NULL on every audit reference.
-- Migration 0042_audit_fk_not_null.sql will fail at ALTER COLUMN SET NOT NULL
-- if ANY row has created_by IS NULL or (for tables with updatedBy) updated_by IS NULL.
--
-- Expected output: every row has created_by_nulls = 0 AND updated_by_nulls = 0
-- (NULL for the 4 tables without updatedBy: ppe_delivery_logs, ppe_delivery_items,
-- ppe_job_positions, project_employees).
-- Any non-zero count blocks the merge until backfilled manually.
--
-- Re-run this script verbatim pre-deploy. Read-only — wrapped in BEGIN/ROLLBACK.
-- Usage: psql "$DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/null-audit.sql

BEGIN;

\echo ''
\echo '=== Per-table NULL counts on createdBy/updatedBy ==='
WITH per_table AS (
  SELECT 'absences'::text AS table_name,
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint AS created_by_nulls,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint AS updated_by_nulls
  FROM absences
  UNION ALL SELECT 'accidents',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM accidents
  UNION ALL SELECT 'admin_org_provisions',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM admin_org_provisions
  UNION ALL SELECT 'billing_profiles',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM billing_profiles
  UNION ALL SELECT 'branches',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM branches
  UNION ALL SELECT 'cost_centers',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM cost_centers
  UNION ALL SELECT 'cpf_analyses',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM cpf_analyses
  UNION ALL SELECT 'employees',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM employees
  UNION ALL SELECT 'features',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM features
  UNION ALL SELECT 'job_classifications',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM job_classifications
  UNION ALL SELECT 'job_positions',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM job_positions
  UNION ALL SELECT 'labor_lawsuits',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM labor_lawsuits
  UNION ALL SELECT 'medical_certificates',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM medical_certificates
  UNION ALL SELECT 'organization_profiles',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM organization_profiles
  UNION ALL SELECT 'ppe_deliveries',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM ppe_deliveries
  UNION ALL SELECT 'ppe_items',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM ppe_items
  UNION ALL SELECT 'projects',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM projects
  UNION ALL SELECT 'promotions',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM promotions
  UNION ALL SELECT 'sectors',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM sectors
  UNION ALL SELECT 'terminations',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM terminations
  UNION ALL SELECT 'vacations',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM vacations
  UNION ALL SELECT 'warnings',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM warnings
  -- Tables WITHOUT updated_by: emit NULL::bigint for that column
  UNION ALL SELECT 'ppe_delivery_logs',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         NULL::bigint
  FROM ppe_delivery_logs
  UNION ALL SELECT 'ppe_delivery_items',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         NULL::bigint
  FROM ppe_delivery_items
  UNION ALL SELECT 'ppe_job_positions',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         NULL::bigint
  FROM ppe_job_positions
  UNION ALL SELECT 'project_employees',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         NULL::bigint
  FROM project_employees
)
SELECT table_name, created_by_nulls, updated_by_nulls
FROM per_table
ORDER BY table_name;

\echo ''
\echo '=== Totals (deploy gate: both must be zero) ==='
WITH per_table AS (
  SELECT 'absences'::text AS table_name,
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint AS created_by_nulls,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint AS updated_by_nulls
  FROM absences
  UNION ALL SELECT 'accidents',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM accidents
  UNION ALL SELECT 'admin_org_provisions',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM admin_org_provisions
  UNION ALL SELECT 'billing_profiles',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM billing_profiles
  UNION ALL SELECT 'branches',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM branches
  UNION ALL SELECT 'cost_centers',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM cost_centers
  UNION ALL SELECT 'cpf_analyses',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM cpf_analyses
  UNION ALL SELECT 'employees',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM employees
  UNION ALL SELECT 'features',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM features
  UNION ALL SELECT 'job_classifications',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM job_classifications
  UNION ALL SELECT 'job_positions',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM job_positions
  UNION ALL SELECT 'labor_lawsuits',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM labor_lawsuits
  UNION ALL SELECT 'medical_certificates',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM medical_certificates
  UNION ALL SELECT 'organization_profiles',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM organization_profiles
  UNION ALL SELECT 'ppe_deliveries',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM ppe_deliveries
  UNION ALL SELECT 'ppe_items',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM ppe_items
  UNION ALL SELECT 'projects',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM projects
  UNION ALL SELECT 'promotions',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM promotions
  UNION ALL SELECT 'sectors',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM sectors
  UNION ALL SELECT 'terminations',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM terminations
  UNION ALL SELECT 'vacations',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM vacations
  UNION ALL SELECT 'warnings',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         COUNT(*) FILTER (WHERE updated_by IS NULL)::bigint
  FROM warnings
  UNION ALL SELECT 'ppe_delivery_logs',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         NULL::bigint
  FROM ppe_delivery_logs
  UNION ALL SELECT 'ppe_delivery_items',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         NULL::bigint
  FROM ppe_delivery_items
  UNION ALL SELECT 'ppe_job_positions',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         NULL::bigint
  FROM ppe_job_positions
  UNION ALL SELECT 'project_employees',
         COUNT(*) FILTER (WHERE created_by IS NULL)::bigint,
         NULL::bigint
  FROM project_employees
)
SELECT
  SUM(created_by_nulls)::bigint AS total_created_by_nulls,
  SUM(COALESCE(updated_by_nulls, 0))::bigint AS total_updated_by_nulls
FROM per_table;

ROLLBACK;

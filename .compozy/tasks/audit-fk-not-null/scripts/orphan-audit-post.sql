-- Orphan audit for user-attribution columns across the 26 FK-covered tables.
-- Schema state assumed: POST-migration 0042 — `deleted_by` was DROPPED on 24 tables.
-- Use this script for the G3 POST-deploy verification of PRD #3 (migration 0042).
--
-- Source of truth: schema files under src/db/schema/ (26 createdBy + 22 updatedBy
-- = 48 populated columns visible to this audit; deleted_by no longer exists).
--
-- Expected output: total_orphans = 0 and the orphan-detail result set is empty.
-- A non-zero orphan count after migration 0042 is a critical incident — VALIDATE
-- CONSTRAINT should have caught any orphan during deploy. Investigate immediately.
--
-- Re-run this script verbatim post-deploy of PRD #3 PR (G3 gate). The matching
-- pre-deploy script is orphan-audit-pre.sql which still includes deleted_by lines.
-- Usage: psql "$DATABASE_URL" -f .compozy/tasks/audit-fk-not-null/scripts/orphan-audit-post.sql
--
-- The script is wrapped in a transaction that rolls back — it never mutates data.
-- `\echo` lines are psql meta-commands; remove them when running through another client.
--
-- Summary note: the per-column result set omits (table, column) pairs that have zero
-- populated references, because the WHERE filter excludes NULL rows from the CTE.
-- The totals row is authoritative for coverage: total_refs must be ≥ the last baseline
-- (930 on 2026-04-21). total_orphans is the deploy-gate signal.

BEGIN;

CREATE TEMP VIEW audit_refs AS
  SELECT 'absences'::text AS table_name, 'created_by'::text AS column_name, created_by AS user_id FROM absences WHERE created_by IS NOT NULL
  UNION ALL SELECT 'absences', 'updated_by', updated_by FROM absences WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'accidents', 'created_by', created_by FROM accidents WHERE created_by IS NOT NULL
  UNION ALL SELECT 'accidents', 'updated_by', updated_by FROM accidents WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'admin_org_provisions', 'created_by', created_by FROM admin_org_provisions WHERE created_by IS NOT NULL
  UNION ALL SELECT 'admin_org_provisions', 'updated_by', updated_by FROM admin_org_provisions WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'billing_profiles', 'created_by', created_by FROM billing_profiles WHERE created_by IS NOT NULL
  UNION ALL SELECT 'billing_profiles', 'updated_by', updated_by FROM billing_profiles WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'branches', 'created_by', created_by FROM branches WHERE created_by IS NOT NULL
  UNION ALL SELECT 'branches', 'updated_by', updated_by FROM branches WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'cost_centers', 'created_by', created_by FROM cost_centers WHERE created_by IS NOT NULL
  UNION ALL SELECT 'cost_centers', 'updated_by', updated_by FROM cost_centers WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'cpf_analyses', 'created_by', created_by FROM cpf_analyses WHERE created_by IS NOT NULL
  UNION ALL SELECT 'cpf_analyses', 'updated_by', updated_by FROM cpf_analyses WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'employees', 'created_by', created_by FROM employees WHERE created_by IS NOT NULL
  UNION ALL SELECT 'employees', 'updated_by', updated_by FROM employees WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'features', 'created_by', created_by FROM features WHERE created_by IS NOT NULL
  UNION ALL SELECT 'features', 'updated_by', updated_by FROM features WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'job_classifications', 'created_by', created_by FROM job_classifications WHERE created_by IS NOT NULL
  UNION ALL SELECT 'job_classifications', 'updated_by', updated_by FROM job_classifications WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'job_positions', 'created_by', created_by FROM job_positions WHERE created_by IS NOT NULL
  UNION ALL SELECT 'job_positions', 'updated_by', updated_by FROM job_positions WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'labor_lawsuits', 'created_by', created_by FROM labor_lawsuits WHERE created_by IS NOT NULL
  UNION ALL SELECT 'labor_lawsuits', 'updated_by', updated_by FROM labor_lawsuits WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'medical_certificates', 'created_by', created_by FROM medical_certificates WHERE created_by IS NOT NULL
  UNION ALL SELECT 'medical_certificates', 'updated_by', updated_by FROM medical_certificates WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'organization_profiles', 'created_by', created_by FROM organization_profiles WHERE created_by IS NOT NULL
  UNION ALL SELECT 'organization_profiles', 'updated_by', updated_by FROM organization_profiles WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'ppe_deliveries', 'created_by', created_by FROM ppe_deliveries WHERE created_by IS NOT NULL
  UNION ALL SELECT 'ppe_deliveries', 'updated_by', updated_by FROM ppe_deliveries WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'ppe_delivery_items', 'created_by', created_by FROM ppe_delivery_items WHERE created_by IS NOT NULL
  UNION ALL SELECT 'ppe_delivery_logs', 'created_by', created_by FROM ppe_delivery_logs WHERE created_by IS NOT NULL
  UNION ALL SELECT 'ppe_items', 'created_by', created_by FROM ppe_items WHERE created_by IS NOT NULL
  UNION ALL SELECT 'ppe_items', 'updated_by', updated_by FROM ppe_items WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'ppe_job_positions', 'created_by', created_by FROM ppe_job_positions WHERE created_by IS NOT NULL
  UNION ALL SELECT 'project_employees', 'created_by', created_by FROM project_employees WHERE created_by IS NOT NULL
  UNION ALL SELECT 'projects', 'created_by', created_by FROM projects WHERE created_by IS NOT NULL
  UNION ALL SELECT 'projects', 'updated_by', updated_by FROM projects WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'promotions', 'created_by', created_by FROM promotions WHERE created_by IS NOT NULL
  UNION ALL SELECT 'promotions', 'updated_by', updated_by FROM promotions WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'sectors', 'created_by', created_by FROM sectors WHERE created_by IS NOT NULL
  UNION ALL SELECT 'sectors', 'updated_by', updated_by FROM sectors WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'terminations', 'created_by', created_by FROM terminations WHERE created_by IS NOT NULL
  UNION ALL SELECT 'terminations', 'updated_by', updated_by FROM terminations WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'vacations', 'created_by', created_by FROM vacations WHERE created_by IS NOT NULL
  UNION ALL SELECT 'vacations', 'updated_by', updated_by FROM vacations WHERE updated_by IS NOT NULL
  UNION ALL SELECT 'warnings', 'created_by', created_by FROM warnings WHERE created_by IS NOT NULL
  UNION ALL SELECT 'warnings', 'updated_by', updated_by FROM warnings WHERE updated_by IS NOT NULL;

\echo ''
\echo '=== Per-column summary (ordered by orphan_count DESC, then table, column) ==='
SELECT
  a.table_name,
  a.column_name,
  COUNT(*)::bigint AS total_refs,
  COUNT(*) FILTER (WHERE u.id IS NULL)::bigint AS orphan_count
FROM audit_refs a
LEFT JOIN users u ON u.id = a.user_id
GROUP BY a.table_name, a.column_name
ORDER BY orphan_count DESC, a.table_name, a.column_name;

\echo ''
\echo '=== Orphan detail (MUST be zero rows; any row blocks the deploy) ==='
SELECT
  a.table_name,
  a.column_name,
  a.user_id AS orphan_user_id
FROM audit_refs a
LEFT JOIN users u ON u.id = a.user_id
WHERE u.id IS NULL
ORDER BY a.table_name, a.column_name;

\echo ''
\echo '=== Totals (post-deploy: total_orphans=0; total_refs lower than pre-deploy baseline because deleted_by share excluded) ==='
SELECT
  COUNT(*)::bigint AS total_refs,
  COUNT(*) FILTER (WHERE u.id IS NULL)::bigint AS total_orphans
FROM audit_refs a
LEFT JOIN users u ON u.id = a.user_id;

ROLLBACK;

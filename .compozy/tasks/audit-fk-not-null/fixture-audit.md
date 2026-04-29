# Pre-flight test fixture audit (PRD #3)

- Date: 2026-04-29
- Branch: feat/audit-fk-not-null (parent commit f991368)
- Auditor: PRD #3 Task 3 execution

---

## Step 1 — Direct audit-column writes in fixtures

### `src/test/helpers/` and `src/db/seeds/`

| File:line | Match | Classification | Notes |
|---|---|---|---|
| `src/test/helpers/api-key.ts:37` | `createdBy: options.userId` | (a) Real user | Inside Better Auth `metadata` payload, not a domain audit column. Caller passes `options.userId` which resolves to a real `users.id`. |

### `src/modules/**/__tests__/`

| File:line | Match | Classification | Notes |
|---|---|---|---|
| `src/modules/audit/__tests__/pii-redaction.test.ts:146,152` | `updatedBy: "user-1"`, `updatedBy: "user-2"` | (a) Test data | Inputs to the redaction logic, not DB writes. |
| `src/modules/occurrences/terminations/__tests__/create-termination.test.ts:415` | `.set({ deletedAt: new Date(), deletedBy: user.id })` | (a) Real user | `user` from fixture; will be removed in Task 18 alongside `deletedBy` column drop. |
| `src/modules/employees/import/__tests__/import.service.test.ts:359` | `createdBy: userId` | (a/b) Passthrough | `userId = result.user.id` from `createTestUserWithOrganization`. |
| `src/modules/occurrences/vacations/__tests__/update-vacation.test.ts:876` | `createdBy: user.id` | (a) Real user | |
| `src/modules/occurrences/vacations/__tests__/next-cycle.test.ts:219` | `createdBy: user.id` | (a) Real user | |
| `src/modules/occurrences/vacations/__tests__/create-vacation.test.ts:735` | `createdBy: user.id` | (a) Real user | |
| `src/modules/payments/features/__tests__/update-feature.test.ts:127` | `.select({ updatedBy: schema.features.updatedBy })` | (n/a) SELECT projection | Reading, not writing. |
| `src/modules/payments/features/__tests__/create-feature.test.ts:116` | `.select({ createdBy: schema.features.createdBy })` | (n/a) SELECT projection | Reading, not writing. |

### Summary
- Category (a) Real user: 8 matches
- Category (b) Helper passthrough: 1 match (subset of a)
- Category (c) Placeholder/wrong-shape direct fixture writes: **0**

---

## Step 2 — Pre-deploy audit scripts on clean test DB

```
$ bun run db:test:reset && bun --env-file .env.test src/test/preload.ts
$ docker exec -i synnerdata-api-b psql -U postgres -d synnerdata-api-b-test < null-audit.sql
$ docker exec -i synnerdata-api-b psql -U postgres -d synnerdata-api-b-test < orphan-audit-pre.sql
```

### Findings on clean DB (no test data, only migrations applied)

- `null-audit.sql`: total_created_by_nulls = **10**, total_updated_by_nulls = **10** — all from
  `features` (10 rows seeded by migration 0012 with NULL audit columns).
- `orphan-audit-pre.sql`: total_refs = 0, total_orphans = 0 ✓

### `features` seed leak — pre-existing production issue

The `features` table is seeded by `src/db/migrations/0012_simple_giant_girl.sql` via:

```sql
INSERT INTO "features" ("id", "display_name", ...)
VALUES ('terminated_employees', 'Demitidos', ...), ...
```

The INSERT does not include `created_by` / `updated_by`, leaving both NULL. This is a real
production-affecting issue (the same 10 rows exist in prod). Migration 0042's
`ALTER COLUMN features.created_by SET NOT NULL` and `ALTER COLUMN features.updated_by SET NOT NULL`
will fail at runtime against these 10 rows.

**Fix:** Task 29 hand-tune adds a `features`-specific backfill UPDATE before the SET NOT NULL
phase, selecting the oldest user as the seed creator.

---

## Step 3 — Representative test batch + re-audit

```
$ NODE_ENV=test bun test --env-file .env.test \
    src/modules/organizations/cost-centers/__tests__/ \
    src/modules/occurrences/absences/__tests__/ \
    src/modules/occurrences/cpf-analyses/__tests__/ \
    src/modules/payments/plans/__tests__/
```

Result: 255 pass / 0 fail / 30 files.

### Findings — first run (BEFORE fixture fix)

`null-audit.sql` after the test batch reported:
- total_created_by_nulls = **126** (10 features + 116 from organization_profiles)
- total_updated_by_nulls = **385** (10 features + 116 organization_profiles + others)

`orphan-audit-pre.sql`: total_orphans = 0 ✓

#### Category (c) leak — `organization_profiles` (116 rows, both columns NULL)

Source: `src/test/helpers/organization.ts:49-59` and `src/test/factories/organization.factory.ts:68-78`.
Both helpers insert `organizationProfiles` rows without `createdBy` / `updatedBy`. The plan
classifies this as a category-(c) FK violation pending — must be fixed before Task 28.

**Fix applied:**
- Created `src/test/helpers/system-user.ts` with `getOrCreateSystemTestUser()` lazy-creating a
  shared system test user (`id = "system-test-user"`).
- Added optional `creatorUserId?: string` to both helpers' option types. If provided, used
  directly; otherwise falls back to the system test user.
- Wired `createTestUserWithOrganization` (helper) and `UserFactory.createWithOrganization`
  (factory) to pass `userResult.user.id` as `creatorUserId`, ensuring real-user attribution
  whenever a user is being created alongside the org.

#### After-fix result

`null-audit.sql` after the same test batch on a fresh DB:

| Source | created_by_nulls | updated_by_nulls |
|---|---|---|
| `features` (seed) | 10 | 10 |
| `organization_profiles` | 0 ✓ | 0 ✓ |
| Other domain tables — `created_by` | 0 across the board ✓ | varies |
| `updated_by` (absences/cost_centers/cpf_analyses/employees/...) | — | 269 — pre-Semantic-A inserts that left `updated_by` NULL |

`orphan-audit-pre.sql`: total_orphans = 0 ✓

### `updated_by IS NULL` (269 rows)

Distributed across `absences`, `cost_centers`, `cpf_analyses`, `employees`,
`job_classifications`, `job_positions`, `sectors`. These are produced by service `create` paths
that set `createdBy: userId` only and leave `updatedBy` undefined (= NULL). This is the
pre-Semantic-A behavior. Migration 0042's Step 1 backfill —
`UPDATE <table> SET updated_by = created_by WHERE updated_by IS NULL` — handles this cleanly,
**no fixture/service fix required for this PRD**. (Adopting Semantic A in services is out of
scope here; that lives in PRD #4/5+.)

---

## Plan deviations recorded

1. **Cherry-pick source commit corrected:** plan said `acc6939`; actual source is `7d1cadb` (the
   commit that added the orphan-audit and deploy-gate files). Documented in commit `176e54e`.
2. **Test fixture fix added:** the `organization_profiles` leak required code changes that the
   plan did not anticipate. Two new files (`src/test/helpers/system-user.ts` and the
   `creatorUserId` parameter in two helpers) plus three call-site updates. This is committed
   ahead of the per-module refactor wave (Tasks 4-25).
3. **Migration 0042 will need a `features`-specific backfill** beyond the 22 generic
   `updated_by = created_by` UPDATEs. Task 29 will add it.

---

## Conclusion

- Zero category-(c) fixture leaks remain after the fix.
- Zero orphans on populated audit columns.
- Two pre-existing NULL sources are cleanly resolvable in migration 0042 (features by
  hand-tuned UPDATE, generic updated_by by the planned backfill).
- Cleared to proceed to Tasks 4-25.

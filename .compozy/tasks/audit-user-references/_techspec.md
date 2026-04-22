# TechSpec — User Attribution on Domain Resources

## Executive Summary

This spec implements the PRD goals by (1) adding foreign-key references and Drizzle `relations()` on all audit columns of the 26 domain tables, (2) adopting the Drizzle Relational API for any read that populates nested user attribution, and (3) using a single production migration that applies the FKs via the `NOT VALID + VALIDATE CONSTRAINT` pattern.

Primary trade-off: the write path in every affected service grows from one query (INSERT/UPDATE `.returning()`) to two queries (mutation + relational re-read). The re-read is a PK lookup with two indexed JOINs, expected to add single-digit milliseconds per request — accepted in exchange for a consistent `{ createdBy, updatedBy, deletedBy }` object shape across every response, eliminating dual-shape typing on the frontend and refetch round-trips after writes.

## System Architecture

### Component Overview

**New components (Phase 1):**

- **Shared Zod helper** — `auditUserSchema` exported from `src/lib/responses/response.types.ts`. Defines the canonical `{ id, name } | null` shape (already nullable) reused by every module's response schema.
- **Migration file** — `src/db/migrations/0038_audit_fk_references.sql`. Single authoritative SQL artifact applying FKs via `NOT VALID + VALIDATE CONSTRAINT` across all audit columns.

**Modified components (Phase 1):**

- **26 schema files in `src/db/schema/`** — each adds `.references(() => users.id, { onDelete: "set null" })` on `created_by` / `updated_by` / `deleted_by` columns and extends its `relations()` block with `createdByUser` / `updatedByUser` / `deletedByUser` one-to-one relations to `users`.
- **Test fixtures across all `__tests__/`** — any direct `db.insert/update` that writes to audit columns with fake user IDs is updated to use real users created via existing test helpers.
- **`.claude/CLAUDE.md`** — a new bullet documents the user-attribution pattern under "Architectural Decisions".

**Modified components (Phase 2 — cost-centers pilot):**

- `src/modules/organizations/cost-centers/cost-center.service.ts` — reads use `db.query.costCenters.findFirst/findMany({ with })`; writes follow the mutation-then-reread pattern.
- `src/modules/organizations/cost-centers/cost-center.model.ts` — response schema extends with `createdBy`, `updatedBy`, `deletedBy` fields of type `auditUserSchema`.
- `src/modules/organizations/cost-centers/__tests__/*.test.ts` — 5 existing tests extended with populated + null attribution cases.
- `src/modules/organizations/cost-centers/CLAUDE.md` — documents the new canonical pattern.

**Unchanged:**

- `src/db/index.ts` — already uses `fullSchema`; Relational API is available without config change.
- Response envelope (`wrapSuccess`) and error-handling infrastructure.
- Better Auth and `users` table.
- `audit_logs` table and its separate feature surface.

### Data Flow

Read flow (new):

```
HTTP GET → Controller (Elysia) → Service.findByIdWithAudit
  → db.query.<table>.findFirst({ where, with: { createdByUser, updatedByUser, deletedByUser } })
  → result with nested { id, name } objects → Zod response validation → wrapSuccess → client
```

Write flow (new):

```
HTTP POST/PUT/DELETE → Controller → Service.create/update/delete
  → Transaction:
    1. db.insert/update(...).returning({ id })
    2. db.query.<table>.findFirst({ where: eq(id, newId), with: {...} })
  → wrapSuccess → client
```

## Implementation Design

### Core Interfaces

**Shared Zod helper** (`src/lib/responses/response.types.ts`):

```ts
export const auditUserSchema = z
  .object({
    id: z.string().describe("User ID"),
    name: z.string().describe("User display name"),
  })
  .nullable()
  .describe("User who performed the action (null when system-originated or user removed)");

export type AuditUser = z.infer<typeof auditUserSchema>;
```

**Canonical schema file shape** (example: `src/db/schema/cost-centers.ts`):

```ts
export const costCenters = pgTable("cost_centers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp(...).defaultNow().notNull(),
  updatedAt: timestamp(...).$onUpdate(() => new Date()).notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  deletedAt: timestamp(...),
  deletedBy: text("deleted_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => [...]);

export const costCenterRelations = relations(costCenters, ({ one }) => ({
  organization: one(organizations, { fields: [costCenters.organizationId], references: [organizations.id] }),
  createdByUser: one(users, { fields: [costCenters.createdBy], references: [users.id], relationName: "costCenterCreator" }),
  updatedByUser: one(users, { fields: [costCenters.updatedBy], references: [users.id], relationName: "costCenterUpdater" }),
  deletedByUser: one(users, { fields: [costCenters.deletedBy], references: [users.id], relationName: "costCenterDeleter" }),
}));
```

**Relation naming convention**: relations to `users` use the `*User` suffix (`createdByUser`, `updatedByUser`, `deletedByUser`) to avoid key collision with the underlying `text` columns `createdBy`, `updatedBy`, `deletedBy` that remain on the table. Drizzle's `db.query` result includes both the columns and the expanded relations in the same object; the suffix disambiguates. Services map from the relation keys to the payload keys before returning (see below).

**Canonical service read method**:

```ts
static async findByIdWithAudit(
  id: string,
  organizationId: string
): Promise<CostCenterData | null> {
  const raw = await db.query.costCenters.findFirst({
    where: (t, { eq, and, isNull }) =>
      and(eq(t.id, id), eq(t.organizationId, organizationId), isNull(t.deletedAt)),
    with: {
      createdByUser: { columns: { id: true, name: true } },
      updatedByUser: { columns: { id: true, name: true } },
      deletedByUser: { columns: { id: true, name: true } },
    },
  });
  return raw ? mapAuditRelations(raw) : null;
}
```

**Mapping helper** (service-local, collocated in each module's `*.service.ts` or extracted to a shared helper):

```ts
function mapAuditRelations<T extends {
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdByUser: AuditUser;
  updatedByUser: AuditUser;
  deletedByUser: AuditUser;
}>(raw: T) {
  const { createdByUser, updatedByUser, deletedByUser,
          createdBy: _cb, updatedBy: _ub, deletedBy: _db, ...rest } = raw;
  return {
    ...rest,
    createdBy: createdByUser,
    updatedBy: updatedByUser,
    deletedBy: deletedByUser,
  };
}
```

This mapping is the bridge between the DB-centric shape (text columns + relation objects, co-existing) and the API-centric shape (single `createdBy` key holding the object). Without it, Zod response validation fails because the `createdBy` text column collides with the `createdBy` object the schema expects.

**Canonical service write-then-reread** (wrapped in a transaction for atomicity: if the re-read fails, the insert rolls back):

```ts
static async create(input: CreateCostCenterInput): Promise<CostCenterData> {
  await CostCenterService.ensureNameNotExists(input.organizationId, input.name);
  const newId = `cost-center-${crypto.randomUUID()}`;

  return db.transaction(async (tx) => {
    await tx.insert(schema.costCenters).values({
      id: newId,
      organizationId: input.organizationId,
      name: input.name,
      createdBy: input.userId,
    });
    const raw = await tx.query.costCenters.findFirst({
      where: (t, { eq }) => eq(t.id, newId),
      with: {
        createdByUser: { columns: { id: true, name: true } },
        updatedByUser: { columns: { id: true, name: true } },
        deletedByUser: { columns: { id: true, name: true } },
      },
    });
    if (!raw) throw new Error("Cost center inconsistency after insert");
    return mapAuditRelations(raw);
  });
}
```

### Data Models

**Updated `costCenterDataSchema`** (pilot):

```ts
const costCenterDataSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  createdBy: auditUserSchema,
  updatedBy: auditUserSchema,
  deletedBy: auditUserSchema,
});
```

Every module's response schema follows this shape: existing resource fields + three `auditUserSchema` fields (always present, `null` when the underlying FK is null).

### API Endpoints

No new endpoints. The 5 cost-centers endpoints retain their current paths and verbs. Only the response payload shape changes (additive; no breaking change):

| Method | Path | Response change |
|---|---|---|
| POST | `/v1/cost-centers` | adds `createdBy`, `updatedBy`, `deletedBy` (null) |
| GET | `/v1/cost-centers` | adds fields per item |
| GET | `/v1/cost-centers/:id` | adds fields |
| PUT | `/v1/cost-centers/:id` | adds fields |
| DELETE | `/v1/cost-centers/:id` | adds fields (`deletedBy` populated) |

## Integration Points

None new. The `users` table managed by Better Auth is the sole external-to-domain reference. Access to user data continues to flow through the normal multi-tenant access layer; no new permission surface.

## Impact Analysis

| Component | Impact Type | Description and Risk | Required Action |
|---|---|---|---|
| 26 schema files (`src/db/schema/*.ts`) | modified | Add `.references()` and `relations()` entries. Low risk; source-of-truth for the migration. | Edit per pattern; verify drizzle-kit produces expected diff. |
| `src/db/migrations/0038_audit_fk_references.sql` | new | Manually-edited migration with `NOT VALID + VALIDATE`. Medium risk; applied to prod. | Generate, manually edit, review, test on seeded staging. |
| `src/lib/responses/response.types.ts` | modified | Add `auditUserSchema` helper. Low risk; pure addition. | One export added. |
| `src/modules/organizations/cost-centers/**` | modified (Phase 2) | Service uses `db.query` + `with`; model extends response schema; tests cover null + populated cases. Low risk; pilot scope. | Full pilot implementation. |
| Test fixtures across all `__tests__/` | modified (Phase 1) | Any direct `db.insert/update` with fake user IDs in audit columns fails once FK is active. Medium risk; requires systematic audit. | Grep, fix, run full test suite locally before merge. |
| `src/test/helpers/seed-organization.ts` (and nested `createTestBranches`, `createTestSectors`, etc.) | modified (Phase 1) | The seed helper receives `userId` and fans out to ~10 sub-helpers that insert records across most domain tables. All must resolve `userId` to a real user present in `users`. Medium risk; large blast radius. | Part of the proactive test-fixture audit (Build Order step 6). Verify every sub-helper accepts and propagates a real `userId`; run `bun run db:seed:org` against a seeded DB as smoke test. |
| `src/db/seeds/organization.ts` | unchanged | Entry script that invokes `seedOrganization` with a user resolved from the DB. No direct `db.insert`. | None, assuming the helpers above are correctly audited. |
| `.claude/CLAUDE.md` (root) | modified (Phase 1) | Document the new pattern. Low risk; documentation only. | One bullet added under "Architectural Decisions". |
| `src/db/index.ts` | unchanged | Already uses `fullSchema`. | None. |
| Other 25 domain modules | unchanged until Phase 3 | Services continue to operate unchanged; FK is enforced at DB level but nothing in those modules triggers the new attribution fields. | None in Phase 1/2. Phase 3 replicates the pilot pattern per module. |

## Testing Approach

### Unit Tests

Services in this codebase are thin over Drizzle; logic that warrants unit testing (e.g., `ensureNameNotExists`) already has coverage. No new unit tests introduced by this work; Drizzle queries are exercised by integration tests.

### Integration Tests

**Phase 1 (infra):**

- No new integration tests. The change is FK-only; behavior is unchanged. Success criterion: the entire existing test suite passes locally with FK active before PR merges.

**Phase 2 (cost-centers pilot):**

- Each of the 5 existing `__tests__/*.test.ts` files is extended with assertions on the new fields.
- New test cases:
  - GET /:id returns `createdBy: { id, name }` and `updatedBy: { id, name }` populated, `deletedBy: null` for an active record.
  - GET / list returns each item with the three fields consistently.
  - POST creates a record and returns `createdBy: { id, name }` immediately (validates write-then-reread).
  - PUT updates a record and returns `updatedBy: { id, name }` reflecting the acting session user.
  - DELETE returns the record with `deletedBy: { id, name }` populated.
  - Null case: an inserted record with `createdBy = null` (direct insert to simulate a system-originated row) returns `createdBy: null` in GET — must render without throwing.
  - Null-from-SET-NULL case: after creating a record and then hard-deleting the creating user (via `db.delete(users)`), GET on the record returns `createdBy: null` — validates that `ON DELETE SET NULL` is wired correctly end-to-end.

**Test data setup:** all tests continue to use `createTestUser()` / `createTestUserWithOrganization()` from `src/test/helpers/user.ts` to obtain real users. The only change to shared helpers is adding an explicit helper for creating records with a null `createdBy` (used only by the null-case tests).

## Development Sequencing

### Build Order

**Phase 1 (infra PR):**

1. Export `auditUserSchema` helper in `src/lib/responses/response.types.ts`. No dependencies.
2. Add `.references(() => users.id, { onDelete: "set null" })` to `created_by`, `updated_by`, `deleted_by` columns in each of the 26 schema files; extend each `relations()` block with `createdByUser` / `updatedByUser` / `deletedByUser` one-to-one relations. Depends on step 1 (for response-level consistency, though schema changes themselves do not import the helper).
3. Run `bun db:generate` to produce the raw migration file `0038_audit_fk_references.sql`. Depends on step 2.
4. Manually edit the generated migration: replace `ADD CONSTRAINT ... REFERENCES ... ON DELETE SET NULL;` with `... NOT VALID;` variants; append `ALTER TABLE ... VALIDATE CONSTRAINT ...;` statements. Depends on step 3.
5. Apply migration locally against a fresh DB (`bun db:push` or reset + `bun db:migrate`). Depends on step 4.
6. Systematic audit of `src/**/__tests__/` **and** `src/test/helpers/**` (including `seed-organization.ts` and every `createTestX` helper it fans out to) for direct `db.insert/update` writes touching `createdBy` / `updatedBy` / `deletedBy` with fake user IDs; refactor each to create real users via existing helpers. Depends on step 5.
7. Run the full local test suite (`bun run test`) and smoke-test the seed script (`bun run db:seed:org` against a seeded DB). Must pass 100%. Depends on step 6.
8. Run the production orphan audit SQL one more time against prod to confirm zero orphans since the 2026-04-21 scan. Depends on step 7.
9. Add one bullet to `.claude/CLAUDE.md` under "Architectural Decisions" documenting the user-attribution pattern. Depends on step 7.
10. Open PR 1. Merge after review. Depends on steps 1-9.
11. Post-deploy: re-run the orphan audit in production; monitor 5xx rate and p95 latency for 48 hours. Depends on step 10.

**Phase 2 (pilot PR — after Phase 1 is deployed and monitored):**

12. Extend `costCenterDataSchema` in `cost-center.model.ts` with the three `auditUserSchema` fields. Depends on step 10.
13. Refactor `CostCenterService` methods (`create`, `update`, `delete`, `findByIdOrThrow`, `findAll`) to use `db.query.costCenters.findFirst/findMany({ with })` for reads and the write-then-reread pattern for mutations. Depends on step 12.
14. Extend the 5 existing cost-centers `__tests__/*.test.ts` files with the new assertions and null cases. Depends on step 13.
15. Run affected tests: `NODE_ENV=test bun test --env-file .env.test src/modules/organizations/cost-centers/__tests__/`. Must pass 100%. Depends on step 14.
16. Update `src/modules/organizations/cost-centers/CLAUDE.md` documenting the canonical pattern. Depends on step 15.
17. Open PR 2. Merge after review. Depends on steps 12-16.

**Phase 3 (rollout PRs — one module or small group per PR):**

18+. For each module in scope: replicate steps 12-17. Ordering driven by product demand; dependencies per-PR only (each PR is independent after Phase 2 sets the template).

### Technical Dependencies

- PR 1 must ship and stabilize in production before PR 2 begins, because Phase 2 service queries depend on `db.query` returning populated user relations — which requires the FK and `relations()` to be live in the DB.
- PR 2 must merge before any Phase 3 PR begins — Phase 3 modules copy the pilot pattern.
- No third-party service dependencies; no team deliverables outside this worktree.

## Monitoring and Observability

- **Pre-deploy**: re-run the production orphan audit script (section "Execução de Testes" of CLAUDE.md) to confirm zero orphans before PR 1 deploys.
- **During deploy**: the migration runs as part of the normal deploy pipeline; Drizzle's migrator logs each `ALTER TABLE` statement.
- **Post-deploy PR 1 (48-hour window)**:
  - API 5xx rate on all modules — compare against 7-day baseline.
  - p95 latency on the 26 affected modules' endpoints — compare against 7-day baseline.
  - DB CPU utilization — compare against 7-day baseline.
  - Re-run orphan audit once after migration; expect zero orphans.
- **Post-deploy PR 2**:
  - p95 latency on the 5 cost-centers endpoints specifically — expect <5ms increase from the re-read pattern.
  - Any 5xx from cost-centers endpoints inspected individually.
- **Alerting**: no new alerts introduced. Existing infrastructure alerts on 5xx rate and latency cover the relevant surface.
- **Log events**: existing pino structured logging is sufficient; no new log events introduced.

## Technical Considerations

### Key Decisions

- **Decision: adopt the Drizzle Relational API for any read populating user attribution** (ADR-003).
  - Rationale: the API is purpose-built for this use case; `relations()` definitions are added anyway for the FK; `db` already uses `fullSchema`.
  - Trade-offs: new pattern for the project (zero existing use); write path gains a second query.
  - Alternatives rejected: manual `leftJoin` + `aliasedTable()` (verbose, ignores relations); raw SQL (loses type safety).

- **Decision: single migration file with `NOT VALID + VALIDATE CONSTRAINT` inline** (ADR-004).
  - Rationale: production audit confirmed 930 clean refs; `VALIDATE` completes in milliseconds per table; establishes correct institutional default for future FK additions on larger tables.
  - Trade-offs: migration file is manually edited after `drizzle-kit generate`.
  - Alternatives rejected: two-file split (operational overhead without benefit at this scale); plain FK (wrong default for future growth).

- **Decision: shared `auditUserSchema` Zod helper in `src/lib/responses/response.types.ts`**.
  - Rationale: centralizes the `{ id, name } | null` contract; single edit point if the contract expands in a future PRD.
  - Trade-offs: adds one import to every module's model file.
  - Alternatives rejected: inline per module (duplication across 20+ modules).

- **Decision: write-then-reread pattern for mutations**.
  - Rationale: aligns POST/PUT/DELETE response shape with GET; avoids dual typing on the frontend.
  - Trade-offs: +1 query per mutation (~single-digit ms).
  - Alternatives rejected: CTE with LEFT JOIN (complex SQL, harder to read); client-side refetch (worse UX).

### Known Risks

- **Risk: manual migration edit is lost in a future `drizzle-kit generate`.**
  - Likelihood: low. Drizzle-kit only generates migrations for schema diffs; completed migrations are not regenerated.
  - Mitigation: commit the manually-edited migration; after merge, any `bun db:generate` run must pass through normal code review where a regeneration attempt on `0038` would be immediately visible.

- **Risk: an edge case in Drizzle's Relational API produces unexpected SQL for the triple self-join to `users`.**
  - Likelihood: low; `one`-relations with distinct `relationName` are a standard pattern in Drizzle.
  - Mitigation: pilot integration tests exercise all three relations (populated and null); any anomaly surfaces in Phase 2 before rollout.

- **Risk: `VALIDATE CONSTRAINT` encounters a new orphan created between the 2026-04-21 audit and the production deploy.**
  - Likelihood: very low; orphan creation requires hard-deleting a user after they created domain records. Project has no documented hard-delete flow for users.
  - Mitigation: re-run orphan scan immediately before deploy; the transaction aborts atomically if `VALIDATE` fails.

- **Risk: test fixture sweep misses a rarely-exercised test file, which then breaks later.**
  - Likelihood: moderate. Grep may not catch every pattern (e.g., helper functions that wrap direct inserts).
  - Mitigation: run the full test suite locally before merging PR 1 — the only reliable signal.

- **Risk: future Better Auth upgrade changes user ID format or deletes user rows unexpectedly.**
  - Likelihood: low; Better Auth user IDs are stable.
  - Mitigation: `ON DELETE SET NULL` gracefully handles the hard-delete case; domain audit trail survives user removal.

## Architecture Decision Records

- [ADR-001: Delivery Approach — Infra First + Pilot + Incremental Rollout](adrs/adr-001.md) — deliver in three phases to isolate migration risk from feature risk.
- [ADR-002: API Contract Shape for User Attribution Fields](adrs/adr-002.md) — expose `createdBy` / `updatedBy` / `deletedBy` as `{ id, name }` objects, always present, consistent across read and write endpoints.
- [ADR-003: Service Query Pattern — Drizzle Relational API](adrs/adr-003.md) — use `db.query.X.findFirst/findMany({ with })` for reads populating user attribution; use write-then-reread for mutations.
- [ADR-004: Migration Strategy — Single File with NOT VALID + VALIDATE CONSTRAINT](adrs/adr-004.md) — apply FKs across 26 tables in one manually-edited migration file using Postgres's safe two-step constraint pattern.

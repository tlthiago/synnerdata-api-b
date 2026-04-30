# User Attribution on Domain Resources — Roadmap Design

## Status

Validated through brainstorming session on 2026-04-27. Per-PRD authoring underway.

**Checkpoint 2026-04-29:**

- **PRD #1 — Audit Coverage Expansion**: ✅ merged via [PR #296](https://github.com/tlthiago/synnerdata-api-b/pull/296) on 2026-04-27. Stable in production.
- **PRD #2 — User Anonymization**:
  - PR 1 (new endpoint + adapter): ✅ merged via [PR #300](https://github.com/tlthiago/synnerdata-api-b/pull/300) on 2026-04-28. Frontend deployed; post-deploy SQL invariant check passed.
  - PR 2 (legacy `user.deleteUser` cleanup, T08): ✅ merged via [PR #302](https://github.com/tlthiago/synnerdata-api-b/pull/302) on 2026-04-28.
- **PRD #3 — Schema FK + NOT NULL + drop deletedBy**: ✅ merged via [PR #303](https://github.com/tlthiago/synnerdata-api-b/pull/303) on 2026-04-29. Migration `0043_audit_fk_not_null.sql` aplicada em HML+prod. Schema state em prod: 26 `created_by_users_id_fk` + 22 `updated_by_users_id_fk` + 0 colunas `deleted_by` remanescentes. Pre-deploy backfill manual de prod (12 organization_profiles + 2 billing_profiles com NULL em `created_by`) executado via psql atribuindo o owner da org como creator. Frontend grep confirmou zero consumidores manuais de `deletedBy`. Decorrente: CLAUDE.md ganhou seção "O que pertence em uma migration" estabelecendo as 3 categorias aceitas (DDL puro, backfill como pré-requisito DDL idêntico em todo ambiente, seeds idempotentes) e as 3 rejeitadas (data fix de prod, backfill com decisão operacional, cleanup recorrente).
- **PRD #4 — Cost-Centers Pilot**: ✅ merged via [PR #312](https://github.com/tlthiago/synnerdata-api-b/pull/312) on 2026-04-30.
- **Sweep Semantic A em soft-delete**: ✅ merged via [PR #313](https://github.com/tlthiago/synnerdata-api-b/pull/313) on 2026-04-30.
- **PRD #5+ — Phase 3 Rollout**: 🟡 em revisão via [PR #314](https://github.com/tlthiago/synnerdata-api-b/pull/314). 20 módulos cobertos (organizations: branches, sectors, job-positions, job-classifications, projects, ppe-items, profile; employees; occurrences: absences, accidents, cpf-analyses, labor-lawsuits, medical-certificates, ppe-deliveries, promotions, terminations, vacations, warnings; payments: admin-provision, billing). 22 commits atômicos via subagent-driven-development. Out of scope intencional: `payments/features` (response Zod não expõe audit columns) + sub-tabelas M2M (junctions sem audit columns surfacing). Casos especiais: `promotions` (substitui shape legada `z.string().nullable()`); `admin-provision` (BREAKING admin API: rename `createdByUser` → `createdBy`, drop custom `fetchCreatedByUser`, add `updatedBy`); `org-profile` (singleton sem soft-delete); `ppe-deliveries` (parent table only, junctions out of scope). tsc + ultracite + db:check verdes; module-tests passam por batch.

Após merge desta PR a iniciativa user-attribution-roadmap está **completa end-to-end**.

## Origin

PR #252 ([feat/cost-centers-audit-user-info](https://github.com/tlthiago/synnerdata-api-b/pull/252)) executed an initial design that surfaced concerns during deep review:

- Service code introduced ergonomic burden (transactions, mapping helpers, Drizzle Relational API patterns) that diverged from the project's existing absences-style conventions.
- LGPD interpretation defaulted to nullify the user reference on hard delete, weakening the audit trail expected of an HR/payroll SaaS.
- Schema added `relations()` blocks that would not be used if the project's prevailing query style were preserved.
- The premise "audit_logs already covers deletion attribution" turned out to apply only to a minority of in-scope modules (about 7 modules use `auditPlugin` or `AuditService` today; the rest do not). Dropping `deletedBy` based on that premise would have silently erased deletion authorship for the modules that lack audit logging.

This document captures the redesigned approach. PR #252 is to be **closed without merge**. The branch and commits remain alive as reference — task_04's fixture fixes (cpf-analyses bug, payments/plans isolation) are worth cherry-picking into the new work.

## Goal

Domain resources expose `createdBy` and `updatedBy` as `{ id, name }` objects in API responses, backed by referential integrity at the database level. User account "deletion" is replaced by anonymization of the user row (LGPD-compliant). `deletedBy` is removed from domain tables once `audit_logs` becomes the authoritative source for deletion attribution across all 26 modules.

## Architectural decision: anonymize over hard-delete

When a user requests account deletion, the system **does not physically remove the row in `users`**. Instead it replaces the personally identifiable fields and revokes auth credentials:

- `name` → `"Usuário removido"`
- `email` → `"anon-${user_id}@deleted.synnerdata.local"` (kept unique to satisfy Better Auth's UNIQUE constraint)
- `image` → `null`
- `email_verified` → `false`
- `anonymized_at` → `now()` (new column)
- Sessions, accounts, two-factor, API keys, invitations are deleted (login becomes impossible).

Why anonymize and not delete:

- LGPD recognizes anonymization (irreversible severance of personal data from a person) as a valid alternative to elimination (Art. 16 + ANPD guidance). Once anonymized, the row's data is no longer "personal data" under the law.
- HR/payroll SaaS faces labor-prescrição (5 years) and potential audits where authorship of historical events has probative value. Hard delete erases that. Anonymization preserves the audit chain.
- Industry-canonical pattern: GitHub's "ghost user", Slack's content preservation. Anonymized tombstone instead of disappearance.
- Foreign-key integrity stays intact across all domain tables (no `SET NULL`, no orphan references).

## Technical decisions (binding for every PRD downstream)

These decisions are settled by this design. Reopening any of them reopens this document.

- **Query style**: Drizzle Core API with inline `select()` + `aliasedTable` for self-joins to `users`. NOT the Relational API + `with`. Aligns with the established `absences` pattern in the project.
- **Helper**: `src/lib/schemas/audit-users.ts` exports `auditUserAliases()` returning `{ creator, updater }` — minimal abstraction, only encapsulates the repeated `aliasedTable` calls.
- **Reuse `entityReferenceSchema`**: existing helper at `src/lib/schemas/relationships.ts` is the canonical `{ id, name }` Zod schema. No new `auditUserSchema`.
- **No `mapAuditRelations`**: inline `select()` defines the API response shape directly — no mapping function required.
- **No `relations()` blocks** for audit users in domain schema files: Core query style does not consult them.
- **Schema convention** for audit columns: `createdBy` and `updatedBy` are `text NOT NULL .references(() => users.id, { onDelete: "restrict" })`. `deletedBy` is removed entirely from domain tables.
- **Semantic A for `updatedBy`**: populated on `INSERT` (= `userId`, equal to `createdBy` initially) and on `UPDATE`. Ensures `NOT NULL` is viable; aligns with the "Populate `createdBy`/`updatedBy` with userId from session" convention already documented in the root `CLAUDE.md`.
- **Anonymization atomicity**: anonymization is immediate when the user requests it. No grace period in this design (a future PRD may add it as a separate concern).
- **Audit log of anonymization**: the anonymization event itself is recorded in `audit_logs` for traceability of the operation.

## Roadmap

```
PRD #1 (Audit Coverage)  ──┐
                           ├── PRD #3 (Schema FK + NOT NULL) ── PRD #4 (Pilot) ── PRD #5+ (Rollout)
PRD #2 (Anonymization)  ───┘
```

PRDs #1 and #2 are independent — they may run in parallel. PRD #3 starts only after both #1 and #2 are merged and stable in production.

### PRD #1 — Audit logging coverage expansion

**Goal**: every domain resource emits `audit_logs` entries on `create`/`update`/`delete` with `userId` from the session, across all in-scope modules. Without this, dropping `deletedBy` (PRD #3) would silently lose deletion authorship for the modules that currently do not log to `audit_logs` (verified to be the majority).

**In scope**:

- Expand `AuditResource` enum in `src/modules/audit/audit.model.ts` to include all in-scope resources (cost_center, branch, sector, job_position, project, ppe_item, vacation, absence, accident, cpf_analysis, labor_lawsuit, medical_certificate, promotion, termination, warning, ppe_delivery, etc.).
- Plug `auditPlugin` (from `src/lib/audit/audit-plugin.ts`) into the controllers that do not yet use it.
- Insert `audit()` calls in services (or controllers, following the project's existing pattern) for `create`/`update`/`delete` operations, supplying `userId`, `organizationId`, `resourceId`, and optional `changes`.
- Test coverage per module verifying that audit entries land with the right shape.
- Update `src/modules/audit/CLAUDE.md` and module CLAUDE.md files where coverage was added.

**Out of scope**:

- Any change to the schema of domain tables (no FK additions, no NOT NULL changes, no column drops).
- Any change to API contracts of domain resources.
- Audit log retention policy review (separate future concern).

**Dependencies**: none.

**Risk**: low. Additive only; cannot break existing API consumers; rollback is reverting plugin wiring per module.

### PRD #2 — User anonymization (replacing hard delete)

**Goal**: replace Better Auth's native `deleteUser` flow with an anonymization endpoint owned by the project. LGPD-compliant via documented anonymization. No physical removal of `users` rows after this PRD ships.

**In scope**:

- Disable Better Auth's `user.deleteUser.enabled` in `src/lib/auth.ts`.
- Migration: add `anonymized_at: timestamp` to `users`.
- Custom endpoint `POST /v1/account/anonymize` (final naming TBD by the PRD itself):
  - Validates: not admin/super_admin, no active paid subscription if owner, no other org members if owner (mirrors current `beforeDelete` business rules).
  - Performs anonymization in a single DB transaction: replace PII fields, set `anonymized_at`, delete sessions/accounts/twoFactors/apikeys/invitations, optionally delete the org if the user was the sole owner of an empty trial org (mirrors existing org-cascade rule).
  - Records the anonymization in `audit_logs` (resource `user`, action `anonymize`).
- Frontend coordination: replace `authClient.deleteUser({ password })` with the new endpoint contract. Communication to the frontend team happens during PRD #2 implementation.
- Test coverage: anonymization happy path, blocked admin/super_admin, blocked owner with paid subscription, blocked owner with active members, owner of empty trial org cascade.
- Update `src/modules/auth/CLAUDE.md` to reflect the new flow.

**Out of scope**:

- Grace period (separate future PRD).
- Domain table FK changes (PRD #3).
- API response shape changes for domain resources (PRD #4 onwards).

**Dependencies**: none. Can run in parallel with PRD #1.

**Risk**: medium. Mexes in an auth-critical flow; requires legal/DPO sign-off on the anonymization values; requires frontend coordination. Mitigated by: comprehensive test coverage, staged rollout (deploy in homolog, validate, then prod).

### PRD #3 — Schema FK + NOT NULL + drop `deletedBy`

**Goal**: enforce referential integrity on `createdBy`/`updatedBy` across all in-scope tables; remove `deletedBy` columns from domain schema (`audit_logs`, after PRD #1, becomes the source of "who deleted what").

**Scope context**: 26 in-scope tables total. All 26 carry `createdBy`. 22 carry `updatedBy` (5 are partial-column: `ppe_delivery_logs`, `ppe_delivery_items`, `ppe_job_positions`, `project_employees`, `features`). 24 carry `deletedBy` (`features` and `ppe_delivery_logs` do not). The migration applies the relevant constraint per-column based on what each table actually has.

**Pre-requisites**: PRD #1 and PRD #2 merged and stable in production.

**In scope**:

- Single migration applying, in order:
  1. Backfill: `UPDATE <table> SET updated_by = created_by WHERE updated_by IS NULL` for every in-scope table.
  2. Backfill: identify and resolve any rows with `created_by IS NULL` (likely zero based on prior production audit; verified pre-migration).
  3. `ALTER TABLE <table> ALTER COLUMN created_by SET NOT NULL` and `ALTER COLUMN updated_by SET NOT NULL`.
  4. `ALTER TABLE <table> ADD CONSTRAINT <name>_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT NOT VALID` then `VALIDATE CONSTRAINT`. Repeat for `updated_by`.
  5. `ALTER TABLE <table> DROP COLUMN deleted_by` for every in-scope table.
- Update Drizzle schema files (`src/db/schema/*.ts`) to match (`.notNull().references(...)` for createdBy/updatedBy; remove deletedBy).
- New helper at `src/lib/schemas/audit-users.ts` exporting `auditUserAliases()`.
- Update services that currently set `deletedBy` on soft delete — remove those `set({ deletedBy: ... })` lines (applies only to services whose tables had the column).
- Audit fixtures across `src/**/__tests__/` and `src/test/helpers/**` for placeholder/hard-coded `userId` writes (re-running the diligence from PR #252's task_04). Cherry-pick the existing fixes: cpf-analyses `userId: organizationId` bug, payments/plans trial-constraint isolation.
- Migration applied with the proven `NOT VALID + VALIDATE CONSTRAINT` pattern; pre-deploy orphan audit re-run (adapted from PR #252's `orphan-audit.sql`) verifies zero orphans across all in-scope columns.

**Out of scope**:

- Service-layer query changes (`db.query` vs `db.select` style choice). Services keep returning the current shape; the FK and NOT NULL constraints are transparent at this stage.
- API contract changes for domain modules. Responses still serialize `createdBy`/`updatedBy` as text user IDs at this layer.

**Dependencies**: PRD #1 (audit coverage) + PRD #2 (anonymization) merged and stable.

**Risk**: medium. Touches up to 26 tables in a single migration; backfill must complete cleanly before NOT NULL applies. Mitigated by: pre-deploy orphan audit; validated `NOT VALID + VALIDATE` pattern; full local test suite run before merge (per PR #252's task_04 protocol).

### PRD #4 — Cost-centers pilot module

**Goal**: cost-centers becomes the canonical reference implementation of user attribution exposure in API responses. Phase 3 PRDs (one per remaining module) replicate this pattern.

**Pre-requisites**: PRD #3 merged.

**In scope**:

- Refactor `src/modules/organizations/cost-centers/cost-center.service.ts` to use Drizzle Core inline select with `aliasedTable` (matching absences style). `findAll` and `findByIdOrThrow` use `innerJoin` for creator and updater. `create`/`update` mutate then re-read (no transaction wrapper). The `delete` method (soft-delete) returns the resource enriched with `createdBy`/`updatedBy` from the same join pattern; no `deletedBy` field is exposed (audit_logs covers it). Controllers now pass session user as `{ id, name }` to support this.
- Update `src/modules/organizations/cost-centers/cost-center.model.ts` to reuse `entityReferenceSchema` for `createdBy`/`updatedBy`. Response data schema becomes `{ ..., createdBy: entityReferenceSchema, updatedBy: entityReferenceSchema }` — both required, never null (anonymization guarantees the FK target always exists; PRD #3 enforces NOT NULL). No `deletedBy` field on the data shape.
- Update the 5 integration tests in `cost-centers/__tests__/` to assert the new shape. Add a test that exercises the anonymized creator path: create a cost-center, anonymize its creator, GET the cost-center → expect `createdBy: { id: "user-xyz", name: "Usuário removido" }`. This validates the FK integrity and the anonymization downstream behavior end-to-end.
- Update `src/modules/organizations/cost-centers/CLAUDE.md` to document the canonical pattern explicitly (link to the new helper, link to the model conventions).
- Spot-check OpenAPI output to confirm the new shape is reflected in the schema served to consumers.

**Out of scope**:

- Other domain modules (Phase 3).

**Dependencies**: PRD #3.

**Risk**: low. Localized to one module; tests cover the contract change; FK already enforced at DB level by PRD #3.

### PRD #5+ — Phase 3 rollout (one PRD per module or small group)

**Goal**: replicate the canonical pilot pattern across the remaining 23 modules. Ordered by product demand.

**Pre-requisites**: PRD #4 merged.

**In scope (per PRD)**: same as PRD #4 applied to the target module(s).

**Dependencies**: PRD #4.

**Risk**: low per PRD — pattern is established; copy-and-adapt with module-specific business rules preserved.

**Sequencing**: prioritization is a product decision. Strong candidates per the original PRD: `employees`, `vacations`, `branches`, `sectors`.

## Execution strategy per PRD

Not every PRD warrants the full Compozy ceremony (`cy-create-prd` → `cy-create-techspec` → `cy-create-tasks` → `compozy start`). The PRDs in this roadmap have heterogeneous shapes: some are genuinely novel features with stakeholder coordination, others are mechanical replications of an established pattern. Matching tool to scope unlocks meaningful velocity.

| PRD | Tool | Rationale |
|---|---|---|
| **#1 Audit Coverage** | Superpowers `writing-plans` + `subagent-driven-development` | Mechanical: ~13 modules receive the same `auditPlugin` wiring + `audit()` calls. Pattern is established by `medical-certificates`/`employees`/`cpf-analyses`. Subagents process modules in parallel; one structured plan governs the work. |
| **#2 Anonymization** | Compozy (full pipeline) | Genuine novel feature with non-trivial edge cases (admin block, owner-with-subscription block, owner-with-members block, transactional cleanup). Requires DPO/jurídico sign-off + frontend coordination — PRD as deliverable artifact justifies the ceremony. |
| **#3 Schema FK + NOT NULL** | Hybrid: Superpowers `writing-plans` for the migration design, subagent dispatch for the mechanical schema/service updates | Migration with production risk warrants careful design (backfill order, NOT VALID timing, orphan handling). Schema/service updates across 26 tables are copy-paste of established pattern — subagent-friendly. |
| **#4 Cost-Centers Pilot** | Superpowers `writing-plans` + `executing-plans` | Single module, pattern fully specified by this design. PRD ceremony adds overhead without proportional value. |
| **#5+ Phase 3 Rollout** | Subagent dispatch (`subagent-driven-development`) | 23 modules replicate the cost-centers canonical pattern. Independent, parallelizable, mechanical. PRD-per-module would multiply ceremony 23 times for no design benefit. |

**Trade-offs accepted by this strategy:**

- Subagent dispatch is less deterministic than Compozy — quality gate must be the human review at the end of each batch.
- Without a formal PRD, decisions rely on `writing-plans` (technical audience) rather than a product-readable artifact. Acceptable when the audience is engineering only.
- Compozy's per-task workflow memory is more robust than Superpowers across multi-week work; PRD #2 retains it where it matters.

**Estimated calendar impact** (baseline: original "all Compozy" plan ~4-5 months end-to-end):

- PRD #1: ~3-5 days (was ~2 weeks)
- PRD #2: ~1-2 weeks (unchanged — Compozy retained)
- PRD #3: ~1 week (was ~2 weeks)
- PRD #4: ~1-2 days (was ~1 week)
- PRD #5+ (23 modules): ~1-2 weeks (was ~3 months)
- **Total**: ~5-7 weeks delivered end-to-end, vs ~4-5 months with uniform Compozy.

The strategy may evolve as PRDs land — if PRD #1 reveals more design ambiguity than anticipated, escalating to Compozy mid-flight is acceptable.

## Out of scope across all PRDs

- Frontend implementation work (consumes the new API; separate cycle).
- Per-field change history UI (`audit_logs` queries cover historical investigation).
- Grace period for anonymization (separate future PRD).
- eSocial integration itself (this work is one of its prerequisites; integration is a future PRD).
- Refactoring of other modules' query patterns beyond what is required to expose `createdBy`/`updatedBy`.

## External coordinations

- **Frontend team**: PRD #2 changes the deletion endpoint contract. PRD #4+ changes the response shape on `createdBy`/`updatedBy` for each rolled-out module. Coordination during the implementation of each PRD, communicated via PR description and team channel.
- **DPO / jurídico**: validate the anonymization approach satisfies the company's interpretation of LGPD art. 18 and that the chosen anonymized values are acceptable. Sign-off should occur during PRD #2's review.
- **DevOps / DBA**: PRD #2 adds `anonymized_at`; PRD #3 modifies up to 26 tables with the `NOT VALID + VALIDATE` pattern. Both follow the existing migration deploy flow; no new tooling required.

## Closing PR #252

PR #252 will be closed without merge. The branch `feat/cost-centers-audit-user-info` and its 8 commits remain accessible for cherry-picking the still-valid pieces:

- `task_04` fixture fixes (cpf-analyses `userId: organizationId` bug, payments/plans trial isolation) — cherry-pick into PRD #3.
- The orphan audit SQL script (`.compozy/tasks/audit-user-references/scripts/orphan-audit.sql`) — reuse in PRD #3 pre-deploy verification.
- The deploy-gate runbook (`.compozy/tasks/audit-user-references/deploy-gate.md`) — adapt for PRD #3.

The PR description should be updated explaining the design pivot and linking to this document.

## Open items per downstream PRD

These are items the individual PRDs themselves should answer; this design intentionally does not pre-decide them:

- **PRD #1**: which AuditResource keys are first-class (one per table) vs aggregated (e.g., a single `domain_resource` key for low-volume tables). Volume estimates and retention impact.
- **PRD #2**: exact endpoint name and HTTP verb. Behavior if anonymization fails mid-flow (rollback strategy). What happens if the user's email contains characters that conflict with the `anon-${user_id}` template.
- **PRD #3**: orphan resolution playbook if any production rows have `created_by IS NULL`. Sequencing of the migration if it must be applied in stages (per-table batches) for very large tables.
- **PRD #4**: pilot success criteria (latency budgets, error rate thresholds). What signals a green light for Phase 3.
- **PRD #5+**: prioritization framework (product demand vs technical proximity); whether some modules can be grouped into a single PRD (e.g., the smaller occurrences modules).

## References

- ANPD legítimo interesse guide — https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf
- LGPD Art. 16 + Art. 18 (Lei 13.709/2018) — https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- SERPRO — Dados anonimizados — https://www.serpro.gov.br/lgpd/menu/protecao-de-dados/dados-anonimizados-lgpd
- Better Auth deleteUser hooks discussion — https://github.com/better-auth/better-auth/issues/4766
- Right-to-be-forgotten vs audit trail (Axiom) — https://axiom.co/blog/the-right-to-be-forgotten-vs-audit-trail-mandates
- Original PR #252 — https://github.com/tlthiago/synnerdata-api-b/pull/252
- Project memory — `~/.claude/projects/.../memory/project_delete-account-robust.md`
- Project files — `src/modules/audit/CLAUDE.md`, `src/lib/audit/audit-plugin.ts`, `src/modules/occurrences/absences/absence.service.ts` (canonical Core + inline select pattern reference), `src/lib/schemas/relationships.ts` (`entityReferenceSchema`)

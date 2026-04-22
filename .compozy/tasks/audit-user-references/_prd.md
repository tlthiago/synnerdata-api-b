# PRD — User Attribution on Domain Resources

## Overview

The platform's API currently stores audit identifiers (`created_by`, `updated_by`, `deleted_by`) on every domain resource as plain user ID strings, and most endpoints do not expose them at all. Frontend clients that need to display "who created this" or "last updated by" must either chain extra requests to resolve user names or omit the information entirely.

This work delivers a single, consistent API-level capability across every domain module with CRUD endpoints: each response includes the creator, last updater, and deleter as `{ id, name }` objects, backed by enforced referential integrity on **26 domain tables** at the database level. The primary audience is internal product operators (HR and finance users inside customer organizations), platform administrators performing audits, and the frontend development team consuming the API.

Value: clear, in-context authorship reduces time to answer "who changed this?", supports labor-law audit expectations, and eliminates a class of frontend workarounds that degrade responsiveness.

## Goals

- Every domain resource in the platform is self-describing about its creator, last updater, and deleter, in a format ready for direct rendering.
- The database enforces referential integrity between audit columns and the users table, closing a data-quality gap present in the current schema.
- Delivery happens without degrading API performance, breaking existing integrations, or interrupting live customers.
- A single canonical pattern is established that every current and future domain module follows.

Measurable outcomes:

- Every domain module with a user-facing CRUD endpoint exposes user attribution in its responses by end of rollout.
- **All 26 tables** with audit columns have their `created_by`, `updated_by`, and `deleted_by` columns enforced as foreign keys to the users table at the database level.
- 100 percent of existing audit references (930 populated rows as of the 2026-04-21 baseline) validated as pointing to existing users, confirmed by pre-migration orphan scan and enforced continuously thereafter.
- Zero regressions introduced in existing module endpoints after the infra deploy.
- Frontend teams can render "created by" and "last updated by" without making extra API calls.

## User Stories

**Primary persona — SaaS customer operator (HR, finance, org admin):**

- As an org operator viewing a cost center, I want to see who created and last modified it so I can ask the right person about changes or context.
- As an org operator reviewing a vacation request or termination record, I want to identify the person who approved or updated the record so I can follow up on its status.
- As an org operator opening a deleted item view, I want to see who performed the deletion so I can verify authorization.

**Secondary persona — platform administrator:**

- As a platform admin investigating a support ticket, I want to see creator and updater info on organization-scoped records so I can trace changes without joining tables manually.
- As a platform admin auditing activity, I want records to reliably link to a valid user identity so my reports are not polluted by stale or orphan identifiers.

**Tertiary persona — frontend / integration developer:**

- As a frontend developer rendering a resource card, I want creator and updater information delivered with the resource so I do not have to chain additional requests.
- As a frontend developer typing the API contract, I want every module to return the same shape for user attribution so I can reuse a single component.

## Core Features

**Priority P0 — essential for MVP:**

- **Inline user attribution in domain resource responses**: every GET list, GET by id, POST, PUT, and DELETE response returns `createdBy`, `updatedBy`, and `deletedBy` as `{ id, name }` objects (or `null`).
- **Referential integrity enforced by the database**: FK constraints on every audit column link it to the users table; orphan values prevented at the DB level going forward.
- **Safe production migration**: schema change deploys via a zero-downtime, reversible procedure, executed once for the entire schema.
- **Pilot validation in cost-centers module**: full end-to-end feature delivered in one representative module before fanout.

**Priority P1 — rollout completeness:**

- **Incremental rollout across remaining modules with CRUD endpoints**: each module adopts the pilot pattern via its own PR, ordered by product demand. Scope covers modules whose resources are user-facing (internal join or log tables that have audit columns but no public CRUD API are not part of Phase 3, though they still receive the FK/relations changes in Phase 1).

**Priority P2 — guardrails:**

- **Test coverage guaranteeing no regression**: every touched module has integration tests validating the new shape and null handling; existing tests continue to pass.
- **Contract documentation**: OpenAPI schemas reflect the new payload shape, visible to frontend teams and external integrators via the existing docs pipeline.

## User Experience

**Primary flow (org operator):**

1. Operator opens a record detail screen (e.g., a cost center).
2. The UI renders the record along with "Created by <Name>" and "Last updated by <Name>" labels, sourced directly from the API response.
3. Operator acts on the record; every subsequent response keeps the attribution up to date.
4. If a field is `null` (system-created record or user removed from the organization), the UI renders a sensible fallback ("System" or blank).

**Secondary flow (admin):**

1. Admin opens a resource detail or audit panel.
2. Attribution is visible without additional requests; admin can trust the displayed identity because the DB enforces the link.

**UX considerations:**

- Rollout produces a temporary period where some modules return attribution objects and others still do not. Frontend must treat the fields as optional during the rollout window. The change is additive: no existing module shape is broken.
- Null creator/updater is an intentional, supported state on legacy/system-created records; UI guidance is "System" or blank, not an error.
- No new screens, feature toggles, or permissions are introduced. The feature is additive information on existing screens.

## High-Level Technical Constraints

- The `users` table is managed by Better Auth; user IDs are text primary keys. Audit attribution must align to that key format and survive Better Auth's user lifecycle (soft and hard delete scenarios).
- The platform is multi-tenant; all resources are scoped by organization. User attribution must never leak user data across organization boundaries (already ensured by the existing access layer).
- LGPD compliance: exposing any additional user information beyond `id` and `name` (such as email) would require privacy review. This scope is limited to `{ id, name }` to avoid that review.
- Production is live with customer data; schema migration must execute without taking the API offline and without a maintenance window.

## Non-Goals (Out of Scope)

- **No frontend UI work**: this PRD delivers API-level capability only. Frontend rendering of attribution is consumed in a separate work cycle.
- **No new endpoints for "who did what" history**: per-field change history, diff views, or activity timelines are covered by the existing `audit_logs` table and are out of scope.
- **No expansion of user fields**: email, avatar, role, phone, or any other user attribute beyond `id` and `name` is out of scope. A future PRD may extend the object additively.
- **No admin workflow for reassigning authorship**: historical records stay with their original audit values.
- **No batch/bulk endpoint optimization**: if a batch endpoint is added later, the extra read per write may require specific tuning. Out of scope here.
- **No change to the separate `audit_logs` feature**: that table already supports event-level audit and is unaffected by this work.

## Phased Rollout Plan

### MVP (Phase 1) — Schema-wide infra

**Baseline evidence:** the pre-migration orphan scan executed on 2026-04-21 against production returned **930 populated audit references across 72 audit columns on 26 tables, with zero orphans**. This confirms the FK migration is safe from data-integrity failures and does not require a cleanup step.

- All 26 tables with audit columns receive FK + `relations()` definitions.
- A single SQL migration adds FKs to every audit column with `onDelete: set null`, using the `NOT VALID + VALIDATE CONSTRAINT` pattern to avoid extended locking.
- No API contract change; no response payload change; no service-level behavioral change.
- **Success criteria to proceed to Phase 2:**
  - Migration executes successfully in production.
  - Post-migration orphan scan returns zero orphans (reconfirming prod baseline).
  - No increase in API error rate, request latency, or DB CPU for 48 hours after deploy.
  - Test factories updated so existing test suites pass locally and in CI with FK active.

### Phase 2 — Pilot feature in cost-centers

- The `cost-centers` module adopts the full contract from ADR-002: response schemas, service queries, and tests updated to deliver `{ id, name }` objects for `createdBy`, `updatedBy`, `deletedBy`.
- Integration tests extend to cover null cases (system-created record, user removed) and populated cases.
- OpenAPI spec reflects the new shape in the docs bundle.
- **Success criteria to proceed to Phase 3:**
  - Frontend team confirms the new shape is usable and renders correctly.
  - No regression in cost-centers endpoint behavior or latency.
  - The pattern is codified in module CLAUDE.md as the canonical reference for other modules.

### Phase 3 — Incremental rollout across remaining CRUD modules

- One PR per module (or small group), each replicating the pilot pattern. Ordering driven by product demand.
- Scope: every module with user-facing CRUD endpoints whose underlying table carries audit columns. Internal tables (join tables, append-only logs, admin-only config) already received FK in Phase 1 and do not need Phase 3 work unless a public endpoint is later added.
- **Success criteria for the overall effort:**
  - Every in-scope module exposes attribution objects in its responses.
  - Temporary "mixed shape" period closes.
  - Frontend team can remove any conditional handling that tolerated the rollout window.

## Success Metrics

- **Coverage**: percentage of in-scope modules exposing user attribution objects (target: 100 percent of modules with user-facing CRUD endpoints by end of Phase 3).
- **Infra completeness**: percentage of tables with audit columns carrying FK + `relations()` (target: 100 percent — all 26 tables at end of Phase 1).
- **Integrity**: count of orphan audit references in production (target: zero, continuously, validated by the audit scan post-deploy).
- **Reliability**: no increase in 5xx rate or p95 latency on the modified endpoints after each phase deploy (measured against 7-day pre-deploy baseline).
- **Developer velocity**: frontend time-to-ship an "authorship" feature for a domain resource drops from "needs new backend work" to "consumes existing field". Qualitative, tracked via frontend team feedback after Phase 2.
- **Test coverage**: every modified module has integration tests covering populated and null attribution cases.

## Risks and Mitigations

- **Risk: rollout stalls after Phase 2 and modules are inconsistent indefinitely.**
  Mitigation: maintain a rollout checklist in the issue tracker listing every remaining in-scope module; gate new feature PRs touching legacy modules on adopting the pattern.

- **Risk: frontend teams do not adopt the new fields and the effort delivers no user-visible value.**
  Mitigation: align with frontend stakeholders before Phase 2 starts; treat Phase 2 merge as a handoff event with a confirmed consumption plan for the first screen.

- **Risk: privacy concerns surface about exposing the `name` field broadly.**
  Mitigation: the chosen shape exposes only `id + name`, already visible to any user in the same organization via existing member/team screens. No new privacy surface is introduced.

- **Risk: customer-facing rendering shows confusing "null" for system-created records, raising support tickets.**
  Mitigation: establish UX guidance for null fallbacks ("System" or blank) with the frontend team before Phase 2 ships.

- **Risk: a future feature requires exposing more user fields and we have to revisit the contract.**
  Mitigation: ADR-002 documents the rationale; if richer needs emerge, a follow-up PRD can extend the object additively (adding fields without breaking existing consumers).

## Architecture Decision Records

- [ADR-001: Delivery Approach — Infra First + Pilot + Incremental Rollout](adrs/adr-001.md) — deliver in three phases (infra, pilot, rollout) to isolate migration risk from feature risk.
- [ADR-002: API Contract Shape for User Attribution Fields](adrs/adr-002.md) — expose `createdBy`/`updatedBy`/`deletedBy` as `{ id, name }` objects, always present, consistent across read and write endpoints.

## Open Questions

- **Rollout ordering in Phase 3**: which module adopts the pattern second (after the cost-centers pilot)? Candidates with highest likely product demand: `employees`, `sectors`, `branches`, `vacations`. Needs product input when Phase 2 nears completion.
- **Frontend null-state guidance**: confirm the desired UX label for system-created records (`"System"`, `"—"`, or configurable per screen). Frontend team decision; does not block backend delivery.

### Resolved during PRD review

- **OpenAPI consumer impact** — resolved. The change is purely additive: no domain module currently exposes `createdBy`, `updatedBy`, or `deletedBy` in its response schemas (verified in codebase exploration). Adding new fields is backward-compatible for every known consumer. No deprecation notice required.
- **Module CLAUDE.md updates** — resolved. Scope for documentation updates is:
  - `.claude/CLAUDE.md` (root) — add the user-attribution pattern under "Architectural Decisions" during Phase 1.
  - `src/modules/organizations/cost-centers/CLAUDE.md` — update during Phase 2 to reflect the canonical pattern.
  - Each module's CLAUDE.md during Phase 3 — as the module adopts the pattern, if a CLAUDE.md exists. Modules without a CLAUDE.md do not need one created just for this change.

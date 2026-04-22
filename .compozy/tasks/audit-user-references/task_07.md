---
status: completed
title: Update `cost-centers` module `CLAUDE.md` with canonical pattern
type: docs
complexity: low
dependencies:
  - task_06
---

# Task 07: Update `cost-centers` module `CLAUDE.md` with canonical pattern

## Overview

Document the new user-attribution pattern in the `cost-centers` module-level `CLAUDE.md` so every Phase 3 PR has a clear, discoverable reference for replication. Include pointers to the shared helpers (`auditUserSchema`, `mapAuditRelations`), the `db.query` + `with` query style, the transaction-wrapped write-then-reread, and an explicit flag marking cost-centers as the canonical pattern source.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST update `src/modules/organizations/cost-centers/CLAUDE.md` with a new section documenting user attribution
- MUST reference `auditUserSchema` and `mapAuditRelations` and their import path (`@/lib/responses/response.types`)
- MUST mention the transaction-wrapped write-then-reread pattern and why (atomicity if re-read fails)
- MUST flag cost-centers as the canonical reference implementation for Phase 3 rollout
- MUST NOT duplicate PRD/TechSpec content — reference them instead
</requirements>

## Subtasks

- [x] 07.1 Add a "User attribution" section to the module CLAUDE.md
- [x] 07.2 Document the query pattern (`db.query.costCenters.findFirst/findMany({ with })`) with a one-paragraph summary
- [x] 07.3 Document the transaction-wrapped write-then-reread and the rationale
- [x] 07.4 Add a note marking the module as the canonical reference for Phase 3 replication

## Implementation Details

See TechSpec **"Core Interfaces"** for the canonical patterns and **"Phased Rollout Plan" → Phase 3** for rollout context. Match the existing module CLAUDE.md tone; keep the new section short (≈10-15 lines) with an explicit pointer to the code locations in `cost-center.service.ts`.

### Relevant Files

- `src/modules/organizations/cost-centers/CLAUDE.md` — target file
- `src/modules/organizations/cost-centers/cost-center.service.ts` — reference implementation produced by task_06
- `src/modules/organizations/cost-centers/cost-center.model.ts` — reference schema produced by task_06

### Dependent Files

- None directly; future Phase 3 PRs will read this file for guidance

### Related ADRs

- [ADR-002: API Contract Shape](adrs/adr-002.md)
- [ADR-003: Service Query Pattern](adrs/adr-003.md)

## Deliverables

- Updated `cost-centers/CLAUDE.md` with a "User attribution" section documenting the canonical pattern
- Unit tests: N/A — documentation task
- Integration tests: N/A — documentation task

## Tests

- Unit tests:
  - [ ] N/A — documentation file; no executable code
- Integration tests:
  - [ ] N/A — documentation file; no integration surface
- Test coverage target: N/A for documentation tasks; verification is manual review and link resolution
- All tests must pass (no failing tests introduced by docs)

## Success Criteria

- Module CLAUDE.md updated with the canonical pattern section
- References to `auditUserSchema`, `mapAuditRelations`, and their import path are present and correct
- Style consistent with other module CLAUDE.md files
- Links to ADRs resolve correctly

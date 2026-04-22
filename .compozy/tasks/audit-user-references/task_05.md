---
status: pending
title: Update root `.claude/CLAUDE.md` with user-attribution pattern
type: docs
complexity: low
dependencies:
  - task_02
  - task_03
---

# Task 05: Update root `.claude/CLAUDE.md` with user-attribution pattern

## Overview

Document the new user-attribution architectural pattern in the project's root `.claude/CLAUDE.md` so future contributors have the canonical reference alongside existing decisions (Zod-for-all-validation, AppError hierarchy, response envelope, etc.). One bullet under "Architectural Decisions" covering the FK + relations pattern, the Drizzle Relational API query approach, and the payload shape.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add exactly one bullet under the existing `## Architectural Decisions` section in `.claude/CLAUDE.md`
- MUST reference the user-attribution pattern covering: FK with `ON DELETE SET NULL`, `relations()` with `*User` suffix, `db.query` + `with` query approach, payload shape `createdBy`/`updatedBy`/`deletedBy` as `{ id, name } | null`, mapping helper location
- MUST match the existing tone, length, and style of other bullets in the section
- MUST NOT duplicate PRD or TechSpec content; link to the relevant ADRs and/or `.compozy/tasks/audit-user-references/` artifacts for full context
</requirements>

## Subtasks

- [ ] 05.1 Draft the single bullet following the style of existing Architectural Decisions entries
- [ ] 05.2 Include a reference to ADR-002 and ADR-003 (or to the `.compozy/tasks/audit-user-references/_techspec.md`) so readers can find the full rationale
- [ ] 05.3 Proofread for consistency with the surrounding bullets (tone, length, trailing period)
- [ ] 05.4 Verify markdown renders correctly and all links resolve

## Implementation Details

See TechSpec **"System Architecture" → "Modified components"** for the scope of the pattern. Inspect existing bullets in `.claude/CLAUDE.md` for style anchors; match length and vocabulary (short title + explanation, active voice, trailing period).

### Relevant Files

- `.claude/CLAUDE.md` — target file, specifically the `## Architectural Decisions` section

### Dependent Files

- None directly

### Related ADRs

- [ADR-002: API Contract Shape](adrs/adr-002.md)
- [ADR-003: Service Query Pattern](adrs/adr-003.md)

## Deliverables

- One new bullet in `.claude/CLAUDE.md` under `## Architectural Decisions`
- Unit tests: N/A — documentation task, validated by review
- Integration tests: N/A — documentation task, validated by review

## Tests

- Unit tests:
  - [ ] N/A — documentation file; no executable code
- Integration tests:
  - [ ] N/A — documentation file; no integration surface
- Test coverage target: N/A for documentation tasks; verification is manual review and link resolution
- All tests must pass (no failing tests introduced by docs)

## Success Criteria

- Bullet merged into root `.claude/CLAUDE.md`
- Style consistent with existing Architectural Decisions entries
- Links to ADR-002 and ADR-003 (or equivalent references) resolve correctly
- No existing bullet modified by accident

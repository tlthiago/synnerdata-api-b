---
status: pending
title: Phase 1 deploy gate — pre-deploy re-audit and post-deploy monitoring
type: ops
complexity: low
dependencies:
  - task_02
  - task_03
  - task_04
  - task_05
---

# Task 08: Phase 1 deploy gate — pre-deploy re-audit and post-deploy monitoring

## Overview

Cover the two operational steps the TechSpec mandates around the Phase 1 deploy but that no code task owns: (a) re-run the production orphan audit SQL immediately before merging PR 1, to confirm no new orphan rows appeared since the 2026-04-21 baseline (930 refs, 0 orphans); (b) re-run the same audit plus monitor 5xx rate, p95 latency, and DB CPU for 48 hours after deploy. This task exists to prevent the gate from being forgotten at merge time — failure of either check is a hard rollback trigger.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST re-run the orphan audit SQL script against the production database within 24 hours before merging PR 1
- MUST abort the merge and escalate if the pre-deploy audit returns any orphan row (the migration's `VALIDATE CONSTRAINT` would fail and abort atomically, but catching it pre-deploy avoids a failed deploy event)
- MUST re-run the same audit script against production immediately after the migration applies post-deploy, confirming zero orphans
- MUST compare 5xx rate, p95 latency, and DB CPU on affected endpoints against a 7-day pre-deploy baseline for 48 hours after deploy
- MUST capture the pre-deploy audit result, post-deploy audit result, and the monitoring comparison in the PR 1 description or a linked comment
- MUST NOT skip the monitoring window even if the audit is clean — the metrics gate covers regressions unrelated to orphans
</requirements>

## Subtasks

- [ ] 08.1 Run the orphan audit SQL against production within 24h before merging PR 1; capture output
- [ ] 08.2 If output shows any orphan: stop the merge, investigate, fix data or postpone
- [ ] 08.3 After PR 1 deploy, re-run the audit against production; confirm zero orphans
- [ ] 08.4 Snapshot 5xx rate, p95 latency, and DB CPU for the 26 affected modules' endpoints (or a representative subset) against a 7-day baseline immediately before deploy
- [ ] 08.5 Re-check the same three metrics at 24h and 48h post-deploy; note any deviation >10% against baseline
- [ ] 08.6 Attach pre-audit, post-audit, and 48h metrics comparison to the PR 1 description (or linked operational ticket)

## Implementation Details

See TechSpec **"Monitoring and Observability"** for the full monitoring checklist and PRD **"Phased Rollout Plan" → Phase 1 "Success criteria to proceed to Phase 2"** for the acceptance bar. The orphan audit SQL is the same script used on 2026-04-21 — reuse it verbatim; do not re-derive.

### Relevant Files

- Production database — target of pre- and post-deploy audits (executed by the operator with prod access; no file in-repo)
- Monitoring stack (Grafana / observability vendor) — baseline and post-deploy metrics
- The PR 1 description — final evidence record

### Dependent Files

- None directly; this task is operational and does not modify source

### Related ADRs

- [ADR-004: Migration Strategy](adrs/adr-004.md) — `VALIDATE CONSTRAINT` failure mode; atomic rollback

## Deliverables

- Pre-deploy orphan audit evidence captured in PR 1 description or linked comment **(REQUIRED)**
- Post-deploy orphan audit evidence captured in PR 1 description or linked comment **(REQUIRED)**
- 48-hour metrics comparison (5xx, p95, DB CPU) captured in PR 1 description or linked comment **(REQUIRED)**
- Unit tests: N/A — operational task
- Integration tests: N/A — operational task

## Tests

- Unit tests:
  - [ ] N/A — operational checks, not code
- Integration tests:
  - [ ] N/A — operational checks, not code
- Test coverage target: N/A; success is evidence captured in PR 1
- All tests must pass (the other Phase 1 tasks' tests remain green throughout the gate)

## Success Criteria

- Pre-deploy orphan audit: zero orphans, recorded in PR 1
- Post-deploy orphan audit: zero orphans, recorded in PR 1
- No >10% deviation from 7-day baseline on 5xx rate, p95 latency, or DB CPU at 48h post-deploy
- If any check fails: a follow-up incident ticket is opened and a rollback/remediation plan is in place before Phase 2 starts

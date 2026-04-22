# User Attribution on Domain Resources — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Export `auditUserSchema` + `mapAuditRelations` helper | pending | low | — |
| 02 | Add FK + `relations()` to all 26 domain schema files | pending | high | — |
| 03 | Generate + manually edit migration `0038_audit_fk_references.sql` (`NOT VALID + VALIDATE`) | pending | medium | task_02 |
| 04 | Audit + fix test fixtures and seed helpers for FK activation | pending | high | task_03 |
| 05 | Update root `.claude/CLAUDE.md` with user-attribution pattern | pending | low | task_02, task_03 |
| 06 | Pilot: refactor `cost-centers` module (model + service + tests) | pending | medium | task_01, task_03, task_04 |
| 07 | Update `cost-centers` module `CLAUDE.md` with canonical pattern | pending | low | task_06 |

## Phasing

- **Phase 1 (Infra PR)** — tasks 01 – 05
- **Phase 2 (Pilot PR)** — tasks 06 – 07 (merges only after Phase 1 ships and stabilizes in production)
- **Phase 3 (Incremental rollout)** — out of scope for this task list; each module replicating the pilot pattern will receive its own task breakdown when scheduled

## References

- [PRD](_prd.md)
- [TechSpec](_techspec.md)
- [ADR-001: Delivery Approach](adrs/adr-001.md)
- [ADR-002: API Contract Shape](adrs/adr-002.md)
- [ADR-003: Service Query Pattern](adrs/adr-003.md)
- [ADR-004: Migration Strategy](adrs/adr-004.md)

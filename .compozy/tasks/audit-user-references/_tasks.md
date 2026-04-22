# User Attribution on Domain Resources — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Export `auditUserSchema` + `mapAuditRelations` helper | completed | low | — |
| 02 | Add FK + `relations()` to all 26 domain schema files | completed | high | — |
| 03 | Generate + manually edit migration `0038_audit_fk_references.sql` (`NOT VALID + VALIDATE`) | completed | medium | task_02 |
| 04 | Audit + fix test fixtures and seed helpers for FK activation | completed | high | task_03 |
| 05 | Update root `.claude/CLAUDE.md` with user-attribution pattern | completed | low | task_02, task_03 |
| 08 | Phase 1 deploy gate — pre-deploy re-audit and post-deploy monitoring | pending | low | task_02, task_03, task_04, task_05 |
| 06 | Pilot: refactor `cost-centers` module (model + service + tests) | completed | medium | task_01, task_03, task_04 |
| 07 | Update `cost-centers` module `CLAUDE.md` with canonical pattern | completed | low | task_06 |

## Phasing

- **Phase 1 (Infra PR)** — tasks 01 – 05 (code) + task 08 (operational gate at merge / post-deploy)
- **Phase 2 (Pilot PR)** — tasks 06 – 07 (merges only after Phase 1 ships, task 08 clears the 48h window, and stabilization is confirmed)
- **Phase 3 (Incremental rollout)** — out of scope for this task list; each module replicating the pilot pattern will receive its own task breakdown when scheduled

## References

- [PRD](_prd.md)
- [TechSpec](_techspec.md)
- [ADR-001: Delivery Approach](adrs/adr-001.md)
- [ADR-002: API Contract Shape](adrs/adr-002.md)
- [ADR-003: Service Query Pattern](adrs/adr-003.md)
- [ADR-004: Migration Strategy](adrs/adr-004.md)

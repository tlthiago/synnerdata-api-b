# User Anonymization — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Lib infrastructure additions (BadRequestError + anonymizedAt column + AuditAction.anonymize) | completed | low | — |
| 02 | Extend AuditService.log with optional transaction parameter | completed | low | — |
| 03 | Refactor validateUserBeforeDelete to AppError + auth.ts adapter | completed | medium | task_01 |
| 04 | AccountAnonymized email template + sender wrapper | completed | low | — |
| 05 | AnonymizeService + Zod model | completed | high | task_01, task_02, task_03, task_04 |
| 06 | AnonymizeController + integration tests + app mount + legacy test cleanup | completed | high | task_05 |
| 07 | Update src/modules/auth/CLAUDE.md (PR 1 documentation) | completed | low | task_06 |
| 08 | PR 2 cleanup: remove legacy user.deleteUser block + auditUserDelete + CLAUDE.md final | pending | low | task_07 |

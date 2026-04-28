# Task Memory: task_07.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

Documentation refresh of `src/modules/auth/CLAUDE.md`: replace "Account Deletion" with "Account Anonymization" as the primary flow; add transitional subsection covering legacy `user.deleteUser` adapter (PR 1 → PR 2); update future-work pointer to grace period as separate PRD.

## Important Decisions

- Kept top-level "Future Work" subsection inside the Anonymization section (not at file bottom) — the bottom "Melhorias Futuras" already exists for unrelated auth roadmap items, and the grace-period note is anonymization-specific. Avoids confusion between two future-work lists.
- Promoted error codes into a dedicated table separate from the business-rules table — error codes are consumer-facing (frontend i18n), business rules are operator-facing (decision tree). Splitting them keeps each table focused.

## Learnings

- Ultracite/Biome silently skips markdown files (`Checked 0 files`) but runs cleanly when invoked at repo root (607 files in 801ms, no fixes). Markdown lint coverage in this project is effectively absent — content review is the only quality gate.

## Files / Surfaces

- `src/modules/auth/CLAUDE.md` — only file modified for this task (55 insertions, 17 deletions).

## Errors / Corrections

None.

## Ready for Next Run

- task_08 will rewrite this same file again to drop the "Transitional" subsection and remove any references to the legacy `user.deleteUser` block. Section anchor for the future delete: `### Transitional: legacy \`user.deleteUser\` block (PR 1 only)`.

# Cron Plugin

Orquestra jobs agendados do domínio. Composição de 7 cron jobs via `@elysiajs/cron`.

## Meta

- **`name`**: `"cron-jobs"`
- **OpenAPI tag**: N/A
- **Instance-level**: sem `.as()` — plugin só roda no bootstrap do app, não propaga side-effects

## Jobs registrados

| Nome | Schedule (cron) | Consumer service |
|---|---|---|
| `expire-trials` | `0 12 * * *` (12:00 UTC = 09:00 BRT) | `JobsService.expireTrials` |
| `notify-expiring-trials` | `0 12 * * *` | `JobsService.notifyExpiringTrials` |
| `process-scheduled-cancellations` | `0 12 * * *` | `JobsService.processScheduledCancellations` |
| `suspend-expired-grace-periods` | `0 */6 * * *` (a cada 6h) | `JobsService.suspendExpiredGracePeriods` |
| `process-scheduled-plan-changes` | `0 12 * * *` | `JobsService.processScheduledPlanChanges` |
| `activate-scheduled-vacations` | `0 3 * * *` (03:00 UTC = 00:00 BRT) | `VacationJobsService.activateScheduledVacations` |
| `complete-expired-vacations` | `0 3 * * *` | `VacationJobsService.completeExpiredVacations` |

## Hooks

**Nenhum próprio**. Compõe plugins `cron(...)` que cada um registra seu próprio scheduler. Sem `derive`/`decorate`.

## Decisões técnicas

### Imports estáticos

Após CP-30 (confirmado em runtime que não há cycle), `JobsService` e `VacationJobsService` são importados estaticamente no topo. Antes eram `await import(...)` dinâmico — cargo-cult de refactor antigo.

### Refactor pendente (CP-32)

Os 7 jobs hoje têm boilerplate duplicado (`name`, `pattern`, `async run()` com `logger.info` padronizado). CP-32 vai extrair um helper `createCronJob({ name, pattern, handler })` ou array declarativo para reduzir duplicação.

## Consumers

- `src/index.ts` — único consumer, via `.use(cronPlugin)` no bootstrap

## Testes

Tests não exercitam o scheduler em si (seria side-effect pesado rodar cron na suite). Em vez disso, tests vivem nos services consumidos (`src/modules/payments/jobs/__tests__/`, `src/modules/occurrences/vacations/__tests__/`) e chamam os métodos diretamente.

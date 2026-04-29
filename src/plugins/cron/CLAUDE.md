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
| `process-scheduled-terminations` | `0 3 * * *` (03:00 UTC = 00:00 BRT) | `TerminationJobsService.processScheduledTerminations` |

## Hooks

**Nenhum próprio**. Compõe plugins `cron(...)` que cada um registra seu próprio scheduler. Sem `derive`/`decorate`.

## Decisões técnicas

### Imports estáticos

Após CP-30 (confirmado em runtime que não há cycle), `JobsService` e `VacationJobsService` são importados estaticamente no topo. Antes eram `await import(...)` dinâmico — cargo-cult de refactor antigo.

### Registro declarativo via `createCronJob` (CP-32)

Helper interno `createCronJob<T>({ name, pattern, run, log })` encapsula o boilerplate de cada job: chama `run()`, captura o resultado tipado, e emite `logger.info({ type: "cron:<name>", ...log(result) })`. Consumers declaram só o essencial — nome, schedule, service call, e quais campos do resultado logar.

Assinatura:

```ts
type CronJobConfig<T> = {
  name: string;
  pattern: string;
  run: () => Promise<T>;
  log: (result: T) => Record<string, unknown>;
};
```

O genérico `<T>` flui do retorno de `run` para o parâmetro de `log`, preservando inferência (ex: `log: (r) => ({ expired: r.expired.length })` tem `r` tipado como `ExpireTrialsData`). Sem helper, seriam ~7 linhas por job com as mesmas chamadas repetidas.

## Consumers

- `src/index.ts` — único consumer, via `.use(cronPlugin)` no bootstrap

## Testes

Tests não exercitam o scheduler em si (seria side-effect pesado rodar cron na suite). Em vez disso, tests vivem nos services consumidos (`src/modules/payments/jobs/__tests__/`, `src/modules/occurrences/vacations/__tests__/`) e chamam os métodos diretamente.

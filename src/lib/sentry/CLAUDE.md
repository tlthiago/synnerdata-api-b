# lib/sentry

Integração com Sentry/GlitchTip. Dois concerns separados por design:

## `init.ts` — side-effect only

Importa `captureException` do `@sentry/bun` e chama `init({...})` **na carga do módulo**. Configura:

- `dsn` via `env.SENTRY_DSN` (opcional — skip se ausente)
- `environment` = `"production"` ou `"preview"`
- `tracesSampleRate` = 0.2 em prod, 1.0 em dev/preview
- `beforeSend` — remove headers `authorization` e `cookie` do request (proteção contra vazamento de credencial)

**Como consumir:** `src/index.ts` faz `import "@/lib/sentry/init"` no topo do bootstrap. Ninguém mais importa — é init-only.

## `reporter.ts` — wrapper testável

Expõe `ErrorReporter.capture(error, context?)` delegando para `captureException` do `@sentry/bun`.

**Por que o wrapper existe:** named import ESM do `@sentry/bun` não é interceptável via `spyOn` / `mock.module` em Bun — a const local já foi capturada no load do módulo. Property access em objeto compartilhado é trivialmente mockável via `spyOn(ErrorReporter, "capture")`.

Introduzido em **CP-6 follow-up (2026-04-23)** — 3 callsites migraram: `webhook.service.ts:134`, `error-plugin.ts:63` (5xx AppError), `error-plugin.ts:105` (unhandled).

## Regra de importação

- **Init** (uma vez, no bootstrap): `import "@/lib/sentry/init"` — side-effect, sem exports
- **Captura** (qualquer código de produção): `import { ErrorReporter } from "@/lib/sentry/reporter"` então `ErrorReporter.capture(error, { tags: {...} })`

**Nunca** importe `captureException` direto do `@sentry/bun` em código de produção — impossibilita teste unitário e quebra o contrato do CP-6 follow-up.

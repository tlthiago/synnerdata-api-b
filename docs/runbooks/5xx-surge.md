# 5xx Surge — Runbook

> Sentry alertando pico de 5xx sem root cause evidente. Este runbook faz triagem e roteia para runbook específico. Cobre débito #93.

## Sintomas

- Sentry dashboard: taxa 5xx > 1% por minuto em janela recente.
- Alertas (quando configurados) chegando por email/Slack.
- Cliente reporta "está dando erro em tudo" ou "algumas partes estão lentas".

## Diagnóstico rápido (≤ 5 min)

1. Sentry → agrupar erros por `issue.fingerprint` ou `error.type`.
2. Identificar top 3 errors e cross-referenciar `requestId` (`X-Request-ID` no header + body do erro via RU-2) com logs Pino.
3. Timing: quando começou o pico? Correlacionar com:
   - **Deploy recente?** Coolify → `app` → `Deployments` → timestamp do último deploy vs. timestamp do primeiro erro no pico.
   - **Dep externa caiu?** DB, SMTP, Pagar.me.
   - **Spike de tráfego?** Logs mostram volume incomum de requests?

Causas em ordem de probabilidade histórica:
1. Deploy recente quebrou produção.
2. Dep externa degradada.
3. Bug de código só reproduzível em prod (race condition, dados reais).

## Procedimento de recuperação

**Caminho A — Deploy recente (primeiro erro ≤ 15 min do deploy):**
1. Coolify → `app` → `Deployments` → selecionar deploy anterior.
2. `Rollback to this deployment`.
3. Confirmar que Sentry estabiliza (pico 5xx cai).
4. Abrir issue no repo com stack trace + link do deploy quebrado.

**Caminho B — Dep externa:**
Identificar qual e abrir runbook específico:
- DB → [db-down.md](./db-down.md).
- SMTP → [smtp-down.md](./smtp-down.md).
- Pagar.me → [pagarme-webhook.md](./pagarme-webhook.md).

**Caminho C — Bug de código sem deploy recente:**
1. Se está em prod há dias e só agora apareceu, investigar o que mudou no ambiente:
   - Env var alterada no Coolify?
   - Dep transitiva atualizada sem intenção? (Conferir `bun.lock` vs commit no Dockerfile.)
   - Dados reais tocando caminho de borda?
2. Hotfix em branch `fix/hotfix-<descr>` → direto em `main` com PR urgente (skipar `preview` se tempo for crítico) → deploy.

**Caminho D — Spike de tráfego malicioso (raro hoje sem CDN):**
1. Verificar logs por padrão: IPs únicos, user-agents, endpoints abusados.
2. Aumentar rate limit **temporariamente** via env var (se aplicável) ou bloquear IP no Coolify.
3. Acelerar onda Cloudflare (CP-14→15) se padrão.

## Comunicação

- Se afeta > 50% dos endpoints OU endpoints críticos (sign-in, checkout): **avisar cliente em ≤ 10 min**.
- Mensagem: "Estamos investigando instabilidade generalizada. Previsão ainda indeterminada."
- Atualizar a cada 30 min durante o incidente.

## Post-incident

- Postmortem breve (data, duração, root cause, ação corretiva).
- Se foi bug: issue + cobertura de teste.
- Se foi dep externa: avaliar se circuit breaker mitiga (MP-9 candidato).
- Se ≥ 2 5xx surges em trimestre com root cause diferente: sinal para acelerar CP-17 (métricas) e MP-6 (tracing).

## Referências

- Sentry (GlitchTip) — integração em `src/lib/sentry/init.ts` + `src/lib/sentry/reporter.ts`.
- `X-Request-ID` injetado em erros via RU-2 — ver `src/plugins/error-handler/error-plugin.ts`.
- Correlation ID via `AsyncLocalStorage` — `src/lib/request-context.ts`.
- [db-down.md](./db-down.md), [smtp-down.md](./smtp-down.md), [pagarme-webhook.md](./pagarme-webhook.md).
- Débito #93 em [debts.md](../improvements/debts.md).

# Infrastructure Improvements — synnerdata-api-b

> Iniciativa de maturação da infraestrutura/segurança/qualidade da API. Este README é o **dashboard** — se quer saber o estado, começa aqui.
>
> **Convenção:** toda mudança de estado atualiza este README **E** deixa entry em [changelog.md](./changelog.md).

---

## Estado atual — 2026-04-23

### Progresso por bucket

| Bucket | Total | Done | Active | Progresso |
|---|---|---|---|---|
| 🔴 **Urgente** (MVP-bloqueante) | 10 | 10 | 0 | ✅ **Completo** em 2026-04-22 |
| 🟡 **Curto prazo** (hardening, 30-90d) | 50 | 32 | 17 | **64%** · Ondas 1/2 completas, Onda 5 em 9/12 |
| 🟢 **Médio prazo** (sob demanda) | 22 | 0 | 22 | sinal-driven — sem investimento ativo |

### Saúde do codebase

- ✅ **854 tests pass** (suíte afetada + smoke tests novos do `routes/v1/`)
- ✅ **Ultracite clean** em 582 files
- ✅ **56/98 débitos resolvidos** em `debts.md` (+ 2 reavaliados como não-débito) — 40 abertos (#4 + #6 fechados em CP-52)
- ✅ **Zero débito 🔴** pendente
- ✅ **Onda 5 (refactors grandes)**: 9/12 entregues (75%) — restam CP-38 (M), CP-44 (M), CP-2 (XL — bloqueado por issue [#269](https://github.com/tlthiago/synnerdata-api-b/issues/269))

### Conquistas arquiteturais (Onda 5 — 2026-04-22/23)

- **`src/plugins/`** inaugurado com rubrica estrita (CP-1 XL): só Elysia instances mountadas via `.use()` vivem aqui. 5 plugins migrados.
- **`lib/auth.ts`** 856→339 linhas (CP-4 L) + auth-plugin 396→79 linhas, split em `lib/auth/*` + `plugins/auth-guard/*`.
- **`lib/errors/`** depurado (CP-5 L): só erros HTTP universais. Errors de domínio em `modules/<X>/errors.ts`. Factory `errorSchema<C>`.
- **Webhook Pagar.me hardened** (CP-6 M): Zod validation declarativa + observability logs + Sentry via `ErrorReporter` wrapper (CP-6 follow-up).
- **`src/routes/v1/`** composer centralizando `/v1` (CP-3 L): 25 controllers perderam `/v1` dos próprios `prefix:`; versão é responsabilidade única do composer. Destrava **CP-18** (deprecation headers).
- **Permissions inheritance** (CP-25 M): `inheritRole` helper reduz ~112 linhas de duplicação; matrix test 109 assertions preservado.
- **LGPD 100% endereçado** (CP-42 + CP-43 M): `buildAuditChanges` com PII redaction + `auditPlugin` mountado em 4 GET handlers sensíveis.

### PRs relevantes

- **BE**: #254 (CP-34/35/36/37/39), #255 (CP-27/29/31), #256 (CP-24/25/30), #257 (CP-1), #258 (CP-4), #260 (CP-33), #261 (CP-26+28+32), #262 (CP-5), #263 (CP-6), #264 (CP-6 follow-up ErrorReporter), #266 (CP-3), #267 (débitos §7.7 sweep).
- **FE**: #162 (pareada de CP-25 — inheritRole permissions).

---

## Próxima ação

### Concluir Onda 5 (3 CPs restantes)

1. **CP-38 (M)** — runbook de oncall em `docs/runbooks/` (DB down, webhook Pagar.me falhando, SMTP caído, Sentry em massa). **Docs-heavy**, branch simples. Pronto pra atacar.
2. **CP-44 (M)** — audit BOLA automatizado em CI (AST-scan de queries sem `organizationId`). Preventivo — follow-up de RU-9. Branch simples. Pronto pra atacar.
3. **CP-2 (XL)** — consolidar emails em `src/lib/emails/`. **Último por design** — toca fluxos críticos de auth (signup/reset/2FA/invitation). Worktree + plano formal obrigatórios.
   - 🔴 **BLOQUEADO por issue [#269](https://github.com/tlthiago/synnerdata-api-b/issues/269)** — flakes não-determinísticos em suite grande (state leak: signup welcome email + trial constraint + cpf-analyses list). Descoberto no CI do PR #268. Resolver #269 antes de iniciar CP-2 — ou os testes do refactor de emails serão não-confiáveis.

### Paralelizável (agora destravado)

- **CP-18 (M)** — deprecation headers `Deprecation`/`Sunset`. Destravado por CP-3. Pode rodar com Onda 4 Observabilidade.

### Candidatos pós-sync (2026-04-23)

- **CP-51 (S, candidato)** — extrair `paginationQuerySchema` para `lib/schemas/pagination.ts` e migrar 4 callsites (débito #97). Fecha gap de §4.1 #11 + §4.2 #6 do `principles.md`.
- ✅ **CP-52 entregue (2026-04-23)** — reorganização interna de `src/lib/` (Opção B): 3 commits atômicos, achatamento de 4 subdirs single-file + agrupamento de Better Auth + agrupamento de Sentry. Débitos #4 e #6 fechados. Observações de qualidade anotadas para CP-53.
- **CP-53 (M, candidato)** — pass de qualidade por arquivo em `src/lib/` após CP-52. Focos: `lib/pii.ts` (zero consumers em prod), `lib/auth/hooks.ts` (368L, mix de concerns), `lib/auth/audit-helpers.ts` (200L). Pipeline Compozy completo (PRD → TechSpec → final-verify).
- **MP-23 (candidato)** — field-level authorization em responses (débito #98). Sinal: requisito concreto do cliente ou auditoria LGPD Art. 18.

### Onda 4 (pós-Onda 5) — requer brainstorm

- **CP-17 (M)** — métricas básicas (OTel/Prometheus). Gap operacional conhecido: "Sem métricas ainda".
- **CP-19 (M)** — Playwright E2E em CI.
- **Cloudflare Free Tier** — CP-14 → 15 → 16 (blocked pelo cliente: DNS registro.br).

---

## Navegação

| Arquivo | Escopo | Quando consultar |
|---|---|---|
| [principles.md](./principles.md) | Padrões agnósticos (qualquer API): princípios de priorização, MVP/Early/Scale, OWASP | Primeira leitura, referência teórica |
| [project.md](./project.md) | Contexto do projeto, compliance, decisões arquiteturais, audit da Fase 1, organização semântica | Entender o projeto especificamente |
| [roadmap.md](./roadmap.md) | CPs/RUs/MPs priorizados em 3 buckets + 5 ondas, metodologia Fase 3, política de testes | Ver o que vem agora + como executar |
| [debts.md](./debts.md) | 98 débitos catalogados — 54 resolvidos, 42 abertos (+2 reavaliados como não-débito) | Rastrear débito específico |
| [changelog.md](./changelog.md) | Registro temporal de decisões e entregas (40+ entries) | Saber quando algo foi feito e porquê |
| [legacy/](./legacy/) | Documentos pré-audit mantidos para referência histórica (`api-maturity-plan.md`, `deployment.md`) — **não atualizar** | Pesquisa histórica somente |

---

## Metodologia em 30 segundos

- **Buckets por risco:** 🔴 urgente → 🟡 curto prazo → 🟢 sob demanda
- **Branches** derivam de `preview`, nomes `feat/` `fix/` `refactor/` `docs/` + descrição
- **S/M**: branch simples. **L/XL**: worktree + plano formal em `docs/plans/` (gitignored)
- **Atomic commits por concern** (Conventional Commits, nunca `--no-verify`)
- **Testes afetados + `npx ultracite check`** antes do commit — suíte completa é responsabilidade do CI
- PR base `preview`; body enumera mudanças + referência a issues/débitos + test plan
- **Research primeiro** quando envolve integração 3rd party (context7 + WebSearch + SDK) — ver CP-6 que reframou escopo após research confirmar ausência de HMAC no Pagar.me

Detalhes completos em [roadmap.md § Metodologia de execução](./roadmap.md).

---

## Gaps operacionais conhecidos

- GlitchTip configurado via `SENTRY_DSN`
- Uptime Kuma para healthchecks
- Logs de container não preservados entre deploys no Coolify
- `CODECOV_TOKEN` não configurado — upload do CP-20 vira warning silencioso
- **Sem métricas ainda** (observabilidade limitada a logs estruturados + error tracking) — alvo de CP-17

---

## Histórico condensado

- **2026-04-21** — Fases 0/1/2 concluídas (contexto, audit, roadmap). Baseline de testes executado.
- **2026-04-22** — Bucket 🔴 fechado (10/10). Ondas 1/2 concluídas. Onda 3 (PRs A/B/C) entregue. Onda 5 iniciada com CP-1 (XL).
- **2026-04-23** — Onda 5: CP-6 follow-up (ErrorReporter), CP-3 (routes/v1). PR #267 sweep de 46 débitos §7.7. PR #268 split da doc em 6 arquivos + rename de plugins (`plugins/auth→auth-guard`, `errors→error-handler`, `logger→request-logger`).
- **2026-04-23 (sync pass)** — Doc audit: `principles.md` sincronizado com realidade (9 Status ⚠️/❌ → ✅ + 7 `?` classificados). `api-maturity-plan.md` + `deployment.md` arquivados em `legacy/`. Débitos novos #97 (paginação schema) e #98 (field-level authz) registrados. `bun pm audit` → `bun audit`.
- **2026-04-23 (CP-52)** — Reorganização interna de `src/lib/`: achatamento de 4 subdirs single-file, agrupamento de Better Auth (`permissions` + `password-complexity` → `lib/auth/`), agrupamento de Sentry (`sentry.ts` + `error-reporter.ts` → `lib/sentry/`). Débitos #4 e #6 fechados. Observações de qualidade anotadas para CP-53 (pass futuro de code review por arquivo).

Changelog completo: [changelog.md](./changelog.md).

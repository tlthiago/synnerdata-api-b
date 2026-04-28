# Infrastructure Improvements — synnerdata-api-b

> Iniciativa de maturação da infraestrutura/segurança/qualidade da API. Este README é o **dashboard** — se quer saber o estado, começa aqui.
>
> **Convenção:** toda mudança de estado atualiza este README **E** deixa entry em [changelog.md](./changelog.md).

---

## Estado atual — 2026-04-24

### Progresso por bucket

| Bucket | Total | Done | Active | Progresso |
|---|---|---|---|---|
| 🔴 **Urgente** (MVP-bloqueante) | 10 | 10 | 0 | ✅ **Completo** em 2026-04-22 |
| 🟡 **Curto prazo** (hardening, 30-90d) | 50 | 40 | 5 | **80%** · 4 reclassificadas para MP (CP-18→MP-24, CP-19→MP-25 em 2026-04-23; CP-44→MP-27, CP-46→MP-28 em 2026-04-24) · Onda 5 fechada em 11/11 + Onda 6/7 + CP-38 + #269 entregues 2026-04-24 |
| 🟢 **Médio prazo** (sob demanda) | 28 | 0 | 28 | +2 em 2026-04-24 (MP-27 ex-CP-44, MP-28 ex-CP-46); +4 em 2026-04-23 (MP-23 + MP-24/25 ex-CP + MP-26 ex-candidato CP-51) |

### Saúde do codebase

- ✅ **854 tests pass** (suíte afetada + smoke tests novos do `routes/v1/`)
- ✅ **Ultracite clean** em 582 files
- ✅ **66/98 débitos resolvidos** em `debts.md` (+ 2 reavaliados como não-débito) — 32 abertos (+3 fechados na Onda 6 batch: #87, #88, #89)
- ✅ **Zero débito 🔴** pendente
- ✅ **Onda 5 (refactors grandes)**: **11/11 entregues (100%) ✅ — fechada em 2026-04-24** com CP-2 (emails consolidation). CP-44 reclassificado para MP-27

### Conquistas arquiteturais (Onda 5 — 2026-04-22/23)

- **`src/plugins/`** inaugurado com rubrica estrita (CP-1 XL): só Elysia instances mountadas via `.use()` vivem aqui. 5 plugins migrados.
- **`lib/auth.ts`** 856→339 linhas (CP-4 L) + auth-plugin 396→79 linhas, split em `lib/auth/*` + `plugins/auth-guard/*`.
- **`lib/errors/`** depurado (CP-5 L): só erros HTTP universais. Errors de domínio em `modules/<X>/errors.ts`. Factory `errorSchema<C>`.
- **Webhook Pagar.me hardened** (CP-6 M): Zod validation declarativa + observability logs + Sentry via `ErrorReporter` wrapper (CP-6 follow-up).
- **`src/routes/v1/`** composer centralizando `/v1` (CP-3 L): 25 controllers perderam `/v1` dos próprios `prefix:`; versão é responsabilidade única do composer. Destrava **MP-24** (deprecation headers, ex-CP-18 reclassificado em 2026-04-23).
- **Permissions inheritance** (CP-25 M): `inheritRole` helper reduz ~112 linhas de duplicação; matrix test 109 assertions preservado.
- **LGPD 100% endereçado** (CP-42 + CP-43 M): `buildAuditChanges` com PII redaction + `auditPlugin` mountado em 4 GET handlers sensíveis.

### PRs relevantes

- **BE**: #254 (CP-34/35/36/37/39), #255 (CP-27/29/31), #256 (CP-24/25/30), #257 (CP-1), #258 (CP-4), #260 (CP-33), #261 (CP-26+28+32), #262 (CP-5), #263 (CP-6), #264 (CP-6 follow-up ErrorReporter), #266 (CP-3), #267 (débitos §7.7 sweep).
- **FE**: #162 (pareada de CP-25 — inheritRole permissions).

---

## Próxima ação

### ⏸️ Iniciativa pausada em 2026-04-24

**Decisão do dono**: pausar a iniciativa de infra após fechar 80% do bucket 🟡 + 100% do urgente, e voltar a features de produto. Retomar depois para fechar os pontos de curto prazo restantes antes de avaliar os de médio prazo.

**5 ações ativas permanecem registradas (NÃO reclassificadas)** — vão ser retomadas quando o dono priorizar:

- **CP-41** (M, Onda 3) — Pagarme integration tests workflow. Dep: secrets sandbox Pagar.me no GitHub Actions.
- **CP-17** (M, Onda 4) — Métricas. Dep: decisão de escopo (Prometheus completo vs. leve Pino latency logs + `/metrics` via OTel API).
- **CP-14 → 15 → 16** (S→M→S, Onda 4) — Cloudflare Free Tier. Dep: alinhamento de DNS registro.br com o cliente.
- **CP-50** (M, Onda 7, contenção temporária) — TypeScript 5.9 → 6.x. Pin `~5.9.3` ativo até TS 6 virar adoção majoritária ou trazer feature/CVE necessária.

### Ordem de execução recomendada (2026-04-24, revisada — congelada na pausa)

**Sequência formal decidida** — priorizar isolamento de diagnóstico + destravar PRs grandes antes de escalar escopo. Ver [changelog 2026-04-24 "Sequência de execução revisada"](./changelog.md) para raciocínio completo.

**🟡 Linha principal:**

1. ~~**Onda 6 batch**~~ ✅ Entregue 2026-04-24 — CP-10 (Docker SHA pin) + CP-11 (HEALTHCHECK deep) + CP-12 (wait-for-db) + CP-49 (react/react-dom sync).
2. ~~**Issue #269 tests 3+4**~~ ✅ Entregue 2026-04-24 — trial constraint self-contained + cpf-analyses dates explícitas. Tests 1+2 (email spy race) para CP-2.
3. ~~**Onda 7 seq**~~ ✅ Encerrada 2026-04-24 — CP-48 ✅ + CP-47 ✅; CP-46 reclassificado → MP-28; CP-50 (TS 6) segue contenção.
4. ~~**CP-2**~~ ✅ Entregue 2026-04-24 — `src/lib/emails/` consolidado (mailer + 4 senders por domínio + components/templates movidos). Onda 5 fechada em 11/11.

**🟡 Em paralelo (encaixa onde convier):**

- **CP-41** (M, Onda 3) — Pagarme integration tests workflow. Dependência: secrets sandbox Pagar.me configurados. Fecha Onda 3.
- **CP-17** (M, Onda 4) — Métricas OTel/Prometheus. Gap operacional conhecido. Inclui #43 agregado.

**🟢 Condicional / bloqueio externo:**

- **CP-14 → 15 → 16** (Cloudflare Free Tier) — bloqueado pelo cliente (DNS registro.br).

### Ondas novas criadas em 2026-04-23

- **Onda 6 — Infra hardening pequeno**: 4 CPs órfãos agrupados (CP-10/11/12/49)
- **Onda 7 — Tooling migrations**: 4 CPs órfãos (CP-46/47/48/50, follow-ups de CP-40)

### Histórico recente do bucket 🟡

- ✅ **CP-2 entregue** (2026-04-24) — `src/lib/emails/` consolidado: `mailer.ts` + `senders/{auth,payments,admin,contact}.tsx` (19 senders splittados). `src/emails/` + `src/lib/email.tsx` deletados. Onda 5 fechada em 11/11.
- ~~**CP-46**~~ → **MP-28** (reclassificado 2026-04-24 — Ultracite 6→7 / Biome→Oxc; upgrade-by-inertia, zero CVE/deprecation/feature necessária. Mesmo critério de CP-44)
- ✅ **CP-47 entregue** (2026-04-24) — Better Auth `~1.4.22` → `~1.6.9`. apiKey movido para `@better-auth/api-key`, 2 migrations (two_factors.verified, apikeys reference_id/config_id), test de duplicate signup adaptado para nova enumeration protection. 2453+ tests passando.
- ✅ **CP-48 entregue** (2026-04-24) — Zod `~4.1.13` → `~4.3.6`. Fix do `.partial() + refine` afetou apenas 1 arquivo (`medical-certificates.model.ts`). 1709+ tests passando em escopo grande.
- ✅ **Issue #269 tests 3+4 fixados** (2026-04-24) — trial constraint self-contained + cpf-analyses dates explícitas. 14/14 pass local; CI valida em escopo grande. Tests 1+2 (email spy race) para CP-2.
- ✅ **Onda 6 batch entregue** (2026-04-24) — 4 CPs em 5 commits atômicos: CP-10 (Docker SHA pin) + CP-11 (HEALTHCHECK deep com body check) + CP-12 (wait-for-db via `src/db/wait-for-db.ts`) + CP-49 (react-dom pin). Fecha débitos #87, #88, #89.
- ✅ **CP-38 entregue** (2026-04-24) — 6 runbooks de oncall em `docs/runbooks/` + índice. Fecha débitos #90, #91, #93.
- ~~**CP-44**~~ → **MP-27** (reclassificado 2026-04-24 — BOLA AST preventivo; solo dev + RU-9 limpo + testes cross-org já existentes tornam regressão improvável hoje)
- ~~**CP-18/19**~~ → **MP-24/25** (reclassificados 2026-04-23 — sinal-driven, não pressing)
- ~~**CP-51 candidato**~~ → **MP-26** (paginação schema, mesma lógica)
- ✅ **CP-52 entregue** (2026-04-23) — reorganização interna de `src/lib/` (Opção B): débitos #4 e #6 fechados.
- ✅ **CP-53 Fase 1+2 entregues** (2026-04-23, PRs #271 e #276) — audit de qualidade + 10 fixes objetivos + 10 OQs resolvidas (ver [open-questions.md](./open-questions.md)).

---

## Navegação

| Arquivo | Escopo | Quando consultar |
|---|---|---|
| [principles.md](./principles.md) | Padrões agnósticos (qualquer API): princípios de priorização, MVP/Early/Scale, OWASP | Primeira leitura, referência teórica |
| [project.md](./project.md) | Contexto do projeto, compliance, decisões arquiteturais, audit da Fase 1, organização semântica | Entender o projeto especificamente |
| [roadmap.md](./roadmap.md) | CPs/RUs/MPs priorizados em 3 buckets + 5 ondas, metodologia Fase 3, política de testes | Ver o que vem agora + como executar |
| [debts.md](./debts.md) | 98 débitos catalogados — 60 resolvidos, 38 abertos (+2 reavaliados como não-débito) | Rastrear débito específico |
| [open-questions.md](./open-questions.md) | 15 perguntas estratégicas a discutir (OQ-1 a OQ-15) — surgidas no audit CP-53 | Decisões pendentes antes de virar CP |
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
- **2026-04-23 (CP-52)** — Reorganização interna de `src/lib/`: achatamento de 4 subdirs single-file, agrupamento de Better Auth (`permissions` + `password-complexity` → `lib/auth/`), agrupamento de Sentry (`sentry.ts` + `error-reporter.ts` → `lib/sentry/`). Débitos #4 e #6 fechados.
- **2026-04-23 (CP-53 Fase 1)** — Auditoria de qualidade de 25 arquivos em `src/lib/` (8 agentes paralelos + 8 arquivos triviais auditados pelo parent). 15 Open Questions registradas. Matriz consolidada em changelog.
- **2026-04-23 (CP-53 Fase 2 — PR #271)** — 10 commits atômicos de fixes objetivos não-bloqueados por OQs. Destaques: PII redaction em logs/Sentry (LGPD), extração de 6 callbacks do auth.ts, admin allowlist normalize (whitespace/case bug), email env vars. 707/707 tests passando. Débitos #70 e #71 fechados.
- **2026-04-24 (CP-38 + CP-44 reclass)** — 6 runbooks de oncall em `docs/runbooks/` (db-down, app-container, pagarme-webhook, smtp-down, 5xx-surge, migration-rollback) + índice `README.md` com decision tree. Débitos #90, #91, #93 fechados. CP-44 reclassificado para MP-27 no mesmo dia → Onda 5 ficou em **10/11 entregues (91%)**.
- **2026-04-24 (Onda 6 batch)** — 4 CPs em 5 commits atômicos: Docker SHA pin, HEALTHCHECK deep com body check, wait-for-db script, react-dom pin. Débitos #87/#88/#89 fechados. Onda 6 ✅ concluída.
- **2026-04-24 (Issue #269 tests 3+4)** — DB state leak fixado em 2 tests flaky: trial constraint test agora self-contained, cpf-analyses list usa datas explícitas. Tests 1+2 (email spy race) ficam para CP-2 via EmailDispatcher wrapper.


Changelog completo: [changelog.md](./changelog.md).

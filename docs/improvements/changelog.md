# Changelog da iniciativa de infraestrutura

> **Escopo:** registro temporal das decisões e entregas. Entries mais recentes no topo. **Toda atualização relevante do estado deve gerar uma entry aqui** (data ISO + resumo + refs).
>
> **Estado atual:** [README.md](./README.md).
> **Roadmap ativo:** [roadmap.md](./roadmap.md).

---

## 8. Changelog

Registro temporal das decisões e entregas desta iniciativa. **Toda atualização do documento deve adicionar uma entrada aqui** (data ISO + resumo).

### 2026-04-24 — CP-2 entregue: emails consolidados (Onda 5 fechada em 11/11)

Último CP da Onda 5. Resolve débitos #8 e #9 (duplicação `src/emails/` vs `src/lib/email.tsx` + arquivo de 520 linhas concentrando transporter + 19 senders).

**Estrutura nova** em `src/lib/emails/`:

- `mailer.ts` — transporter Nodemailer + helpers `sendEmail` / `sendBestEffort` + `FROM_ADDRESS`
- `senders/auth.tsx` — 7 senders (verification, reset, 2FA OTP, welcome, account-activation, provision-activation, organization-invitation)
- `senders/payments.tsx` — 10 senders (upgrade, trial-expiring/expired, cancellation-scheduled, subscription-canceled, price-adjustment, plan-change, payment-failed, checkout-link, provision-checkout-link)
- `senders/admin.tsx` — 1 sender (admin-cancellation-notice)
- `senders/contact.tsx` — 1 sender (contact-message)
- `components/`, `templates/`, `render.ts`, `constants.ts`, `__tests__/` — movidos de `src/emails/` via `git mv` (history preservada)

**Consumers atualizados** (10 arquivos):

- `src/lib/auth.ts`, `src/lib/auth/hooks.ts`, `src/lib/email-dispatcher.ts` (auth senders)
- `src/modules/payments/{plan-change,admin-provision,checkout,jobs}/*.service.ts`, `src/modules/payments/hooks/listeners.ts`
- `src/modules/public/contact/contact.service.ts`
- 2 test files: `mock.module()` path atualizado para split (`@/lib/emails/senders/payments` + `@/lib/emails/senders/admin`); `spyOn` em `invitation-hooks.test.ts` aponta para `@/lib/emails/senders/auth`

**Deletados**: `src/lib/email.tsx` (520 linhas), `src/emails/` (diretório).

**Validação**: 1425 tests pass em escopo amplo (auth + admin + payments + public + lib + plugins). 2 fails são pré-existentes (subscription `TrialPlanMisconfiguredError` + orphaned pagarme cleanup), confirmados via stash em `preview`.

**Estado final do bucket 🟡**: 40 done · 5 ativas · 4 reclassificadas · 1 contenção = 50. **Onda 5: 11/11 (100%)** ✅. Resta apenas trabalho paralelo: CP-41 (Pagarme tests, dep secrets), CP-17 (métricas), Cloudflare seq (DNS cliente), CP-50 (contenção TS 6).

**Princípio confirmado**: refactor de organização XL bem delimitado entrega valor real (compreensão + manutenibilidade), e o EmailDispatcher do CP-47 já tinha eliminado o bloqueio do #269 antecipadamente.

### 2026-04-24 — Reclassificação CP-46 → MP-28 (Ultracite 6 → 7)

Após executar CP-48 e CP-47 (que tinham breaking changes reais e exigiram trabalho efetivo), reavaliação honesta de CP-46 revelou perfil diferente:

- **Zero CVE** em Biome 2.x.
- **Zero deprecation** anunciada.
- **Zero feature** específica do Oxc necessária no projeto.
- Biome 2.x roda lint/format clean em 600+ arquivos hoje.
- Custo real: configurar Oxc equivalente, rodar `ultracite fix` em todo codebase, validar que nenhum auto-fix introduziu break, ajustar pre-commit hooks. ~4-8h com break risk alto.

CP-46 é exatamente "upgrade by inertia" — o caso que o critério de reclassificação foi feito para capturar. Mesmo critério aplicado em CP-44 → MP-27 e CP-18/19 → MP-24/25.

**Sinal para ativar MP-28**: Biome 2.x deprecated/EOL, CVE em Biome, performance de lint/format virou problema mensurável, ou feature específica do Oxc necessária.

**Onda 7 efetivamente encerrada**: CP-48 ✅ + CP-47 ✅ (breaking changes reais entregues), CP-46 → MP-28, CP-50 (TS 6) segue contenção até virar necessidade.

**Bucket 🟡**: 50 ações · 39 done · **6 ativas** (era 7) · **4 reclassificadas** (CP-18/19/44/46) · 1 contenção. **Bucket 🟢**: **28 ações** monitoradas (era 27).

### 2026-04-24 — CP-47 entregue: migração Better Auth 1.4 → 1.6 (Onda 7)

Segundo passo da Onda 7. Migração de `better-auth` de `~1.4.22` para `~1.6.9`.

**Breaking changes endereçados**:

1. **apiKey plugin movido** (1.5) → `@better-auth/api-key` standalone package. Import atualizado em `src/lib/auth.ts`.
2. **Schema `two_factors`** (1.6) → nova coluna `verified` boolean default `true`. Migration 0039.
3. **Schema `apikeys`** (1.5) → `user_id` renomeado `reference_id` + nova coluna `config_id` default `'default'`. Migration 0040.
4. **Email enumeration protection** (1.5) → sign-up com email duplicado retorna 200 silencioso quando `requireEmailVerification=true`. Test adaptado (era `expect(status).not.toBe(200)`, agora verifica silent 200 + integridade de duplicates).
5. **`better-auth-localization`** bumped 2.3 → 3.0 (peer dep compatível com BA 1.5+).
6. **`session.freshAge`** agora calculado de `createdAt` em vez de `updatedAt` (nova semântica). Projeto usa default — sem impacto prático.

**Commits (4 atômicos)**:
- `e50188d` — chore(deps): bump + apiKey import
- `(a)` — feat(db): schema + migrations
- `dbaddf8` — test(auth): enumeration protection adapt
- `(this)` — docs

**Validação**: 2453+ tests passing (auth: 115, plugins: 74, payments: 565, occurrences: 952, orgs+employees+audit+public: 862). Type check clean.

**Nota sobre drizzle-kit**: snapshots 35-38 têm ids/prevIds duplicados (bug preexistente do repo, não relacionado a este CP). Migrations 39-40 criadas manualmente pra evitar arrastar esse débito. Fix pode virar CP futuro se drizzle-kit generate for realmente necessário.

**Destrava**: Onda 7 avança para CP-46 (Ultracite 6 → 7, Biome → Oxc, L). CP-50 (TS 6) segue contenção.

### 2026-04-24 — CP-48 entregue: migração Zod 4.1 → 4.3 (Onda 7)

Primeiro passo da Onda 7 (tooling migrations). Migração de `zod` de `~4.1.13` (pinado como contenção em CP-40) para `~4.3.6`.

**Breaking change endereçado**: Zod 4.3 proíbe `.partial()` em object schemas contendo `.refine()` cross-field (antes permitia com comportamento indefinido).

**Escopo real vs. estimativa**: débito previa impacto em ~16 arquivos `.model.ts`. Na prática, apenas **1 arquivo** disparava o erro em runtime — `medical-certificates.model.ts`. Outros arquivos com `.partial()` + `.refine()` têm refines em nível de campo (`z.string().refine(...)` — afeta um field schema, não o object), que não dispara a validação nova.

**Fix aplicado** no medical-certificates:

```ts
// antes
const createSchema = z.object({...}).refine(crossField, ...);
const updateSchema = createSchema.partial().extend({...}).refine(crossField, ...);  // ❌ 4.3

// depois
const fieldsSchema = z.object({...});  // base, sem refine cross-field
const createSchema = fieldsSchema.refine(crossField, ...);
const updateSchema = fieldsSchema.partial().extend({...}).refine(crossField, ...);  // ✅
```

**Validação**: testes rodados por escopo em local (~1709+ assertions): 952 pass payments, 201 pass occurrences (accidents/terminations/promotions/cpf-analyses), 121 pass vacations, 101 pass warnings+labor-lawsuits, 50 pass medical-certificates, 245 pass organizations (branches/cost-centers/job-positions/sectors/ppe-items), 160 pass auth/admin/public/audit, 215 pass branches+employees+billing.

**Destrava**: Onda 7 avança para CP-47 (Better Auth 1.4 → 1.6, L). CP-50 (TypeScript 6) permanece contenção ativa (pin `~5.9.3`).

### 2026-04-24 — Issue #269 tests 3+4 fixados (DB state leak)

Continuação da sequência revisada — segundo passo após Onda 6. Tests 3+4 do #269 fixados; tests 1+2 (ESM named-import spy race) ficam para CP-2 (emails consolidation) via `EmailDispatcher` wrapper inline.

**Tests fixados** (2 commits atômicos):

- **Test 3 — trial constraint** (`yearly-discount-and-trial-constraint.test.ts > should prevent creating a second active trial plan`). Root cause: `PlanFactory.archiveActiveTrial()` arquiva seed `plan-trial` sem restaurar. Outros tests na suite rodavam factory antes e o test assumia que seed estava ativo. Fix: test agora garante estado conhecido (arquiva trials existentes + insere 1 trial como precondição) antes de assertar a constraint.
- **Test 4 — cpf-analyses list** (`list-cpf-analyses.test.ts > should list cpf analyses for the organization`). Root cause: `createTestCpfAnalysis` helper usa `faker.date.past({years:1})` — 2 chamadas consecutivas com mesmo employeeId tinham 1/365 chance de gerar mesma data, violando unique `(employeeId, analysisDate)`. Fix mínimo: passar dates explícitas e diferentes nas duas chamadas. Helper preservado (fix-on-demand).

**Tests 1+2 pendentes** (welcome email spy): rastreados no próprio issue #269. Plano: CP-2 (emails consolidation) vai introduzir `EmailDispatcher` wrapper que resolve a ESM named-import spy race naturalmente — spyable via property access em vez de capturar binding no module load.

**Validação local**: 14/14 pass nos 2 arquivos afetados. CI vai validar em escopo grande se flakes realmente sumiram (local não reproduz — só CI 2 vCPUs timing).

**Princípio adotado**: fix minimal + pontual. Não refatorar factories proativamente — se outros tests mostrarem flakes similar, fix-on-demand.

**Destrava**: Onda 7 seq (CP-48 → 47 → 46 → 50) pode avançar após #269 tests 3+4 mergeados; CP-2 quando chegar a vez.

### 2026-04-24 — Onda 6 batch entregue (infra hardening)

Primeira execução da sequência revisada. 4 CPs em 5 commits atômicos (1 de docs da sequência + 4 de CPs):

- **CP-10** — `oven/bun:1-alpine` pinado com SHA digest (`sha256:4de475...`). Dependabot ecossistema docker já configurado detecta novos digests semanalmente. Fecha débito #87.
- **CP-11** — HEALTHCHECK troca `/health/live` por `/health` com body check `grep -q '"status":"healthy"'` (endpoint sempre retorna 200, status vive no body via envelope). `retries` 5→10 (100s total). Coolify agora reinicia container se DB morrer. Fecha débito #88.
- **CP-12** — `src/db/wait-for-db.ts` tenta `SELECT 1` com retry (30×1s, 2s connection timeout, ~30s total) antes de migrations em `scripts/entrypoint.sh`. Log estruturado via Pino. Fecha débito #89.
- **CP-49** — `react-dom: "19.2.5"` adicionado explicitamente em `dependencies` (mesma versão pinada de `react`). Opção (a) do débito. Garante sync no lockfile + visibilidade para Dependabot. Testes de email (25 assertions) passando após mudança.

**Bucket 🟡**: 37/50 concluídas (era 33). Onda 6 fechada ✅. Próximo passo: issue #269 tests 3+4 (DB state leak — pré-requisito de CP-47 e CP-2).

### 2026-04-24 — Sequência de execução revisada (Onda 6 → #269 → Onda 7 → Onda 5)

Após audit de over-engineering (ver entry 2026-04-24 "reclassificação CP-44 → MP-27") e discussão sobre terminar Onda 5, **dono decidiu manter CP-2** (emails consolidation) como trabalho genuíno — refactor real de organização do módulo, facilita compreensão e manutenção.

**Sequência definida** (do mais rápido/isolado para o mais arriscado):

1. **Onda 6 batch** (CP-10/11/12/49) — 4×S, ~2-3h. Quick wins infra sem dependência externa. PR batch único.
2. **#269 tests 3+4** (DB state leak) — pré-requisito real de CP-2 e CP-47. Audit de factories/fixtures + cleanup explícito. Efforte M/L em PR próprio.
3. **Onda 7 seq** (CP-48 → 47 → 46 → 50) — tooling migrations em ordem de risco crescente (Zod 4.3 → Better Auth 1.6 → Ultracite 7 → TS 6). Cada uma em PR dedicado + janela de teste. Stack atualizada antes do CP-2 evita dupla refactor.
4. **CP-2** — emails consolidation (XL, 33 arquivos). Inclui `EmailDispatcher` wrapper que naturalmente resolve #269 tests 1+2. Fecha Onda 5 em 11/11.

**Por que #269 entra explicitamente**: sem resolver tests 3+4 (DB state leak em factories), qualquer PR de escopo médio/grande daqui pra frente (CP-47 Better Auth ou CP-2 emails) vai reativar flakes no CI. Issue #269 diz isso explicitamente.

**Outros CPs ativos** (CP-41 Pagarme tests, CP-17 métricas, Cloudflare CP-14/15/16) encaixam entre os passos acima conforme bandwidth e dependências externas (secrets Pagar.me, DNS registro.br com o cliente).

**Raciocínio contra "Onda 6 → Onda 7 → Onda 5 direto"**: sem #269 resolvido, CP-47 (Better Auth 1.6, toca schema + hooks auth) e depois CP-2 (emails, toca hooks auth) provavelmente flakeariam no CI e mascarariam bugs reais. Melhor fazer o fix isolado antes de escalar escopo.

### 2026-04-24 — CP-38 entregue + CP-44 reclassificado (Onda 5 chega a 10/11)

Duas decisões na mesma janela:

#### 1. CP-38 entregue (PR #282) — runbooks de oncall

Criados 6 runbooks em `docs/runbooks/` seguindo o padrão do `database-backup.md` existente:

- `db-down.md` — Postgres inacessível (4 caminhos: container, VPS, pool, corrupção). Schema do `/health` corrigido para refletir a realidade (retorna HTTP 200 com `data.status: "unhealthy"`, não 503; paths atualizados para `src/plugins/health/`).
- `app-container.md` — app não sobe (4 caminhos: env, migration, OOM, bug). Distingue de db-down via `/health/live`.
- `pagarme-webhook.md` — webhook falhando (5 classificações via logs tipados do CP-6). Tabela correta é `subscription_events` com column `error` (não `error_message`).
- `smtp-down.md` — SMTP Hostinger fora (4 caminhos). Referencia política de 2 classes (OQ-14) e dimensionamento de pool (OQ-15).
- `5xx-surge.md` — pico de 5xx (triagem, roteia para runbook específico via correlation ID).
- `migration-rollback.md` — migration quebrada (3 caminhos + nota de escala para débito #90). Entrypoint real é `bun run src/db/migrate.ts`.

Novo `docs/runbooks/README.md` serve como índice com decision tree sintoma→runbook e ordem de escalação padrão.

**Débitos fechados**: #90 (estratégia de migration em scale — documentado como nota), #91 (rollback de migration — 3 caminhos com SQL concreto), #93 (runbook oncall completo).

**Processo**: executado via subagent-driven-development skill (primeira task com 2-stage review que pegou 3 issues de paths stale em db-down). Após usuário observar overhead desnecessário para docs puros, switch para fluxo enxuto (implementer direto + verificação do controller + final review) para os 5 arquivos restantes + cross-refs.

#### 2. CP-44 reclassificado → MP-27 (PR #283)

Aplicando o mesmo critério usado em 2026-04-23 para CP-18/19 ("committed para 30-90d vs sinal-driven"), **CP-44** (BOLA AST automation em CI) reclassificado para **MP-27**. Avaliando honestamente:

- Solo dev escrevendo todos os services — sem drift de time.
- RU-9 (2026-04-22) validou estado limpo: 29/29 services org-scoped filtram corretamente, 0/50 gaps.
- Testes cross-org dinâmicos já existem em 3 módulos representativos (`employees`, `medical-certificates`, `cost-centers`).
- Custo de manter o AST scanner: ~2-3h de build + manutenção contínua (schema changes, falsos positivos, exemptions).
- Defensive engineering contra cenário que não existe hoje.

**Sinal para reativar MP-27**: equipe cresce (2+ devs), onboarding de novo dev, near-miss real de BOLA, ou refactor grande em `src/modules/`.

#### Contadores finais (após ambos mergeados)

- **Bucket 🟡**: 50 ações · **33 concluídas** (era 32) · **13 ativas** (era 15) · **3 reclassificadas** (CP-18/19/44) · 1 contenção
- **Bucket 🟢**: **27 ações** monitoradas (era 26) — MP-27 formalizada com implementação-guia preservada
- **Onda 5**: **10/11 entregues (91%)** — resta apenas CP-2 (XL, bloqueado #269)

**"Trabalho planejável" reduzido** — restam: CP-41 (Pagarme tests, precisa secrets sandbox), Onda 6 batch (CP-10/11/12/49, 4 quick wins), CP-17 (métricas), Cloudflare (externo), Onda 7 (janela dedicada), CP-2 (bloqueado).

**Princípio reforçado**: distinguir "committed para 30-90d" (CP) de "sob demanda, sinal-driven" (MP) impede que o bucket 🟡 acumule trabalho de baixo ROI no contexto atual. Honestidade sobre scaffolding preventivo > completude defensiva.

Cross-refs atualizadas em `roadmap.md`, `README.md`, `debts.md`.

### 2026-04-23 — Wave governance: criar Onda 6/7 + reclassificação + formalização

Revisão estrutural das Ondas após analisar CPs abertos. Dois achados:

**1. Ondas 6 e 7 criadas** — havia 8 CPs órfãos sem wave original (adicionados depois das Ondas 1-5 serem propostas):

- **Onda 6 — Infra hardening pequeno**: CP-10 (Docker SHA pin), CP-11 (HEALTHCHECK deep), CP-12 (wait-for-db), CP-49 (react/react-dom sync). Agrupar em 1 PR batch. Todos S, independentes, infra-only.
- **Onda 7 — Tooling migrations**: CP-46 (ultracite 6→7, L), CP-47 (better-auth 1.4→1.6, L), CP-48 (Zod 4.1→4.3, M), CP-50 (TypeScript 5.9→6.x, M, contenção atual). PRs dedicados, ordem de risco crescente, janela de teste.

**2. Ordem de execução atualizada** no `roadmap.md` § "Ordem de execução recomendada":

| Prioridade | CP | Onda | Racional |
|---|---|---|---|
| 🔴 1 | CP-38 (runbook oncall) | 5 | Valor operacional imediato |
| 🟡 2 | CP-44 (BOLA AST) | 5 | Security preventive |
| 🟡 3 | CP-41 (Pagarme tests) | 3 | Fecha Onda 3 |
| 🟡 4 | Onda 6 batch | 6 | Quick wins |
| 🟡 5 | CP-17 (métricas) | 4 | Observability gap |
| 🟢 6 | Cloudflare seq | 4 | Bloqueio externo |
| 🟢 7 | Onda 7 seq | 7 | Janela dedicada |
| ⏸️ 8 | CP-2 (emails) | 5 | Bloqueado #269 |

Projeção: completando 1-5 (~12-16h), bucket 🟡 fica reduzido a itens externamente bloqueados ou em janela dedicada. "Trabalho planejável" termina.

### 2026-04-23 — Reclassificação de CP→MP + formalização de candidatos

Revisão honesta dos CPs abertos aplicando o critério "tem sinal pressing hoje vs esperando sinal futuro". Resultado: 2 CPs reclassificados para MP, 2 candidatos formalizados como MP.

**Reclassificações CP → MP**:

- **CP-18 → MP-24** (deprecation headers `Deprecation`/`Sunset`). Destravado por CP-3 mas preventivo para evento que não está no radar. Sinal para ativar: primeiro breaking change real planejado em endpoint público.
- **CP-19 → MP-25** (Playwright E2E em CI). E2E é investimento caro de manter; `app.handle()` + factories cobrem fluxos integrados hoje. Sinal: 2+ regressões UX detectadas em prod (não em CI) OU equipe cresce.

**Candidatos formalizados como MP**:

- **MP-23** (field-level authz em responses) — era candidato no README desde sync pass do CP-53 Fase 1. Formalizado. Débito #98 coberto. Sinal: requisito concreto do cliente OU auditoria LGPD Art. 18 gap OU enterprise RBAC.
- **MP-26** (paginação padronizada) — era candidato CP-51 no README. Agora MP formal. Débito #97. Sinal: 5+ endpoints paginados OU bug real de `.max()` esquecido OU planejamento de cursor pagination.

**CP-2 (emails consolidation) mantido como CP** — usuário avaliou e preferiu manter. Segue bloqueado por issue #269 (flakes state leak).

**Contadores atualizados**:
- Bucket 🟡: 50 ações · 32 concluídas · **15 ativas** (era 17) · 2 reclassificadas · 1 contenção
- Bucket 🟢: **26 ações** (era 22) · nenhuma investida · aguardar sinal

**Princípio reforçado**: distinguir "committed para 30-90d" (CP) de "sob demanda, sinal-driven" (MP) mantém o bucket 🟡 focado em valor operacional pressing e dá honestidade sobre o que é scaffolding preventivo. Cross-refs atualizadas em `roadmap.md`, `principles.md`, `debts.md`, `README.md`.

### 2026-04-23 — OQ-14 resolvida: política de 2 classes para erros de email (commit `42699a0`)

Formalizada política de erro em emails, aplicada via novo helper `sendBestEffort` em `src/lib/email.tsx`:

**Críticos** (propagam erro — user espera feedback):
- `sendVerificationEmail`, `sendPasswordResetEmail`, `sendTwoFactorOTPEmail`, `sendOrganizationInvitationEmail`, `sendContactEmail`
- Admin actions síncronas: `sendCheckoutLinkEmail` (self-service), `sendCancellationScheduledEmail`, `sendPriceAdjustmentEmail`, `sendUpgradeConfirmationEmail`

**Best-effort** (log + swallow — operação principal já commitada):
- Listeners de payments (já tinham `try/catch` individual — sem mudança)
- Cron jobs em `jobs.service.ts` (já tinham `try/catch` — sem mudança)
- **4 call sites convertidos neste commit**:
  1. `plan-change.service.ts::sendPlanChangeEmail` — cron-triggered, email falhar antes quebrava o job impedindo outros scheduled changes
  2. `admin-provision.service.ts::createCheckoutProvision` — admin triggered, email falhar dava 500 mesmo com org+checkout persistidos
  3. `admin-provision.service.ts::sendRegenerationEmail` — regenerate checkout, mesma lógica
  4. `lib/auth/hooks.ts::sendPasswordResetForProvisionOrDefault` — fallback para `sendPasswordResetEmail` default se provision activation falhar (user nunca fica sem email)

Helper usado com log type padronizado `<module>:<action>:failed` permitindo alerting Sentry uniforme:

```ts
await sendBestEffort(
  () => sendPlanChangeExecutedEmail({ ... }),
  { type: "plan-change:executed-email:failed", organizationId, ... }
);
```

Validação: 262/262 tests afetados (auth + plan-change + admin-provision + jobs), bunx tsc + ultracite clean.

**OQ-14 fechada** em `docs/improvements/open-questions.md`. Resta 7 OQs abertas aguardando análise do dono.

### 2026-04-23 — CP-53 Fase 2 entregue: 10 fixes objetivos em `src/lib/` (PR #271)

Executa fixes de qualidade identificados na Fase 1 do CP-53 **que não dependem de Open Questions estratégicas**. Escopo disciplinado após pushback válido do dono:

> "porque deletar ValidationError e InternalError, não iremos utilizar? algo que você está sugerindo é over engineering?"

Cortados da proposta original (over-engineering detectado e removido):

- **Reverted**: deletar `ValidationError`/`InternalError` — scaffolding coerente da hierarquia HTTP, custo de manter = 5 linhas, churn de deletar = iminente
- **Dropped**: extrair helper `assertNoActiveSubscription` — duplicação em 2 lugares não justifica abstração (rule of three)
- **Dropped**: estender `buildAuditEntry` com ipAddress/userAgent — YAGNI, nenhum caller passa
- **Dropped**: derivar `SuccessResponse<T>` TS type via z.infer — duplicação mínima, risk de tipos estranhos
- **Dropped**: exportar `RequestContext` type — "for extensibility" sem consumer = YAGNI
- **Dropped**: narrow `AppError.status` para `HttpErrorStatus` — blast radius de 25 errors.ts. Type exportado, sweep fica pra futuro
- **Dropped**: converter `beforeRemoveMember` para async — ultracite `useAwait` falha em async sem await; trade-off atual é o válido

**10 commits atômicos** na branch `refactor/cp-53-lib-quality-fixes`:

| # | Commit | Severidade | Escopo |
|---|---|---|---|
| 1 | `71c16fa` refactor(logger+sentry): redact PII in logs + Sentry event body (CP-54) | 🔴 LGPD | Pino `redact.paths` cobrindo auth headers, campos PII brasileiros (cpf, rg, pisPasep, ctps, salary, hourlyRate, birthDate, cid), `password`, `card.*`. Sentry `beforeSend` estendido para scrub recursivo de `event.request.data` via `PII_FIELDS` de `modules/audit/pii-redaction.ts` — single source of truth. |
| 2 | `d34dcc3` refactor(auth/hooks): 6 code smells | 🔴 hygiene | Silent `.catch(() => {})` em `activateAdminProvisionOnLogin` → log estruturado com userId. URL token extraction em `sendPasswordResetForProvisionOrDefault` ganha fallback pro default reset se extraction falhar. Defensive `?.` em `db.query.adminOrgProvisions` removido (2 lugares). Cast `roleValues as readonly string[]` inline no use site. `UserCreateResult` union 3-variantes simplificado para shape único. Tipo `Record<string, unknown>` em `validateCanCreateOrganization` trocado por `User & { role?: string; email: string }`. |
| 3 | `efbdf38` refactor(auth): extract 6 organization lifecycle callbacks to hooks.ts | 🟡 convention | 6 callbacks inline em `lib/auth.ts` (5-10 linhas cada) extraídos como `on<Event>` (`onOrganizationUpdated`, `onOrganizationDeleted`, `onInvitationAccepted`, `onMemberRoleUpdated`, `onMemberAdded`, `onMemberRemoved`). Alinha com convenção documentada em `lib/auth/CLAUDE.md`. `auth.ts` reduziu de 339→230 linhas. Comentário de `sendVerificationEmail` atualizado (antes falava só de admins, invitees também caem). |
| 4 | `edfa6db` docs(audit-helpers): document why auditOrganizationUpdate lacks before state | 🟢 clarity | Comentário inline explica que BA's `afterUpdateOrganization` hook não expõe pre-update state. Para obter diff `before/after` seria preciso adicionar `beforeUpdateOrganization` hook + stash em ALS. Fora do escopo deste audit. |
| 5 | `cc79fd5` refactor(email): extract hardcoded recipients to env + requireTLS in prod | 🟡 config | Débitos #70 (hardcoded `"contato@synnerdata.com.br"`) e #71 (SMTP_USER como destino admin) fechados. Novas env vars: `CONTACT_INBOX_EMAIL` (default preserva comportamento), `ADMIN_NOTIFICATION_EMAIL` (opcional). `requireTLS: env.NODE_ENV === "production" && env.SMTP_PORT !== 465` explícito — STARTTLS garantido em SMTP 587 prod. |
| 6 | `3793320` fix(auth/admin-helpers): normalize admin allowlist | 🔴 silent bug | `env.SUPER_ADMIN_EMAILS` / `ADMIN_EMAILS` agora são normalizados (trim + lowercase). `applyAdminRolesBeforeUserCreate` também lowercase `user.email` antes de comparar. Antes: `"Admin@X.com"` no env não batia com user.email `"admin@x.com"` — signup não atribuía role admin, sem erro visível. |
| 7 | `9d23a4c` refactor(date-helpers): validate inputs + document semantics | 🟢 robustness | `isFutureDate`/`isFutureDatetime` agora explicit `Number.isNaN(getTime())` check. `calculateDaysBetween` throw `RangeError` em input inválido (era NaN silencioso). JSDoc documenta timezone (server-local em `isFutureDate`, UTC em `calculateDaysBetween`) e `+1` inclusive count. |
| 8 | `4dcc171` refactor(shutdown): portable sleep + exit code + pool.end timeout | 🟡 resilience | `Bun.sleep` → wrapper `setTimeout`-Promise (portabilidade — `type ElysiaLike` sugeria abstração). `process.exit(0)` hardcoded → `exit(dbClosedCleanly ? 0 : 1)` — supervisor (Docker/k8s) detecta falha de teardown. Novo `withTimeout(pool.end(), dbCloseTimeoutMs)` — evita hang indefinido em pool travado. |
| 9 | `b2384de` docs(zod-config): document side-effect contract | 🟢 clarity | JSDoc header em arquivo de 3 linhas. Documenta: side-effect, import once no bootstrap, locale pt-BR global, override per-schema. |
| 10 | `cb61820` refactor(base-error+responses): tighten types and add HttpErrorStatus alias | 🟡 types | Type `HttpErrorStatus = 400 \| 401 \| 403 \| 404 \| 409 \| 422 \| 429 \| 500` exportado de `base-error.ts`. Não aplicado a `AppError.status` agora (blast radius de 25 errors.ts em modules/). Disponível para sweep futuro. `paginationMetaSchema` campos agora `z.number().int().nonnegative()` — OpenAPI gera `type: integer, minimum: 0` ao invés de `type: number`. |

**Validação consolidada**:
- `bunx tsc --noEmit` clean após cada commit
- `npx ultracite check` clean (583 files)
- 707/707 tests afetados passam (lib/* + plugins/* + auth + admin/api-keys + payments/webhook + organizations/profile + employees + medical-certificates)

**Débitos fechados**: #70 (hardcoded contact email), #71 (SMTP_USER misuso como admin). #73 (transporter conditional) parcialmente endereçado via `requireTLS`.

**Blocked**: fixes que dependem de OQs permanecem pendentes (Fase 3). Ver [open-questions.md](./open-questions.md) para as 15 questões.

### 2026-04-23 — CP-53 Fase 1: auditoria de qualidade de `src/lib/` (25 arquivos)

Auditoria completa de todos os arquivos de `src/lib/` focada em **qualidade de implementação** (idiomatic patterns, bad patterns, code smells, dead code, duplications, type safety). Feita após CP-52 (reorganização estrutural) — agora que a organização está firmada, revisar o que está dentro.

**Método:**
- 8 arquivos triviais (<20L ou óbvios) auditados pelo parent diretamente (`cors.ts`, `zod-config.ts`, `request-context.ts`, `schemas/*`, `responses/envelope.ts`, `sentry/*`).
- 17 arquivos restantes (2328L) distribuídos em **8 agentes `general-purpose` em paralelo**, cada um com prompt triangulando 3-4 fontes:
  1. Docs oficiais via `context7` (Elysia, Better Auth, Zod, Pino, Nodemailer)
  2. Community via `WebSearch` (GitHub discussions, OWASP, best practices 2025)
  3. `avocado-hp` pareado em `~/Documentos/avocado-hp/avocado-hp/apps/server/src/lib/`
  4. Julgamento próprio do agente (sem tomar nenhuma fonte como verdade única)
- Formato de output fixo por arquivo: Implementation quality + Real issues + Matters of taste (skip) + Preservar + Action proposta + Open Questions.

**Disciplina aplicada**: focus em qualidade de código, perguntas estratégicas ("deveria existir?", "qual é a política?") vão pra `open-questions.md` em vez de virar fixes por conta própria.

**Categorias de code smells detectadas** (inventário, não exaustivo):

| Categoria | Exemplos |
|---|---|
| Dead code | `plan` resource sem macro, 3 errors unused, `Timeout.withTimeout` zero consumers, `passwordComplexityRules` export órfão |
| Duplicação de source of truth | `ownerPerms` vs `orgStatements`, `ErrorResponse` TS type vs `errorSchema<C>()` Zod, `PII_FIELDS` duas listas |
| Silent error swallowing | `.catch(() => {})` em admin-provision, empty `catch {}` em extractErrorMessages, welcome email sem contexto |
| Defensive noise | `?.` em `db.query.adminOrgProvisions` (sempre existe), `UserCreateResult` union 3-variantes |
| Magic numbers | `apiKey.rateLimit.maxRequests: 200`, `gracePeriodMs = 5000` sem justificativa |
| Type safety violations | `as any`, cast derruba enum (`roleValues`), `User & Record<string, unknown>` |
| Inconsistent conventions | Params `email:` vs `to:` em email senders, positional vs object-params em audit wrappers |
| Over-coupling | `Bun.sleep` em shutdown quando tipo sugere abstração |
| Missing defense-in-depth | Sem `AbortSignal` em retry, sem `maxDelayMs`, sem jitter (thundering herd), sem `redact` PII em Pino, sem scrub body em Sentry, sem `requireTLS` em SMTP prod |
| Fragile implementations | URL `split("/")` pra extrair reset token, Zod v4 internals walk, reflection em private APIs |
| Race conditions | `validateUniqueRole` findFirst → insert sem unique partial index |
| Async anti-patterns | `Promise.resolve()` em função não-async, 19 `sendMail` sem error handling |
| Standards drift | OWASP ASVS 2023+ deprecou composition rules em password, CNPJ alfanumérico julho/2026 não suportado |
| Testing smells | Tautologias em `timeout.test.ts`, timing-bound flaky em `retry.test.ts` |

**Resultado consolidado:**

- **🔴 4 itens de alta prioridade** (fix agora):
  1. PII redaction em Pino + Sentry scrub body (LGPD gap) — CP-54 (S)
  2. Dead code sweep (3 errors + Timeout + permissions dead resources) — CP-55 (S+M)
  3. `auth/hooks.ts` cleanup batch de 8 smells — CP-56 (M)
  4. CNPJ alfanumérico (Receita Federal jul/2026) — CP-57 (M, tracking)

- **🟡 6 itens de média prioridade** (fix quando tocar):
  - `utils/retry.ts` gaps (jitter, AbortSignal, maxDelayMs, 429, network detect) — CP-58 (M)
  - `auth/audit-helpers.ts` inconsistências (shape, params) — S
  - `lib/auth.ts` cleanup (`beforeRemoveMember` async, mover 6 callbacks) — S
  - `openapi-helpers.ts` + `openapi-enhance.ts` contrato divergente — CP-59 (M)
  - `email.tsx` 3 fixes independentes (hardcoded contact, SMTP_USER misuso, requireTLS) — S pré-CP-2
  - `responses/response.types.ts` + `errors/base-error.ts` double-source-of-truth — S

- **🟢 6 itens de baixa prioridade** (nice-to-have)
- **✅ 5 arquivos limpos** — não tocar

**Open Questions identificadas** (15 totais) — registradas em [open-questions.md](./open-questions.md):

- OQ-1 (pré-existente): Estratégia de proteção PII em repouso (wire-up, deletar, ou documentar status quo)
- OQ-2: `member`/`invitation`/`billingProfile` em orgStatements — docs ou macro?
- OQ-3: `triggerAfterCreateOrganizationEffects` fire-and-forget intencional?
- OQ-4: Algo não-merged usa `Timeout.withTimeout`?
- OQ-5: `apiKey.rateLimit: 200` documentado ou parametrizado por env?
- OQ-6: `super_admin` vs `admin` idênticos — intencional?
- OQ-7: `RateLimitedError` retryAfter: details ou first-class?
- OQ-8: `passwordComplexityRules` consumido por FE?
- OQ-9: Cliente com CNPJ alfanumérico pós-julho/2026?
- OQ-10: Jitter default=true quebra testes timing-based?
- OQ-11: `deleteUser` self-reference deveria virar endpoint custom em modules/auth/?
- OQ-12: `x-error-messages` FE espera semântico ou Zod-internal?
- OQ-13: Migrar pra `.meta({ errorMessages })` vs reflection?
- OQ-14: Política de erro em emails: throw crítico vs engole notificação?
- OQ-15: SMTP pool — qual provedor de produção + volume projetado?

**Próximo passo**: consolidar OQs com o dono em batch (1 reunião pra desbloquear 15 perguntas), então executar CPs 54-60 em ondas conforme decisões. Arquivos em `🟢 baixa prioridade` esperam próxima onda.

**Validação do método** (meta):
- Zero agente mergeou código ou fez push — audit-only preservado.
- Nenhuma fonte foi tomada como verdade única — triangulação efetiva em todos os agentes.
- Descobertas extras além do escopo inicial: `lib/pii.ts` zero consumers (descoberto antes de dispatching), `Timeout.withTimeout` zero consumers (agent 6), dead resources em permissions (agent 2), CNPJ alfanumérico (agent 7).
- Custo: ~8 spawns paralelos + ~5 min wall clock vs ~2-3h sequencial.

### 2026-04-23 — CP-52 entregue: reorganização interna de `src/lib/` (Opção B)

Audit pontual disparado pelo dono após o sync pass de `principles.md` — preocupação válida com organização interna de `lib/` (27 arquivos misturados, alguns subdirs single-file com overhead sem payoff, concerns de Better Auth espalhados em 4 lugares). Executado como **pure move** — zero mudança de comportamento. Observações de qualidade foram anotadas mas **não fixadas** neste PR (serão o próximo CP de code review por arquivo).

**3 commits atômicos por concern:**

**Commit 1 — `refactor(lib): flatten single-file subdirs + dedup isFutureDate`**

Achatados 4 subdirs que tinham 1 arquivo só (`crypto/`, `openapi/`, `shutdown/`, `validation/`):

- `src/lib/crypto/pii.ts` → `src/lib/pii.ts`
- `src/lib/openapi/error-messages.ts` → `src/lib/openapi-helpers.ts`
- `src/lib/shutdown/shutdown.ts` → `src/lib/shutdown.ts`
- `src/lib/validation/documents.ts` → `src/lib/document-validators.ts`

Tests movidos para `src/lib/__tests__/` (colocalizados com os arquivos no root de lib/).

**Dedup silencioso**: `src/modules/employees/employee.model.ts:6-11` declarava `isFutureDate` inline — idêntico ao helper em `lib/schemas/date-helpers.ts` que todos os outros occurrences importam. Removido o inline; passa a importar do helper.

**Observação de qualidade anotada (não fix)**: `src/lib/pii.ts` tem **zero consumidores em produção**. `env.PII_ENCRYPTION_KEY` está validado e o util tem 155 linhas com 186 linhas de teste, mas `PII.encrypt/decrypt/mask` não são usados em lugar nenhum. Ou é infraestrutura pronta para futuro uso, ou alguém esqueceu de wire-up em campos sensíveis do DB. Candidato a investigar em CP-52 follow-up.

**Commit 2 — `refactor(lib): group Better Auth concerns under lib/auth/`**

- `src/lib/permissions.ts` → `src/lib/auth/permissions.ts`
- `src/lib/password-complexity.ts` → `src/lib/auth/password-complexity.ts`
- `src/lib/__tests__/permissions.test.ts` → `src/lib/auth/__tests__/permissions.test.ts`

Raciocínio: ambos eram concerns exclusivos do Better Auth (access control statements + hook de senha), mas viviam soltos no topo de `lib/`. Mantenedor novo olhando `lib/auth/` não encontrava esses arquivos. 5 import sites atualizados. `lib/auth/CLAUDE.md` atualizado com inventário + consumers.

Consumers confirmados — todos no universo auth:
- `permissions`: `api-key.service` (DEFAULT_API_KEY_PERMISSIONS), `auth-guard/options` (types), test helpers, `lib/auth.ts`
- `password-complexity`: só `lib/auth.ts` (hook `emailAndPassword.password.hash`)

**Commit 3 — `refactor(lib): group Sentry concerns under lib/sentry/`**

- `src/lib/sentry.ts` → `src/lib/sentry/init.ts`
- `src/lib/error-reporter.ts` → `src/lib/sentry/reporter.ts`

4 import sites atualizados. Novo `src/lib/sentry/CLAUDE.md` documentando: (a) `init.ts` é side-effect, importado no bootstrap via `import "@/lib/sentry/init"`; (b) `reporter.ts` existe por causa de ESM hoisting em Bun (mock.module não intercepta named imports — ver CP-6 follow-up); (c) **nunca** importar `captureException` direto do `@sentry/bun` em código de produção.

**Débitos fechados:**

- **#4** — `lib/request-context.ts` + `lib/request-context/` convivendo → verificado que dir não existe mais (resolvido em CP-1 sem marcação)
- **#6** — `lib/__tests__/` inconsistente → agora contém apenas tests de arquivos no root de `lib/`, que é colocalização válida (test ao lado do código, mesmo nível). Subdir files têm tests no próprio subdir. Padrão consistente

**Estado final de `src/lib/`:**

Antes: 10 arquivos soltos + 9 subdirs (4 com 1 arquivo só) = 19 entries no topo.
Depois: 9 arquivos + 6 subdirs = 15 entries no topo, cada subdir justifica sua existência (≥2 arquivos OU agrupamento semântico forte tipo `lib/auth/`).

**Validação:**
- `bunx tsc --noEmit` clean em todos os 3 commits
- `npx ultracite check` clean em todos os 3 commits (4 auto-fixes de ordem de imports entre commits 2 e 3)
- 278+ tests afetados rodaram verdes (pii, shutdown, document-validators, employees, branches, organizations/profile, auth hooks, api-keys, error-handler, webhook)

**Observações de qualidade anotadas para CP-53 (pass futuro de code review por arquivo):**

1. `lib/pii.ts` — 155 linhas de código + 186 linhas de teste, zero consumidores em produção. Investigar wire-up ou considerar deletar.
2. `lib/auth/hooks.ts` — 368 linhas (maior arquivo de `lib/`). 11 callbacks extraídos de `auth.ts` em CP-4. Não revisados criticamente — são mix de auth + organization + provision + subscription concerns.
3. `lib/auth/audit-helpers.ts` — 200 linhas. 10 wrappers `auditXxx` + `buildAuditEntry`. Já consolidado em CP-33 mas não auditado por qualidade.
4. `lib/email.tsx` — 479 linhas, sabido (#8/#9/CP-2, bloqueado por issue #269).

**Próximo passo sugerido**: CP-53 (candidato) — pass de qualidade por arquivo em `src/lib/` após CP-52, com foco em "é o padrão idiomático do Elysia?" + "existe simplificação sem perda de feature?". Use Compozy pipeline para ações M.

### 2026-04-23 — Doc sync pass: `principles.md` alinhado com realidade

Revisão pós-Onda 5 para consolidar o estado da documentação antes de avançar para CP-38/CP-44/CP-2. Tabela de audit da Fase 1 nunca tinha sido atualizada após as 54 resoluções; itens `?` ficaram pendurados sem classificação. Aproveitada também a oportunidade para arquivar legados e fechar inconsistências de path pós-PR #268.

**Tabelas de audit em `principles.md` sincronizadas (9 Status + 7 `?` classificados):**

| § | Item | Era | Virou | Por quê |
|---|---|---|---|---|
| 4.1 #5 | Env validation | ⚠️ | ✅ | RU-1 + CP-31 + CP-39 aplicados |
| 4.1 #8 | Request timeout | ❌ | ✅ | RU-3 (`serve.idleTimeout: 30`) |
| 4.1 #11 | Max page size | ? | ⚠️ | 4/4 endpoints OK; falta schema compartilhado (débito #97 novo) |
| 4.1 #16 | requestId no body | ❌ | ✅ | RU-2 (`error.toResponse(requestId)`) |
| 4.1 #18 | Dependency audit | ⚠️ | ✅ | RU-4 + CP-40 (`bun audit --audit-level=high`) |
| 4.2 #4 | `/v1` versionamento | ⚠️ | ✅ | CP-3 (composer `src/routes/v1/`) |
| 4.2 #5 | Response filtering | ? | ✅ | Padrão `successResponseSchema()` aplicado em todos os controllers |
| 4.2 #6 | Paginação padronizada | ? | ⚠️ | Sem schema compartilhado (débito #97 novo) |
| 4.2 #8 | Integration tests CI | ⚠️ | ⚠️ | RU-5 resolveu semântica; CP-41 (Pagar.me) + CP-19 (Playwright) pendentes |
| 4.2 #10 | Backup automatizado | ⚠️ | ✅ | RU-10 + CP-45 |
| 5.1 #3 | BOLA | ⚠️ | ✅ | RU-9 (50 services auditados + 12 cross-org tests) |
| 5.1 #5 | Audit log | ⚠️ | ✅ | RU-6/7/8 + CP-33/42/43 — LGPD 100% endereçado |
| 5.2 #1 | Security headers/CSP | ⚠️ | ✅ | CSP deferido formalmente em MP-20 (API JSON pura) |
| 5.2 #3 | Compression | ❌ | 🟡 deferred | CP-15 Cloudflare (bloqueado por CP-14 DNS do cliente) |
| 5.2 #4 | HTTP/2 no edge | ? | 🟡 deferred | Idem CP-15 |
| 5.2 #6 | Retention logs/audit | ? | 🟡 deferred | MP-15 (sinal: auditoria LGPD formal) |
| 5.2 #7 | Data minimization | ? | ⚠️ | Audit redaction OK (CP-42); field-level authz virou débito #98 novo |
| 5.2 #9 | Content negotiation | ? | N/A | API JSON-only — não aplicável |

**Legenda da tabela expandida** em `principles.md` §4 para incluir 🟡 deferred (coberto por ação de médio prazo ou dependência externa) e N/A (não aplicável ao contexto).

**Débitos novos registrados em `debts.md`:**
- **#97 (🟡)** — Paginação sem schema compartilhado. 4 endpoints declaram `limit/offset` inline em cada `.model.ts`. Extrair `paginationQuerySchema` para `src/lib/schemas/pagination.ts`. Candidato a **CP-51** (S).
- **#98 (🟢)** — Sem field-level authorization em responses. `viewer` vê os mesmos campos que `owner` (inclusive `salary`, `cpf`). Investir só com requisito concreto. Candidato a **MP-23**.

**Arquivamento de legados:**
- `docs/improvements/api-maturity-plan.md` (2342 linhas, última atualização 2025-12-15 — pré-audit) → `docs/improvements/legacy/api-maturity-plan.md`
- `docs/improvements/deployment.md` (pré-audit) → `docs/improvements/legacy/deployment.md`
- `docs/improvements/legacy/README.md` criado documentando que são históricos e **não devem ser atualizados**; aponta para os docs vivos (o split em 6 arquivos feito em PR #268) + runbooks em `docs/runbooks/`

**Consistência de paths pós-PR #268** (`plugins/auth→auth-guard`, `errors→error-handler`, `logger→request-logger`):
- `README.md:30` descrição de CP-4 atualizada (`plugins/auth/*` → `plugins/auth-guard/*`)
- `debts.md` débito #49 resolvido: path + nota sobre rename PR #268
- `roadmap.md` CP-1 e CP-4 com nota `_Paths refletem rename do PR #268; à época eram `plugins/{logger, errors, auth}`._`
- **Não tocado**: entries históricas no próprio `changelog.md` (são snapshots de data × path × ação; corrigir seria mentir sobre o passado)

**Fixes menores:**
- `debts.md` #76: `bun pm audit` → `bun audit` (comando foi renomeado entre Bun 1.2.x e 1.3.x; `lint.yml:42` usa a forma atual)

**Atualizações no `README.md`:**
- **CP-2 (XL) marcado como BLOQUEADO por issue #269** — flakes não-determinísticos em suite grande (signup welcome email + trial constraint + cpf-analyses list), descobertos no CI do PR #268. Resolver #269 antes de iniciar CP-2 ou o refactor de emails ficará com testes não-confiáveis.
- Navegação ganhou entry `legacy/` com aviso.
- Contadores atualizados: 98 débitos totais (era 96), 42 abertos (era 40).
- "Candidatos pós-sync" seção nova listando CP-51 e MP-23 para próximo review do roadmap.

**Por que isso importa:** `principles.md` é a primeira leitura para entender maturidade. Com 9 Status desatualizados, um leitor novo pensa que temos gaps que já não existem — ou pior, tenta resolver algo que já foi resolvido. A tabela agora reflete o que o código realmente tem em 2026-04-23.

**Validação:**
- ✅ `env.ts` conferido linha a linha contra as claims de RU-1/CP-31/CP-39
- ✅ `index.ts` conferido contra RU-3 + RU-2 + CP-27
- ✅ `error-plugin.ts` + `base-error.ts::toResponse` conferidos contra RU-2
- ✅ `lint.yml:42` conferido (`bun audit --audit-level=high`)
- ✅ `src/plugins/` listado — match com `src/index.ts:16-21`
- ✅ 4 `*.model.ts` com paginação inspecionados — padrão idêntico confirmado

### 2026-04-23 — Onda 5 PR #8 entregue (CP-3): `src/routes/v1/` composer centraliza `/v1`

- **CP-3 (L)** — worktree `.worktrees/refactor/cp-3-routes-v1` + plano formal local (gitignored). 5 commits atômicos: refactor principal, smoke tests, cbo assertion fix, docs modules, bootstrap grouping + docs infra.
- **Decisão de escopo pré-execução** (3 decision points levantados no plano e confirmados pelo dono antes de tocar código):
  - **Prefix `/v1/` (não `/api/v1/`)** — audit Fase 1 confirmou que o codebase nunca usou `/api/v1/` (só `/api/auth/*` do Better Auth). Mover para `/api/v1/` seria breaking para FE + ~185 tests + clientes externos, e CP-18 (que entrega deprecation headers) depende de CP-3 (chicken-egg). Interpretação firmada: "alinhar prefix" da checklist = "padronizar prefix único e centralizado" — que na prática é `/v1/`.
  - **Normalizar audit `/audit-logs` → `/v1/audit-logs`** — único controller fora do padrão; breaking change aceito pela superfície pequena (1 test file, owner-only endpoint).
  - **Débito #42 via comentários de bloco** — em vez de extrair `registerInfra(app)`/`registerMiddleware(app)`, 5 comentários `// ---` agrupando os blocos semânticos em `src/index.ts`. Custo zero, ganho de legibilidade alto.
- **Arquitetura do composer** (`src/routes/v1/index.ts`): Elysia com `prefix: "/v1"` que `.use()` os 7 controllers top-level (organizations, employees, occurrences, payments, audit, admin, public). Controllers perdem `/v1/<resource>` dos próprios `prefix:` — sobra apenas o path relativo de domínio (`/branches`, `/employees`, `/payments`, `/audit-logs`, `/admin`, `/public/<name>`). Elysia concatena automaticamente via a cadeia de `.use()`, então URLs finais são preservadas exceto pelo audit.
- **Arquivos tocados** (30 modificados + 1 novo no refactor principal):
  - **Create** — `src/routes/v1/index.ts` (composer), `src/routes/v1/__tests__/routes-v1.test.ts` (smoke tests: 13 casos).
  - **Bootstrap** — `src/index.ts` perdeu 7 imports + 7 `.use()` de controllers, ganhou 1 `import { routesV1 }` + 1 `.use(routesV1)`. Agrupamento semântico via 5 comentários `// ---` separando: Core infra, HTTP middleware, Auth + docs, Background jobs, Versioned API routes. **Fecha #42**.
  - **Test helpers** — `src/test/support/app.ts` (68 consumers) e `src/test/helpers/app.ts` (126 consumers) ambos consolidados no `routesV1`. Fix silencioso de bug pré-existente: `helpers/app.ts` tinha `cboOccupationController` mountado redundantemente (já está dentro de `organizationController`) e não montava `publicController`. Com o composer, ambos erros somem.
  - **25 controllers** — strip de `/v1/` do `prefix:` via `sed` (9 orgs + 10 occurrences + 3 public + 3 aggregators).
  - **audit migration** — `src/modules/audit/__tests__/get-audit-logs.test.ts` 12 refs `/audit-logs` → `/v1/audit-logs`.
  - **Docs** — `src/modules/audit/CLAUDE.md`, `src/modules/CLAUDE.md`, `src/modules/admin/CLAUDE.md`, `src/modules/public/CLAUDE.md` atualizados para refletir a nova convenção (domain prefix no controller, `/v1/` injetado pelo composer).
- **Gotcha mapeado durante execução** (virou fix transparente): formatter hook (`biome/ultracite`) removeu o novo `import { routesV1 }` dos arquivos entre o edit do import e o edit da cadeia `.use()` — deu 404 em todos os tests porque `routesV1` ficou `ReferenceError` em runtime. Solução: re-adicionar o import depois do formatter e validar que o run completou sem o import sumir de novo. Probe rápido em `src/test/_route-probe.ts` (deletado após validar) confirmou prefix concatenation funcionando: `/v1/branches` → 401, `/branches` → 404, `/v1/audit-logs` → 401, `/audit-logs` → 404.
- **Zero regressão**: 841 tests existentes passam (audit 14 + orgs/cbo 105 + occurrences/public 147 + employees/admin 150 + payments 425). + 13 novos smoke tests do composer = 854 tests. `npx ultracite check` clean em 581 files.
- **Smoke test pattern**: cada um dos 8 top-level domains valida 1 endpoint representativo (`/v1/branches`, `/v1/employees`, `/v1/absences`, `/v1/payments/plans`, `/v1/audit-logs`, `/v1/admin/api-keys`, `/v1/public/newsletter/subscribe`, `/v1/cbo-occupations?search=xx`). Mais 3 negativos: paths pre-refactor `/audit-logs`, `/branches`, `/employees` devem 404. Mais 2 de contorno: `/health` 200 (fora de `/v1/`), `/v1/health` 404 (health plugin intencionalmente externo ao composer). cbo-occupations ajustado pós-revisão do dono: original usava `not.toBe(404)` (workaround porque validação de query dispara antes de auth); versão final passa `?search=xx` (cumpre `min(2)` do schema) pra atingir o 401 estrito igual aos outros 7 domains.
- **Destrava CP-18** — versionamento centralizado num único ponto habilita evolução futura (ex: `src/routes/v2/` convivendo com `/v1/` para deprecation window). CP-18 agora pode emitir headers `Deprecation`/`Sunset` scoped por versão.
- **PR #8** da Onda 5 — branch `refactor/cp-3-routes-v1`.

### 2026-04-23 — Onda 5 PR #7 entregue (CP-6 follow-up): `ErrorReporter` wrapper fecha débito de testabilidade

- **Follow-up explícito** do débito declarado no corpo de PR #263 (CP-6, commit `947ae4d`): a chamada `captureException(error, { tags })` dentro do catch do `webhook.service.ts` não tinha teste unitário porque `spyOn` / `mock.module` em named import ESM não intercepta a const local já capturada no load do módulo.
- **Solução (Opção A — wrapper)**: novo `src/lib/error-reporter.ts` expõe `ErrorReporter.capture(error, context?)` wrapping `captureException` do `@sentry/bun` diretamente. Consumers chamam `ErrorReporter.capture(...)` — property access em objeto compartilhado, trivialmente mockável via `spyOn(ErrorReporter, "capture")`.
- **Migração de 3 callsites** (todos os consumers de `captureException` em código de produção): `webhook.service.ts:134` (catch do webhook), `error-plugin.ts:63` (5xx AppError branch), `error-plugin.ts:105` (unhandled error branch). `src/lib/sentry.ts` perdeu o re-export de `captureException` e virou puramente side-effect (init com `beforeSend` PII-stripping); `index.ts` continua importando via `import "@/lib/sentry"`.
- **2 novos tests** (`webhook.error-escalation.test.ts`):
  - (a) `ErrorReporter.capture` invocada com `(error, { tags: { webhook_event_type, pagarme_event_id } })` quando handler do webhook rejeita
  - (b) DB `subscription_events.error` persiste a mensagem + `processedAt` fica null + promise rejeita upstream (anti-regressão contra silent swallow)
- **Suite**: 63 → 65 tests em `webhook/__tests__/`. Full payments suite permanece 448/448.
- **Por que é Opção A (wrapper) e não B (DI) ou C (@sentry/testing) ou D (preload global)**: wrapper é o caminho de menor custo que destrava testabilidade em **todos os 3 callsites** de uma vez, sem poluir signatures (DI) ou alterar config global de tests (preload). Futuros call sites de reporte de erro usam a mesma API.
- **PR #7** da Onda 5 — branch simples `refactor/cp-6-error-reporter` (sem worktree, é S).

### 2026-04-22 — Onda 5 PR #6 entregue (CP-6): webhook Pagar.me hardening

- **CP-6 (M)** — escopo **reframado** após research das docs Pagar.me v5. 3 commits atômicos; branch simples (S/M, sem worktree).
- **Research inicial confirmou** (via context7 em `/websites/pagar_me_reference` + `/pagarme/pagarme-nodejs-sdk` + WebSearch + WebFetch das páginas de webhook e segurança):
  - **HMAC signature não é oferecido** pelo Pagar.me v5 para webhooks — zero menção em docs oficiais, SDK Node.js (457 snippets), ou endpoint `GET /hooks` (response body não contém signature field). Confirma que Basic Auth é a única opção documentada.
  - **IP allowlist de origem de webhooks não é publicada** — a feature "IP Allowlist" documentada da Pagar.me é para o lado oposto (nossa saída chamando a API deles). A lista de IPs de origem dos webhooks existe mas sob demanda via suporte.
  - Decisão do dono: não abrir ticket com suporte; focar em robustez dentro do modelo Basic Auth oferecido.
- **Escopo reformulado** como 4 melhorias na implementação Basic Auth existente + cleanup:
  - **Commit 1** — `refactor(webhook): declarative Zod body validation + drop orphaned _rawBody (CP-6, closes #57)`. Elysia `body: processWebhookSchema` declarativo com `z.looseObject` (passthrough de campos extras do Pagar.me como `account`, `attempts`); 422 via error plugin em malformação. `parse: "text"` removido, `_rawBody` órfão deletado do service e de 36 callsites de teste em 6 arquivos. **Débito #57 fechado**.
  - **Commit 2** — `feat(webhook): log auth failures and silent-skip events (CP-6)`. `logger.warn({ type: "webhook:auth_failure", path, ip, reason })` em cada path de falha do Basic Auth (missing_or_wrong_scheme / invalid_base64 / missing_separator / invalid_credentials). IP extraído via `extractClientIp` reusado de `plugins/auth/validators.ts` (precedente CP-24). `logger.info({ type: "webhook:skipped:missing-metadata" })` em `handleChargePaid`/`handleChargeFailed` quando `metadata.organization_id` ausente. Raw credentials nunca logadas (teste explícito cobre).
  - **Commit 3** — `feat(webhook): sentry capture + unhandled-event-type log (CP-6)`. `captureException(error, { tags: { webhook_event_type, pagarme_event_id } })` no catch block antes do DB error-write + rethrow. Switch default branch emite `logger.info({ type: "webhook:unhandled-event-type", eventType, eventId })` para detectar novos event types adicionados pelo Pagar.me; evento fica como processed para não loopar retry.
- **Rate limit skip para `/webhooks`** foi auditado durante a análise mas descartado como não-urgente: volume MVP atual (<10 webhooks/dia vs 100 req/min global) torna o risco de 429 essencialmente nulo. Diferido como **MP-22** (sob demanda, sinal = primeiro 429 alertado no Sentry ou crescimento da base).
- **Testes**: 47 baseline → 63 (16 novos). Novos arquivos: `webhook.endpoint.test.ts` (7 tests de validação HTTP via `app.handle`), `webhook.observability.test.ts` (7 tests de logging behavior com `spyOn`), `webhook.error-escalation.test.ts` (2 tests de unhandled event type). `captureException` chamada em si não é unit-tested (ESM hoisting em Bun torna `mock.module` para `@/lib/sentry` não-confiável em named imports) — validação por code review + Sentry dashboard em prod.
- **Zero regressão**: 107/107 tests de webhook + integração payments passam (base + novos endpoints).
- **PR #6** da Onda 5 — branch `refactor/cp-6-webhook-hardening`.

### 2026-04-22 — Onda 5 PR #5 entregue (CP-5): `lib/errors/` cleanup + factory `errorSchema`

- **CP-5 (L)** — refactor puro; 6 commits atômicos; plano formal em [`docs/plans/2026-04-22-cp-5-lib-errors-cleanup-plan.md`](../plans/2026-04-22-cp-5-lib-errors-cleanup-plan.md).
- **Relocações de domínio** (3):
  - `src/lib/errors/employee-status-errors.ts` → `src/modules/employees/errors.ts` (extends `EmployeeError` local; 1 consumer, 10 CLAUDE.md atualizados)
  - `src/lib/errors/subscription-errors.ts` split — `SubscriptionRequiredError` criada em `src/modules/payments/errors.ts` extending `PaymentError` (status 403, shape `{ subscriptionStatus }` em details); `FeatureNotAvailableError` consolidada na versão já existente no módulo (mais rica: tem `details: { featureName }`). Auth plugin importa de `@/modules/payments/errors`.
  - `src/lib/helpers/employee-status.ts` → `src/modules/employees/status.ts` (9 occurrence services atualizados; diretório `lib/helpers/` removido — ficou vazio).
- **Dedups**:
  - `NoActiveOrganizationError` em `modules/payments/errors.ts` (status 400, PT-BR message) era **dead code** — zero imports no grep. Removida. A única viva segue em `src/plugins/auth/validators.ts` extending `ForbiddenError` (403), que é o que o macro auth lança.
  - `FeatureNotAvailableError` duplicada (lib vs payments) consolidada na versão do payments.
- **Factory** `errorSchema<C extends string>(code, detailsSchema?)` em `src/lib/responses/response.types.ts` substitui 6 dos 7 schemas hand-rolled (validation, unauthorized, forbidden, notFound, internal, conflict). `badRequestErrorSchema` mantido à parte porque o `code` é `z.string()` genérico, não literal — o contrato da factory assume code literal. `errorResponseSchema` genérico removido (zero consumers fora do arquivo).
- **Delta comportamental**: respostas de `FeatureNotAvailableError` vindas do macro auth (via `validateFeatureAccess`) passam a incluir `details: { featureName }` no envelope — frontend ignora campos desconhecidos, `forbiddenErrorSchema` já não fixava `details`. Mensagem perde a palavra "está" ("não está disponível" → "não disponível"), harmonizando com a versão já vigente para throws via `LimitsService`. Ambos são deltas mínimos, documentados no PR body.
- **Estado final de `src/lib/errors/`**: apenas `base-error.ts` (universal: `AppError` abstract) + `http-errors.ts` (7 errors HTTP genéricos — `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ValidationError`, `ConflictError`, `InternalError`, `RateLimitedError`). Rubrica: `src/lib/errors/` = errors universais HTTP; `src/modules/<domínio>/errors.ts` = errors de domínio.
- **Tests**: afetados passam (employees + occurrences absences/accidents/warnings/vacations + auth plugin + payments/limits). Lint limpo.
- **PR #5** da Onda 5 — worktree `refactor/cp-5-lib-errors-cleanup`.

### 2026-04-22 — Onda 5 PR #4 entregue (CP-26 + CP-28 + CP-32): cleanup pós-plugins

- **Bundle S+S+M** — três CPs destravados pelo CP-1 fechados em um único PR. Todos puros (zero mudança de comportamento runtime).
- **CP-26 (S)** — `extractErrorMessages` movido de `src/index.ts` (28 linhas inline + biome-ignore) para `src/lib/openapi/error-messages.ts`. Destino em `lib/` porque é util puro (não Elysia instance) — respeitando a rubrica estrita de `src/plugins/` firmada em CP-1. Import adicionado no bootstrap; chamada no `mapJsonSchema.zod.override` inalterada.
- **CP-28 (S)** — verificação pós-CP-1 confirmou que `src/lib/audit/` já não existe no repo (foi limpo no próprio CP-1 quando `auditPlugin` migrou para `src/plugins/audit/`). Sem código — só confirmação via `grep -rn "lib/audit"` (zero matches) e marcação no checklist.
- **CP-32 (M)** — `src/plugins/cron/cron-plugin.ts` refatorado com helper interno `createCronJob<T>({ name, pattern, run, log })`. Os 7 jobs declaram apenas schedule + service call + extractor de fields a logar; boilerplate (`async run() { ... logger.info({ type: "cron:<name>", ... }) }`) encapsulado. Genérico `<T>` flui do retorno de `run` para o parâmetro de `log`, preservando inferência do tipo do resultado. Comportamento runtime idêntico.
- **Rubrica de plugins reafirmada**: CP-26 validou na prática que `src/plugins/openapi/` não se justifica enquanto não houver uma Elysia instance encapsulando `openapi()` — pure util vai para `lib/`. `src/plugins/cron/CLAUDE.md` perdeu a seção "Refactor pendente (CP-32)" e ganhou documentação do helper com exemplo de uso e assinatura.
- **Tests**: 32 afetados (`plugins/health`, `payments/jobs.service`, `occurrences/vacation-jobs`) + `bunx tsc --noEmit` limpo. Suite do cron plugin per-se não existe por design (tests vivem nos services que consome — ver CLAUDE.md). Lint limpo.
- **PR #4** da Onda 5 — branch `refactor/cp-26-32-plugins-cleanup` (sem worktree, é S+S+M).

### 2026-04-22 — Onda 5 PR #3 entregue (CP-33): `buildAuditEntry` builder

- **CP-33 (S) — consolidar 10 `auditXxx` em `buildAuditEntry(...)`** no `src/lib/auth/audit-helpers.ts`. Refactor puro, zero mudança de comportamento. Destravado por CP-4 (que colocou `audit-helpers.ts` no lugar).
- **Builder tipado**: `buildAuditEntry(params): AuditLogEntry` aceita `{ action, resource, resourceId, userId, organizationId?, before?, after? }` flat e retorna entry no shape do `AuditService.log`. Conversão `before`/`after` → `changes: { before, after }` é condicional (só cria `changes` se algum dos dois presente — preserva comportamento do `auditLogin` sem `changes`).
- **Types apertados**: params usa `AuditAction` / `AuditResource` enums importados de `@/modules/audit/audit.model` (eram strings soltas antes). Typo em action/resource agora pega na compilação.
- **10 wrappers refatorados**: cada um chama `AuditService.log(buildAuditEntry({...}))`. Shape central single-source.
- **Tests**: 164/164 afetados (`src/modules/auth/__tests__/`, `member-hooks`, `audit/__tests__/`) — paridade com baseline. Lint limpo.
- **PR #3** da Onda 5 — branch `refactor/cp-33-build-audit-entry` (sem worktree, é S).

### 2026-04-22 — Onda 5 PR #2 entregue (CP-4): auth split

- **CP-4 (L) — split `lib/auth.ts` (856→339) e `plugins/auth/auth-plugin.ts` (396→79)** em sub-arquivos focados. Pure refactor, zero mudança de comportamento.
- **`src/lib/auth/`**: `admin-helpers.ts` (getAdminEmails, handleWelcomeEmail), `audit-helpers.ts` (10 auditXxx inclusive auditUserDelete extraído de inline `afterDelete`), `validators.ts` (validateUniqueRole), `hooks.ts` (11 callbacks nomeados — sendPasswordResetForProvisionOrDefault, activateProvisionOnPasswordReset, validateUserBeforeDelete, applyAdminRolesBeforeUserCreate, assignInitialActiveOrganizationId, activateAdminProvisionOnLogin, validateCanCreateOrganization, sendOrganizationInvitationForHook, validateBeforeCreateInvitation, triggerAfterCreateOrganizationEffects, validateBeforeDeleteOrganization).
- **`src/plugins/auth/`**: `options.ts` (AuthOptions, ParsedAuthOptions, parseOptions, needsSubscriptionValidation), `validators.ts` (error classes NoActiveOrganizationError/AdminRequiredError/SuperAdminRequiredError + role/permission/subscription/feature validators), `openapi-enhance.ts` (`OpenAPI` helper — consumido direto por `src/index.ts` sem re-export). `auth-plugin.ts` mantém só o Elysia plugin + macro + `logUnauthorizedAccess` inline (security log do macro).
- **Closure de `auth` preservado**: hooks que chamam `auth.api.*` (ex: `beforeDelete` → `auth.api.deleteOrganization`) ficam inline em `lib/auth.ts`. Só a parte validável (`validateUserBeforeDelete` retorna `orgId | null`) é extraída — evita circular import.
- **Validações**: Better Auth docs confirmaram que todos os hooks aceitam function references nomeadas (signatures estruturais). 0 consumers externos dos helpers privados ou do tipo `AuthOptions` — split puro, sem re-exports. Precedente de pattern: CP-1 (logger split) aplicado aqui.
- **CLAUDE.md atualizados**: `plugins/auth/CLAUDE.md` (seção "Estrutura interna" substitui "Out of scope (CP-4)"), `lib/auth/CLAUDE.md` novo.
- **Destrava CP-33** (consolidação dos 10 auditXxx em `buildAuditEntry(...)`, S, próximo na fila).
- **Tests**: 190/190 afetados passam (plugins/auth + modules/auth + modules/organizations + modules/payments/admin-provision + modules/public/provision-status). Lint limpo.
- **PR #2** da Onda 5 — worktree `feat/cp-4-auth-split`.

### 2026-04-21 — Fase 0 concluída (contexto aplicado)

- **Contexto fechado** (seção 7.1): 6 eixos preenchidos — MVP B2B, multi-tenant, monolito Elysia + Postgres, browser + server-to-server (API key Power BI do cliente), volume baixo, pública sem CDN
- **Compliance mapeado** (seção 7.2): LGPD obrigatória com rigor extra em dados de saúde (atestados médicos, Art. 11); PCI N/A (delegado ao Pagar.me); SOC 2 / ISO 27001 sob demanda; eSocial é scale; NRs trabalhistas ativam retention policy
- **Decisões arquiteturais registradas** (seção 7.3):
  - Cloudflare Free Tier **como etapa final do early-stage** (requer alinhamento com cliente — DNS no registro.br)
  - Sem WAF/CDN no MVP (decisão consciente; app assume responsabilidades do edge)
  - eSocial direto = Scale
  - LGPD tratada como **requisito integrado ao MVP/early-stage**, não fase separada
- **Convenção semântica adotada** (seção 7.6): separar `src/lib/` (utilitários puros) de `src/plugins/` (plugins Elysia) e introduzir `src/routes/v1/` para composição. Migração gradual: novo código no lugar certo, legado migra oportunisticamente
- **Padrão de emails decidido** (débito #8): seguir avocado-hp — tudo em `src/lib/emails/{senders, templates, components}`. Vira plano dedicado na Fase 3 pelo risco em auth
- **10 débitos pré-audit identificados** (seção 7.7): plugins misturados em lib/, duplicação emails, helpers com lógica de domínio, request-context duplicado, lib/audit/ convivendo com modules/audit/, testes fora de padrão, arquivos grandes (auth.ts 24KB, email.tsx 12KB), falta de src/routes/
- **Pontos de atenção para Fase 1 registrados** (seção 7.4): auth é 100% plugin-based; módulos críticos (webhook Pagar.me, public, admin/api-keys)
- **Fluxo de trabalho de 4 fases** definido (seção 2): Contexto → Audit → Roadmap → Execução, com execução item-a-item (não separar refactor de implementação nova em macro-fases)

**Referência de partida:** avocado-hp (`apps/server/src/`) — projeto previamente auditado juntos, usado como **benchmark pareado** de organização (não dogma). Synnerdata já supera avocado-hp em várias áreas (crypto/PII, supply chain scan, utilitários de resiliência, error tracking, infra de testes) — avocado-hp inspira principalmente em organização (`lib/` vs `plugins/`, emails em subpastas). A Fase 1 usará investigação independente com 4 fontes: código atual + docs Elysia (context7) + best practices web + avocado-hp como inspiração.

### 2026-04-21 — Metodologia da Fase 1 formalizada

- **Princípio:** investigação independente, não cópia de referência
- **4 fontes ponderadas** para cada item (seção 7.4.2): código atual, docs Elysia via context7, best practices web, avocado-hp como inspiração
- **6 veredictos possíveis** por item, incluindo 🏆 `synnerdata > avocado-hp` (para reconhecer quando este projeto está melhor)
- **Pontos de partida sabidos** documentados — o que synnerdata tem que avocado-hp não tinha, e os débitos em comum prováveis

### 2026-04-21 — Princípios adicionais e correções durante a Fase 1

- **"Better Auth primeiro"**: antes de qualquer implementação custom em auth/session/rate-limit/CSRF/2FA/API-keys, verificar primeiro se Better Auth já oferece. Tabela de features já usadas vs não usadas em 7.7
- **4ª dimensão de avaliação — Qualidade da implementação**: adicionada à metodologia após o Bloco 3 e aplicada retroativamente aos Blocos 1-3 (débitos #42-#53). Cobre tipagem, responsabilidade única, testabilidade, legibilidade
- **Consulta obrigatória a fontes externas** para débitos 🟡/🔴 relevantes: context7 (docs do framework) + WebSearch (best practices 2026). Débitos #32 e #56 validados assim durante o Bloco 4
- **Correção de débitos #22 e #31** (audit sem try/catch) — reavaliados após leitura do `modules/audit/audit.service.ts`: `AuditService.log()` já tem silent catch intencional, documentado no CLAUDE.md do módulo. Débitos revertidos

### 2026-04-21 — Progresso da Fase 1

- Bloco 1 (Bootstrap + env): ✅ concluído — 9 débitos (#11-#20)
- Bloco 2 (Infra em lib/): ✅ concluído — 10 débitos (#21-#30)
- Bloco 3 (Auth): ✅ concluído — 7 débitos (#31-#37)
- Revisão retroativa de qualidade (Blocos 1-3): ✅ concluída — 12 débitos (#42-#53)
- Bloco 4 (Módulos críticos): ✅ concluído — 14 débitos (#54-#67) + validações com fontes externas
- Bloco 5 (Emails): ✅ concluído — 8 débitos (#68-#75), escopo mapeado via `grep`
- Bloco 6 (CI/CD e deploy): ✅ concluído — 20 débitos (#76-#95)
- Consolidação do relatório: ✅ concluído — [`docs/reports/2026-04-21-api-infrastructure-audit.md`](../reports/2026-04-21-api-infrastructure-audit.md)

### 2026-04-21 — Fase 1 concluída

**Números finais:**
- **Total de débitos registrados:** 95 (#1-#95 na seção 7.7)
- **Débitos revertidos após validação:** 2 (#22 e #31 — `AuditService.log` tem silent catch intencional)
- **Veredictos nas tabelas 4/5:** ~65 itens avaliados com Status + Observações

**Áreas em que synnerdata supera avocado-hp** (9 áreas destacadas no relatório): `lib/crypto/pii.ts`, config Better Auth rica, Sentry com proteção de headers sensíveis, correlation ID em sucesso+erro, OpenAPI com x-error-messages, CORS robusto, webhook com idempotência completa, Dependabot 3-ecosystems, Trivy+SARIF+affected tests.

**Débitos críticos identificados (🔴 urgente):**
1. #16 `requestId` ausente no body do erro (MVP)
2. #54 API keys não auditam operações admin (compliance LGPD)
3. #20 Request timeout não configurado
4. #76 `bun pm audit` ausente em CI
5. #22-24 auditPlugin em lugar errado + exige contexto manual + tipos frouxos
6. Validar BOLA em cada service

**Recomendação de priorização para Fase 2**: ver seção "Recomendação inicial de priorização" do relatório. Propõe-se 3 buckets com ações concretas em cada.

**Próxima etapa:** Fase 2 — consolidar roadmap em seção 7.5 com aprovação do owner do projeto.

### 2026-04-21 — Fase 2 concluída (roadmap priorizado)

Seção 7.5 preenchida com **69 ações totais** divididas em 3 buckets:

- **🔴 Urgente (10 ações, RU-1 a RU-10)** — hardening de env.ts, requestId no erro, request timeout, `bun pm audit` no CI, audit de API keys, fix do auditPlugin, BOLA testing, runbook backup Coolify. Prazo alvo: 30 dias.
- **🟡 Curto prazo (38 ações, CP-1 a CP-38)** — 5 PRs dedicados (plugins/, emails, routes/v1/, split auth, clean errors) + 33 ações pontuais (segurança, Cloudflare Free, observabilidade, qualidade). Prazo alvo: 30-90 dias.
- **🟢 Médio prazo / sob demanda (21 ações, MP-1 a MP-21)** — paginação cursor, cache Redis, BullMQ, tracing, eSocial, SOC 2, ISO 27001, etc. Só quando sinal real aparecer.

**Estrutura padrão de cada ação:**
- ID (RU-N / CP-N / MP-N) para referência em branches e PRs
- Débitos cobertos (link para 7.7)
- Tipo (config / new / refactor / docs / plan)
- Esforço (S / M / L / XL)
- Depende de (IDs bloqueadores)

**Princípios de execução registrados:** (1) finalizar 🔴 antes de iniciar 🟡; (2) dentro de 🟡 priorizar PRs dedicados (CP-1 a CP-5) que destravam outras ações; (3) 🟢 só com sinal real; (4) atualizar o documento conforme progresso.

**Próxima etapa:** Fase 3 — execução começando por **RU-1 (hardening `env.ts`)**.

### 2026-04-21 — Metodologia de execução (Fase 3) documentada em 7.5.1

Antes de iniciar a Fase 3, registradas em 7.5.1 todas as propostas e avaliações discutidas (que estavam só no chat) para garantir que o documento continua auto-contido:

- **Template padrão** para planos de execução em `docs/plans/YYYY-MM-DD-<id>-<slug>.md`: Meta, Contexto, Pesquisa 4 fontes, Implementação, Validação, Rollback, Definition of Done. Ações S não precisam de plano formal — descrição no PR basta
- **Agrupamento do bucket 🔴** em 5 PRs temáticos: Fundação (RU-1,2,3), CI (RU-4,5), Audit (RU-6,7,8), BOLA (RU-9), Docs (RU-10)
- **Política de worktrees**: branches normais para Grupos 1/2/3/5; worktree para RU-9 se paralelo a outro grupo; worktree obrigatório para CP-1 e CP-2 (XL)
- **Avaliação do [Compozy](https://github.com/compozy/compozy)** como alternativa ao template caseiro — matriz comparativa + sinais no repositório (skills-lock.json já tem 6 skills, `cy-*` disponíveis, sem `.compozy/` ainda criado)
- **Matriz de escolha por esforço**: S via branches simples; M/L/XL via Compozy com `/cy-final-verify` e council em XL
- **3 opções metodológicas** registradas (A pilot, B híbrido, C caseiro) com prós/contras para escolha explícita

**Status:** 🔄 **Decisão metodológica em aberto** (seção 7.5.1 "Decisão"). Fase 3 aguarda escolha entre A/B/C antes de iniciar.

### 2026-04-21 — Decisão metodológica: Opção B (Híbrido)

Escolhida a **Opção B — Híbrido imediato**: ações S via branches simples imediatamente, Compozy setup em paralelo, a partir de RU-6 usar pipeline completo do Compozy (`/cy-create-prd` → `/cy-create-techspec` → `/cy-create-tasks` → `compozy start` → `/cy-final-verify`). Justificativa completa + consequências operacionais em 7.5.1.

**Fase 3 iniciando.** Primeira ação: **RU-1 (hardening `env.ts`)** no Grupo 1 (Fundação).

### 2026-04-21 — Política de testes documentada em 7.5.2

Antes de iniciar RU-1, registrada política de testes escopada para a Fase 3:

- **Princípio:** testar o que é tocado, não tudo. Coverage é sinal, não meta.
- **4 categorias** de política por tipo de ação: (1) TDD clássico, (2) Não-regressão, (3) Teste mínimo focado, (4) N/A
- **Escopo de execução**: rodar só testes diretos do arquivo tocado + testes de consumidores + testes novos da ação. Não rodar suite completa (>10min).
- **Regras de ouro** (5): testar comportamento não implementação, não testar framework, edge case de segurança sempre testa, movimentos = rodar existentes, não adicionar teste que só dá trabalho.
- **Tabela de políticas** para cada ação do bucket 🔴 (RU-1 a RU-10) com categoria, arquivos afetados, testes a rodar e a escrever.
- **Definition of Done** do template de plano (7.5.1) atualizado com checklist de testes.

**Próxima sub-etapa:** rodar `bun run test:coverage` como baseline + executar testes afetados pelo bucket 🔴 para confirmar estado verde antes de iniciar RU-1. Compozy ainda será discutido em mais detalhes antes de começar.

### 2026-04-21 — Baseline de testes do bucket 🔴 executado

Rodados testes que cobrem as áreas a serem tocadas pelo bucket 🔴 para confirmar estado verde antes de mexer no código:

| Área | Testes | Resultado | Cobertura para |
|---|---|---|---|
| `src/lib/errors/__tests__/` | 11 | ✅ 11 pass, 0 fail (529ms) | RU-2 (baseline de `errorPlugin`) |
| `src/modules/audit/__tests__/` | 20 (em 2 arquivos) | ✅ 20 pass, 0 fail (9.3s) | RU-7, RU-8 (cobre `AuditService`, não o plugin) |
| `src/modules/admin/api-keys/__tests__/` | 31 (em 6 arquivos) | ✅ 31 pass, 0 fail (14.3s) | RU-6 (mas sem teste de audit trail) |

**Baseline: 62 testes verdes** protegendo as áreas a serem refatoradas.

**Gap crítico identificado e coberto:** `src/lib/audit/audit-plugin.ts` **não tinha nenhum teste direto** (e `createTestApp()` em `src/test/helpers/app.ts` não inclui o `auditPlugin`). Para refatorar RU-7/RU-8 com segurança, criado `src/lib/audit/__tests__/audit-plugin.test.ts` com 7 testes de baseline documentando o comportamento atual:

1. Injeção do `audit()` no contexto + persistência completa do log
2. Extração de IP de `x-forwarded-for` (primeiro valor quando múltiplos)
3. Fallback para `x-real-ip` quando `x-forwarded-for` ausente
4. `ipAddress`/`userAgent` null quando headers ausentes
5. `organizationId: null` para ações system-level (login, user create)
6. `resourceId` opcional
7. Tipos frouxos (`AuditAction | string`) — será endurecido em RU-7

**Resultado:** ✅ 7 pass, 0 fail (1.2s). Baseline verde pronto. O 7º teste serve como documentação viva do débito #24 — RU-7 irá atualizá-lo para tipos estritos.

**Outras ações do bucket 🔴 — não precisam de baseline novo:**

- **RU-1 (env.ts)**: teste `src/__tests__/env.test.ts` será escrito como parte da ação (TDD categoria 3). Estado atual não precisa de baseline — não há comportamento a proteger, só novas validações a adicionar.
- **RU-2 (requestId no erro)**: 11 testes de errors já protegem shape do envelope; teste novo (`error.requestId`) vem no TDD da própria RU-2.
- **RU-3, RU-4, RU-5, RU-10**: categoria (4) N/A — sem testes.
- **RU-6 (audit api-keys)**: 31 testes atuais cobrem create/revoke/delete funcional; teste que valida emissão de `AuditService.log` vem no TDD da própria RU-6.
- **RU-9 (BOLA)**: é inteiramente sobre escrever testes novos. Template reutilizável em `api-key-org-access.test.ts:70-103`.

**Conclusão:** cobertura adequada garantida. Pronto para iniciar Fase 3 com "conforto" — qualquer regressão durante refactors do bucket 🔴 será detectada pelos 69 testes de baseline (62 existentes + 7 novos do auditPlugin).

### 2026-04-21 — Compozy workspace configurado + `cy-idea-factory` diferida

**Concluído:**
- CLI `compozy 0.1.12` instalado globalmente
- 9 skills core instaladas em `~/.claude/skills/` (compozy, cy-create-prd, cy-create-techspec, cy-create-tasks, cy-execute-task, cy-review-round, cy-fix-reviews, cy-final-verify, cy-workflow-memory)
- `.compozy/config.toml` criado no repositório com defaults alinhados ao CLAUDE.md: `ide = "claude"`, `model = "opus"`, `auto_commit = false`, `reasoning_effort = "xhigh"`
- `.compozy/` versionado (não está no `.gitignore`, conforme recomendação oficial — artifacts devem ser commitados)

**Diferido (não instalado agora):**
- Extensão `cy-idea-factory` — traz council de 6 agentes (security-advocate, architect-advisor, pragmatic-engineer, product-mind, devils-advocate, the-thinker) e skill `/cy-idea-factory`. Motivo: roadmap atual (bucket 🔴 + maior parte do 🟡) já tem escopo claro do audit; council é overkill para ações bem escopadas. Instalar apenas antes de CP-1/CP-2 (XL) ou qualquer item do bucket 🟢 (decisões com múltiplos trade-offs sem design pronto)

**Estado:** pronto para iniciar Fase 3. Próxima ação — **RU-1 (hardening `env.ts`)** via fluxo simples (branch direta, sem Compozy).

### 2026-04-22 — Onda 5 PR #1 entregue (CP-1): `src/plugins/` consolidado

Primeira PR da Onda 5. Executada em worktree dedicado (`.worktrees/feat/cp-1-plugins-migration/`) a partir de `preview`, seguindo metodologia XL da seção 7.5.1 (plan formal local em `docs/plans/`, 10 commits atômicos, target `preview`).

**Rubrica adotada (estrita, não ampla do CP original):**

Só vai para `src/plugins/` o arquivo que exporta uma instância Elysia consumida via `app.use(X)`. Utilitários puros, side-effect inits e bootstrap helpers ficam em `src/lib/`. A rubrica foi validada contra as docs oficiais do Elysia (context7).

**Migrações (commits 2-6):**

| De | Para | Notas |
|---|---|---|
| `src/lib/health/` | `src/plugins/health/` | Plugin + model + tests |
| `src/lib/logger/index.ts` | split em `src/lib/logger.ts` (Pino util) + `src/plugins/logger/logger-plugin.ts` (Elysia plugin) | 17 imports de `logger` ficam em `@/lib/logger`; 4 imports de `loggerPlugin` atualizados |
| `src/lib/errors/error-plugin.ts` | `src/plugins/errors/error-plugin.ts` | Classes de erro em `lib/errors/` (CP-5 move domain-errors para módulos) |
| `src/lib/cron-plugin.ts` | `src/plugins/cron/cron-plugin.ts` | Sem mudança estrutural; CP-32 refatora os 7 jobs via array declarativo |
| `src/lib/auth-plugin.ts` | `src/plugins/auth/auth-plugin.ts` | 40 import sites atualizados; CP-4 quebra em sub-arquivos |

**Ficam em `src/lib/`** (não são plugins Elysia): `cors.ts`, `sentry.ts`, `shutdown/`, `request-context.ts`, `zod-config.ts`, `auth.ts`, `permissions.ts`, `password-complexity.ts`, `email.tsx`, `responses/`, `schemas/`, `utils/`, `validation/`, `helpers/`, `crypto/`, `errors/` (classes).

**Shallow alignment (commits 7-8):**

- `CLAUDE.md` por plugin (`plugins/{health,logger,errors,cron,auth}/CLAUDE.md`) documentando `name`, hooks + scopes, context additions, macros, consumers, ordering, out-of-scope.
- Export de types do `derive`/`macro resolve`: `LoggerContext = { requestId, requestStart }`, `AuthContext = { user, session }`. Zero mudança runtime — melhora DX.

**Cleanups (commit 9):**

- `src/lib/ratelimit/` (só tinha `__tests__/`) — teste movido para `src/plugins/errors/__tests__/rate-limit-integration.test.ts`.
- `src/lib/request-context/` (só tinha `__tests__/`) — teste movido para `src/lib/__tests__/request-context.test.ts`. O arquivo real `src/lib/request-context.ts` fica onde está.

**Validação:**

- `bunx tsc --noEmit` exit 0
- `npx ultracite check` clean
- Tests afetados verdes (health, logger plugin, error plugin, rate-limit integration, auth plugins unauthorized-log + feature-guard, api-keys consumindo betterAuthPlugin, payments/jobs + vacations consumindo cronPlugin).

**Nota sobre `.as()` — correção de entendimento:**

Proposta inicial sugeria forçar `.as("global")` em vários plugins. Validação com context7 mostrou: `.as()` no nível da instância **só aceita `'scoped'` ou `'plugin'`**, nunca `'global'`. Scope levels são mecânicas distintas:
- Per-hook `{ as: 'local' | 'scoped' | 'global' }` — granular
- Instance `.as('scoped' | 'plugin')` — lifta hooks locais um nível acima

Plugins atuais já usam per-hook modifiers corretamente. Não forçamos mudanças de scope — só documentamos o que já existe. Essa correção está registrada no plano local e nos CLAUDE.md.

**Destrava:**

- **CP-4** — quebrar `src/lib/auth.ts` (856 linhas) + `src/plugins/auth/auth-plugin.ts` (391 linhas) em sub-arquivos
- **CP-26** — mover `extractErrorMessages` de `src/index.ts` para `src/plugins/openapi/` (ou `src/lib/openapi/`)
- **CP-28** — cleanup residual de `lib/audit/` após RU-8 (checar se há sobras)
- **CP-32** — declarative cron refactor (array ou helper `createCronJob`)

**Contadores:** bucket 🟡 passou de 23 → **24 CPs concluídos** (25 ativas, 1 contenção). Onda 3 com 11 CPs done + CP-41 pendente (secrets Pagar.me). Onda 5 iniciada.

### 2026-04-22 — Ordem de execução revisada: Onda 5 eleita como próxima

Decisão do dono após merge de PR-A (Onda 3 com 11/12 CPs fechados):

**Motivação:**
- **CP-41 (último de Onda 3)** parkado — testes Pagar.me continuam rodando localmente; configurar secrets sandbox como GitHub Secrets fica para momento oportuno
- **Onda 4 — Observabilidade** requer brainstorm arquitetural antes de implementar (OTel nativo vs Prometheus scraping vs híbrido; onde métricas vão — GlitchTip só faz erros, Coolify pode não expor scrape endpoint)
- **Onda 4 — Cloudflare** blocked pelo cliente (DNS no registro.br)
- **Onda 5** tem o maior valor arquitetural desbloqueado: CP-1 (XL) destrava CP-4, CP-26, CP-28, CP-32. Convenção `src/plugins/` já inaugurada em RU-8 — CP-1 só estende

**Ordem revisada:**

1. **Onda 5 agora** — começando por **CP-1 (XL)**, depois CP-2/CP-3/CP-5/CP-6/CP-33/CP-38/CP-44 conforme prioridade
2. **Onda 4 Observabilidade** — pós CP-1/CP-3 (CP-3 destrava CP-18)
3. **Onda 3 CP-41** — quando secrets Pagar.me sandbox estiverem configurados
4. **Onda 4 Cloudflare** — quando cliente alinhar migração DNS

**Primeira PR da Onda 5:** CP-1 em worktree isolado (`../synnerdata-api-b-cp1`, branch `feat/cp-1-plugins-migration` a partir de `preview`). Plano formal em `docs/plans/2026-04-22-cp-1-plugins-migration.md` antes de tocar código — regra mandatória para XL conforme seção 7.5.1.

### 2026-04-22 — Onda 3 PR-A entregue (CP-24, CP-25, CP-30)

Terceira PR da Onda 3. Agrupa 1 S + 2 M's de "Auth hardening" em 3 commits atômicos em `chore/onda-3-pr-a-auth-hardening`, targeting `preview`.

**Entregáveis:**

- **CP-24** — `src/lib/auth-plugin.ts` emite `logger.warn({ type: "security:unauthorized_access", method, path, ip, userAgent, hasApiKey })` antes de lançar `UnauthorizedError` no macro `auth`. IP extraído via `x-forwarded-for → x-real-ip → null` (padrão já usado em api-keys). `hasApiKey` é boolean — raw key/token **nunca** logado. 4 unit tests novos (shape completo, fallback de IP, null quando sem headers, garantia de não-vazamento de bearer token via serialização).
- **CP-25** — `src/lib/permissions.ts` refatorado com helper `inheritRole(base, overrides)` + const `ownerPerms` como fonte da verdade. `manager`, `supervisor` e `viewer` agora derivam via overrides (manager: 6; supervisor: 15; viewer: 24). Tipo `OrgRolePermissions` (keys obrigatórios) introduzido para satisfazer `orgAc.newRole` (que exige `Subset`, não `Partial`). **Matrix test existente de 109 assertions passou sem mudança** — equivalência exata preservada. Redução líquida de 112 linhas.
- **CP-30** — Dynamic imports em `src/lib/cron-plugin.ts` (2× `VacationJobsService`) e `src/lib/auth.ts` (`OrganizationService` em `afterCreateOrganization`) convertidos para static. Graph trace confirmou que nenhum desses módulos importa de volta via `cron-plugin`/`lib/auth` — fronteira dinâmica era defensiva/cargo-cult. Zero `await import()` em prod code (restantes todos em `__tests__/` e intencionais).

**Validação:** 4 (CP-24) + 109 (permissions matrix) + 137 (payments/jobs + occurrences/vacations) + 115 (auth + organizations/profile) + 167 (lib/* + api-keys) = **532 pass / 0 fail** nas suites afetadas. `bunx tsc --noEmit` exit 0; `npx ultracite check` clean.

**Contadores atualizados:** bucket 🟡 passou de 20 → **23 CPs concluídos** (26 ativas, 1 contenção). Onda 3 com **9 S's + 2 M's entregues** — resta só CP-41 (PR-D standalone).

### 2026-04-22 — Onda 3 PR-B entregue (CP-27, CP-29, CP-31)

Segunda PR da Onda 3. Agrupa os 3 S's de "Error handling + env" em 3 commits atômicos em `chore/onda-3-pr-b-error-handling-env`, targeting `preview`.

**Entregáveis:**

- **CP-27** — `registerPaymentListeners()` e `registerEmployeeListeners()` movidos para antes de `app.listen()` em `src/index.ts`. Remove a race window em que domain events disparados durante o bootstrap podiam ser perdidos porque o callback do `.listen()` (onde os listeners eram registrados) ainda não havia executado.
- **CP-29** — `formatErrorDetail` em `src/lib/errors/error-plugin.ts` ganhou `depth` param com limite 5. Ao atingir o limite, emite `"[truncated: max depth 5 reached]"` em vez de recursar — defende o próprio handler de erro contra stack overflow em `error.cause` cíclico. Função exportada; 3 unit tests novos (deep chain, cyclic cause, non-Error input).
- **CP-31** — `src/env.ts` passa a exportar `isDev` e `isTest` além do `isProduction` existente. Refatoradas **7 leituras** de `process.env.NODE_ENV` em 6 arquivos (`lib/errors/error-plugin.ts`, `lib/logger/index.ts`, `lib/auth.ts`, `payments/{checkout,admin-checkout,plan-change}/*.model.ts`). `error-plugin` usa `!isProduction` para preservar semântica "dev+test" do código anterior. Zero ocorrências diretas fora de `env.ts` (validado por grep).

**Validação:** 162 + 132 + 19 = **313 pass / 0 fail** nos módulos afetados (env, errors, auth, payments checkout/admin-checkout/plan-change). `bunx tsc --noEmit` exit 0; `npx ultracite check` clean.

**Contadores atualizados:** bucket 🟡 passou de 17 → **20 CPs concluídos** (29 ativas, 1 contenção). Onda 3 com 8/9 S's entregues. Resta só **CP-24** (S) nas próximas PRs + **PR-A** (CP-24 + M's CP-25, CP-30) e **PR-D** (CP-41 standalone).

### 2026-04-22 — Onda 3 PR-C entregue (CP-34, CP-35, CP-36, CP-37, CP-39)

Primeira PR da Onda 3. Agrupa 5 S's de "Qualidade geral" em 5 commits atômicos em `chore/onda-3-pr-c-qualidade-geral`, targeting `preview`.

**Entregáveis:**

- **CP-34** — Branded type `EncryptedString` em `src/lib/crypto/pii.ts`. `PII.encrypt` retorna `Promise<EncryptedString>`; `PII.decrypt` exige `EncryptedString`; `PII.isEncrypted` vira type guard. Zero custo runtime. Testes: 21 pass (1 novo cobrindo narrow via guard).
- **CP-35** — Helper `withApiKeyNotFoundFallback(keyId, fn)` em `src/modules/admin/api-keys/api-key.service.ts`. Elimina 3 cópias idênticas do try/catch que traduzia Better Auth 404 em `ApiKeyNotFoundError`. Métodos `getById`, `revoke`, `delete` perderam `async` (retornam promise do wrapper direto). Testes: 35 pass (mesma cobertura de 404).
- **CP-36** — Anti-enumeration em `POST /v1/public/newsletter/subscribe`. Duplicado ativo agora retorna 200 idêntico ao primeiro subscribe (no-op silencioso); 409 removido do controller + schema. CLAUDE.md do módulo documenta a invariante. Testes: 4 pass (teste de duplicado reescrito para verificar body idêntico).
- **CP-37** — `src/lib/health/index.ts` lê `version` de `package.json` via `readFileSync` síncrono no module-init; fallback `"unknown"` só em erro genuíno. Remove `"1.0.50"` hardcoded que drifava quando `npm_package_version` não era populada (caso típico: container rodando `bun src/index.ts`). Testes: 7 pass (SEMVER_PATTERN continua batendo).
- **CP-39** — Split `SMTP_FROM` / `SMTP_FROM_NAME` em `src/env.ts`. `SMTP_FROM` virou `z.email()` puro; `SMTP_FROM_NAME` é `z.string().min(1).optional()`. Custom `smtpFromSchema` (regex RFC 5322) removido. `src/lib/email.tsx` usa `from: { name, address }` quando `SMTP_FROM_NAME` setado, fallback para string. Testes: 28 pass (5 de SMTP_FROM + 3 novos de SMTP_FROM_NAME).

**Ação operacional pendente:** split do `SMTP_FROM` no Coolify antes do deploy da PR-C — `"Synnerdata <contato@synnerdata.com.br>"` vira `SMTP_FROM=contato@synnerdata.com.br` + `SMTP_FROM_NAME=Synnerdata`.

**Contadores atualizados:** bucket 🟡 passou de 12 → **17 CPs concluídos** (32 ativas, 1 contenção). Onda 3 com 5/9 S's entregues. Próximas PRs: **PR-B** (CP-27, CP-29, CP-31), **PR-A** (CP-24, CP-25, CP-30), **PR-D** standalone (CP-41).

### 2026-04-22 — CP-43 concluída (audit de reads em recursos sensíveis) + **Onda 2 fechada**

Última ação da Onda 2 entregue. **Débito #96 100% endereçado**: CP-42 cobriu mutations (diff + PII redaction) e CP-43 cobre reads (quem leu o quê e quando).

**Entregáveis:**

1. **Fix no `auditPlugin`** (`src/plugins/audit/audit-plugin.ts`): destructure de `user/session/request` movido de dentro do `.derive()` (execução ansiosa) para dentro da função `audit()` retornada (execução no call-time). Motivo: no lifecycle do Elysia, `.derive()` roda ANTES do macro `auth.resolve`, então user/session eram `undefined` no snapshot do derive. Bug mascarado nos testes do auditPlugin (usavam `.derive()` para mockar user/session, populando o ctx antes do plugin rodar). Unblock-aria desde RU-7 se alguém tivesse tentado adotar em controller real. **Tests do plugin continuam verdes** (6/6).

2. **Adoção nos 4 controllers sensíveis**:
   - `src/modules/employees/index.ts`
   - `src/modules/occurrences/medical-certificates/index.ts`
   - `src/modules/occurrences/cpf-analyses/index.ts`
   - `src/modules/occurrences/labor-lawsuits/index.ts`

   Padrão uniforme: `.use(betterAuthPlugin).use(auditPlugin)` + `audit({ action: "read", resource, resourceId })` após o service resolver com sucesso. Ordem importa — auditPlugin lê user/session do ctx injetado pelo `auth` macro.

3. **Enum `auditResourceSchema` ganha `cpf_analysis`** — completa os 4 resources de reads sensíveis.

4. **Integration test** em `medical-certificates/__tests__/get-medical-certificate.test.ts` valida: GET `/:id` com sucesso → audit_log row com `action: "read"`, `resource: "medical_certificate"`, `resourceId: <certificate.id>`, `userId: <session user>`, `changes: null`. Canonical test do pattern — os outros 3 módulos seguem o mesmo wiring.

5. **Documentação** em `src/modules/audit/CLAUDE.md` seção "Read Audit (CP-43)" com padrão de uso, regras (só sucesso, só individual, changes null), motivos (por que não listagem) e lista de resources cobertos.

**Decisões operacionais:**

- **Listagem NÃO audita** — cada request de lista geraria um log por request sem `resourceId` específico. O log HTTP já cobre "endpoint X foi acessado"; audit é para reconstituir acesso a registros individuais.
- **Audit só em sucesso** — a call vem depois do service resolver, então 404/403 não geram log. Erros ficam no logger/Sentry. Audit é rastreabilidade de acesso efetivo a dado.
- **`changes: null` em read** — reads não têm before/after. O tuplo `(userId, resourceId, ipAddress, userAgent, createdAt)` é o que LGPD Art. 48 precisa.
- **Plugin fix urgente, não refactor** — bug era real e bloqueava adoção. Ficou num commit separado com explicação detalhada para audit trail.

**Arquivos tocados:**

- Fix: `src/plugins/audit/audit-plugin.ts`
- Modificados: `src/modules/audit/audit.model.ts` (enum), `src/modules/audit/CLAUDE.md` (seção nova), 4 controllers
- Novo teste: `src/modules/occurrences/medical-certificates/__tests__/get-medical-certificate.test.ts` (+1 caso)

**Validação:**
- ✅ `bun run lint:types` clean
- ✅ 6 tests do auditPlugin passando (regression clean)
- ✅ 199 tests em audit + subscription + api-keys + plugin audit passando
- ✅ 223/224 tests nos 4 módulos tocados (1 falha pré-existente em preview — FK constraint em factory de sectors, unrelated to CP-43)
- ✅ `npx ultracite check` clean nos arquivos tocados

**Lições:**

- **Testes mockados podem mascarar bugs de lifecycle**: o `.derive()` no test mockou user/session de forma síncrona, simulando um estado que nunca existe em produção (onde macro.resolve roda DEPOIS do .derive). Integration test em controller real pegou o bug. Lição: quando um plugin é infra dormente, integration test com auth real antes de declarar "done" salva retrabalho.
- **Ordem de plugins importa quando há dependência de contexto**: `auditPlugin` lê `user/session` que vêm do `betterAuthPlugin`. Mountado antes ou independente, breaks. Documentar a ordem no CLAUDE.md do plugin.
- **Escopo "1 módulo, 1 teste focado" é suficiente quando o pattern é uniforme**: os 4 controllers têm wiring idêntico. 1 test canônico em medical-certificates cobre a prova do helper; replicar em 3 módulos seria duplicação.

### 2026-04-22 — CP-42 concluída (convenção de audit diff + PII redaction)

Primeira ação da Onda 2 (Compliance LGPD) fechada. Endereça o débito #96 parcialmente; CP-43 (reads sensíveis) completa o endereçamento.

**Entregáveis:**

1. **Helper `src/modules/audit/pii-redaction.ts`** com 4 exports:
   - `PII_FIELDS`: set imutável com 11 campos sensíveis do domínio DP brasileiro (CPF, RG, pisPasep, CTPS, email, phone, mobile, salary, hourlyRate, CID, birthDate)
   - `IGNORED_AUDIT_FIELDS`: set com 6 colunas de metadata excluídas de diffs (createdAt/updatedAt/deletedAt/createdBy/updatedBy/deletedBy)
   - `redactPII(record, piiFields?)`: shallow copy com keys PII substituídas por `"<redacted>"`
   - `buildAuditChanges(before, after, options?)`: diff minimal com PII redacted em ambos os lados, Dates e objetos comparados por valor, campos ignorados filtrados
   - `hasAuditChanges(diff)`: true se houver mudança em qualquer lado
   - Signatures aceitam `object` (não `Record<string, unknown>`) — domain types entram direto sem double-cast
   - 25 unit tests cobrem empty input, cada campo PII, Date equality, nested objects por JSON, null transitions, custom PII sets, non-mutation do input
2. **Convenção documentada** em `src/modules/audit/CLAUDE.md`: forma do diff (minimal, só campos alterados), regra de redação, lista default de PII, como estender via `options.piiFields`. Módulos que aplicam indexados.
3. **Enum `auditResourceSchema` alinhado com a spec** — renomeado `medical_leave` → `medical_certificate` (só existia na definição, sem call-sites); adicionado `labor_lawsuit` preemptivamente para quando o módulo ganhar audit. Enum do CLAUDE.md também atualizado.
4. **Retrofit em 3 módulos críticos**:
   - **employees**: audit em create/update/updateStatus/delete. CPF, email, phone, mobile, birthDate, salary redacted automaticamente no diff. `updateStatus` diffa apenas o campo `status` (mais limpo que o record completo)
   - **medical-certificates**: audit em create/update/delete. `cid` redacted; datas, daysOff, notes em plaintext
   - **subscription**: `cancel` agora sempre audita (removido gate `if (reason || comment)`), `restore` ganha audit novo. Diff mostra `cancelAtPeriodEnd`, `canceledAt`, `cancelReason`, `cancelComment` mudando

**Decisões operacionais:**

- **`"<redacted>"` literal em vez de hash** (confirmado pelo dono): simples, LGPD-compliant, indica que campo existia sem revelar valor. Hash-based correlation pode virar feature só se surgir necessidade.
- **Metadata excluído do diff**: evita ruído ("updatedAt mudou, updatedBy mudou") que não agrega compliance — valores são reconstituíveis do próprio audit log entry.
- **Signature `object` vs `Record<string, unknown>`**: v1 usava `Record<string, unknown>`, exigia `as unknown as Record<string, unknown>` nos call-sites. Refatorado para `object` (supertype que aceita domain types direto). Feedback crítico do dono ("parece um workaround") levou à correção.
- **Forward-only**: logs existentes antes do CP-42 ficam como estão. LGPD Art. 48 não exige backfill retroativo de rastreabilidade.
- **Create/delete via `buildAuditChanges({}, record)` / `(record, {})`**: o mesmo helper cobre os 3 tipos de mutation. API consistente.

**Arquivos tocados:**

- Novos: `src/modules/audit/pii-redaction.ts` + teste
- Modificados: `src/modules/audit/audit.model.ts` (enum), `src/modules/audit/CLAUDE.md` (convenção), `src/modules/employees/employee.service.ts`, `src/modules/occurrences/medical-certificates/medical-certificates.service.ts`, `src/modules/payments/subscription/subscription-mutation.service.ts`, `src/modules/payments/subscription/__tests__/cancel-subscription.test.ts` (asserções atualizadas)

**Validação**:
- ✅ 25 unit tests do helper passando
- ✅ 113 tests de subscription passando (inclui 2 atualizados pra nova forma do diff)
- ✅ 49 tests de medical-certificates passando
- ✅ 82 tests de employees passando
- ✅ `bun run lint:types` clean
- ✅ `npx ultracite check` clean

**Lições:**

- **Double-cast (`as unknown as X`) é cheiro de API mal tipada**: a correção não foi aceitar o cast, foi mudar a assinatura do helper. Input do dono ("cuidado com workarounds") pegou isso na hora certa, antes do merge
- **Formatter interage mal com edições sequenciais**: ultracite removeu imports "não usados" entre edições que adicionavam import primeiro e usage depois. Solução: adicionar import e primeira ocorrência do uso na mesma edição. Se você separar, o formatter strip e você refaz.
- **Separação de concerns em commits atômicos paga dividendos**: helper + subscription + medical-certs + employees + CLAUDE.md viram 5 commits logicamente independentes. Review fica tratável; rollback granular se necessário.

### 2026-04-22 — Onda 1 fechada (CP-7, CP-8, CP-9, CP-13, CP-20, CP-21, CP-22, CP-23)

Os 8 CPs "small" da Onda 1 entregues numa única PR com 8 commits atômicos (1 por CP). Todos tocam apenas `.github/workflows/` — zero código de produção.

**Ganhos consolidados:**

| Dimensão | Antes | Depois |
|---|---|---|
| Scan de histórico git | Só `secretlint` em árvore atual | TruffleHog em `--only-verified` + diff no PR ou full no schedule (CP-7) |
| Coverage de Trivy | Container image apenas | Container + filesystem (CP-9) — SARIF categorizado separadamente |
| SBOM | Inexistente | CycloneDX via `trivy format=cyclonedx`, artifact 90d retention (CP-8) |
| Secrets em `test.yml` | Env do job inteiro | Apenas nos 3 steps que rodam código (CP-13) |
| Coverage em CI | Desabilitado | `--coverage-reporter=lcov` + upload para Codecov (CP-20, requer `CODECOV_TOKEN`) |
| Cache do `bun install` | Ausente (5s/run × 3 workflows) | `actions/cache@v4` por `hashFiles('bun.lock')` (CP-21) |
| Drift de lockfile | Silencioso | `--frozen-lockfile` em lint/test/build detecta e falha (CP-22) |
| Smoke test do bundle | `test -f ./dist/index.js` | Runtime 10s com exit codes 0/124/143 aceitos (CP-23) |

**Decisões operacionais:**

- **TruffleHog em vez de gitleaks** (CP-7): gitleaks-action v2 exige licença para orgs em algumas configurações; TruffleHog é free e tem flag `--only-verified` que minimiza false positives. Diff por PR (base/head SHAs) acelera PRs grandes.
- **Trivy filesystem com `skip-dirs: node_modules`** (CP-9): bun audit já cobre dep tree com advisory context mais rico; Trivy fs agrega valor em configs (.env sample, Dockerfile, etc.), não em node_modules.
- **SBOM no step do trivy-image** (CP-8): reaproveita a imagem já construída, evita rebuild. CycloneDX é o formato esperado por SOC2/supply-chain tooling moderno.
- **Secrets escopados para 3 steps** (CP-13): migrations precisam porque `drizzle.config.ts` importa `@/env` (valida tudo no boot do drizzle-kit). Affected tests + full suite precisam para as libs reais. Checkout/Setup/Install/affected-detection ganham zero exposição.
- **Codecov com `fail_ci_if_error: false`** (CP-20): até `CODECOV_TOKEN` ser configurado no repo secrets, o step só loga warning — não bloqueia PRs. Upload entrega valor imediato se o token for criado depois.
- **Cache keyed por `bun.lock`** (CP-21): chave primária troca quando o lockfile muda; `restore-keys: bun-` permite warm start parcial em lock churn.
- **`--frozen-lockfile` em todos workflows** (CP-22): alinha com Dockerfile que já usava. Agora uma PR que altera package.json sem regenerar bun.lock falha em lint/test/build — bom sinal pra review.
- **Smoke test aceita 0/124/143** (CP-23): 0 = app exit clean, 124 = SIGTERM do timeout, 143 = graceful shutdown após SIGTERM. Qualquer outro código expõe erro de import/plugin/schema no boot.

**Arquivos tocados** (só `.github/workflows/`): `security.yml` (CP-7, CP-8, CP-9), `test.yml` (CP-13, CP-20), `lint.yml` (CP-21, CP-22), `build.yml` (CP-21, CP-22, CP-23).

**Validação (rodará no próprio PR via CI)**:
- Lint & Security (threshold `high` herdado de CP-40)
- Affected Tests (sem mudança de código → "No test files affected")
- Build + Smoke test
- Security workflow só roda em PR para `main`/`preview` — disparado quando esta PR mergear

**Ondas seguintes**:
- **Onda 2 — Compliance LGPD** (débito #96): CP-42 (convenção `changes: { before, after }` + PII redacted) → CP-43 (audit de reads em recursos sensíveis, depende de RU-7 já entregue).
- **Onda 3 — Qualidade pontual** e ondas 4-5 conforme 7.5 § Ordem de execução sugerida.

### 2026-04-22 — CP-40 concluída (13 highs zerados via upgrades + overrides + CI threshold `high`)

Segundo item do bucket 🟡 fechado, primeiro da **Onda 1**. Resultado final: `bun audit --audit-level=high` passa localmente e agora também gateia PRs no CI.

**Escopo real vs. escopo declarado** — O checklist dizia "triagem de 13 highs em dev deps" e apontava 4 deps de tooling (ultracite, commitizen, secretlint, lint-staged). Auditoria inicial revelou que 6 dos 13 highs também tocavam prod deps: `better-auth → defu`, `better-auth → @better-auth/core → kysely`, `drizzle-orm → kysely`, `@sentry/bun → @fastify/otel → minimatch`, `@sentry/bun → ... → @isaacs/brace-expansion`, `exceljs → archiver → ... → minimatch`. Escopo foi expandido para cobrir ambos, mas sem misturar com migrações de framework (reforma proposta e aceita pelo dono após challenge "cuidado com workarounds").

**Estratégia aplicada:**

1. **`bun update`** primeiro (semver-compatible): bumpou lint-staged 16.2→16.4, secretlint 11.2→11.7, @sentry/bun 10.42→10.49, elysia 1.4.27→1.4.28, pg 8.16→8.20, pino 10.1→10.3 e outros. Sozinho não resolveu nenhum high — os parents pinavam versões antigas das transitivas dentro de seus ranges.
2. **Upgrade secretlint 11→12** — major bump do CLI de pre-commit. Passou sem breakage (`bun run secrets:check` OK).
3. **Upgrades `rerouted`** (não eram sobre CVEs):
   - `ultracite 6→7`: descoberta de que 7 migra Biome → Oxc (oxlint + oxfmt). **Não é CVE fix, é migração de engine.** Registrado como **CP-46** e mantido em 6.3.10.
   - `better-auth 1.4→1.6`: exige schema migration (coluna `verified` em `twoFactor`) + mudança semântica de `freshAge`. **Não é CVE fix, é migração de framework.** Registrado como **CP-47** e mantido em ~1.4.22.
4. **Overrides em `package.json`** para as transitivas vulneráveis:
   - `@isaacs/brace-expansion: ^5.0.1`, `@trpc/server: ^11.16.0`, `defu: ^6.1.7`, `kysely: ^0.28.16`, `lodash: ^4.18.1`, `minimatch: >=3.1.3`, `picomatch: >=2.3.2`
   - Resolveu todas as chains sem romper parent APIs (bun dedupou minimatch para 10.2.5 inclusive onde o parent declarava `^3.1.1`).
5. **Contenção de side-effects de `bun update`** (não relacionados a CVE):
   - `zod 4.1.13 → 4.3.6` quebrou ~16 models que usam `.partial()` sobre schemas com `.refine()` (Zod 4.3 proíbe essa combinação). Pinado a `~4.1.13`. **CP-48** registra a migração.
   - `react 19.2.4 → 19.2.5` causou mismatch com `react-dom@19.2.4` (pinado transitivamente por `@react-email/components`). Pinado a `19.2.4` exato. **CP-49** registra a sync definitiva.
6. **CI threshold**: `.github/workflows/lint.yml` subiu `--audit-level=critical` → `high`. README.md atualizado.

**Débitos resolvidos** em 7.7: follow-up completo de RU-4a/RU-4b. Triagem dos 13 highs encerrada.

**CPs novos criados** (bucket 🟡): CP-46, CP-47, CP-48, CP-49, CP-50 — todos representam migrações legítimas com escopo próprio, não deveriam ter sido forçados dentro de CP-40. CP-50 foi descoberto quando o CI falhou no type check pós-commit da PR #248: `bun x tsc` no CI puxou TS 6.0.3 ephemerally (TS não estava em devDeps), e TS 6 transformou a deprecation de `moduleResolution=node` em erro. Contenção aplicada na mesma branch: `typescript: "~5.9.3"` adicionado ao `devDependencies` — fecha o gap de reprodutibilidade (TS nunca foi dep explícita) e destrava o lint CI.

**Validação:**
- ✅ `bun audit --audit-level=high` — 0 vulnerabilidades.
- ✅ `bun run lint:types` — clean.
- ✅ `bun run lint:check` — 566 arquivos, sem fixes.
- ✅ `bun run secrets:check` — clean.
- ✅ Suíte de testes afetada pelas deps de runtime (errors, logger, request-context, audit, api-keys, employees, medical-certificates, cost-centers, subscription + modules/payments + modules/occurrences + modules/organizations + modules/auth + lib/): 407+ pass / 0 fail. react/react-dom mismatch warning eliminado após pin.

**Arquivos tocados:**
- `package.json` — overrides block (novo), zod pin, react pin, deps bumps via `bun update`.
- `bun.lock` — regenerado.
- `.github/workflows/lint.yml` — threshold.
- `README.md` — tabela CI/CD.
- Seção 7.5 + 7.0 — CP-40 marcada done, 4 novos CPs, próxima ação atualizada.

**Lições:**
- **Auditar o escopo antes de aceitar o título**. CP-40 foi descrita como "dev deps" mas 6 chains passavam por prod deps. Prosseguir sem reler teria levado a merge incompleto.
- **Distinguir CVE fix de framework upgrade**. Ultracite 6→7 e better-auth 1.4→1.6 foram apresentados inicialmente como "upgrade proper" — mas são migrações de engine/framework com escopo arquitetural, não CVE fixes. Contenção via overrides + CP separado preserva disciplina de escopo (reforma aceita após challenge do dono "cuidado com workarounds").
- **`overrides` não é workaround**. É o mecanismo oficial do npm/bun para patching transitivo. O workaround seria `--ignore=<CVE>` sem contexto — removido do plano.
- **`bun update` tem side-effects silenciosos**. Zod 4.1→4.3 e react 19.2.4→19.2.5 pegaram carona em uma ação de segurança e quebraram runtime. Pinning defensivo (~zod, react exato) contém o problema sem adiar a fix proper.
- **CI threshold sobe em fases**. `critical` → `high` agora porque zeramos. Dependabot vai reportar novos highs eventualmente; backlog contínuo.

### 2026-04-22 — CP-45 concluída + ordem de execução do bucket 🟡 definida

Primeira ação do bucket 🟡 fechada. **CP-45** (Local Backup Retention no Coolify) aplicada via UI pelo dono — valores atuais: 7 backups / 7 dias / 2 GB (local) + 30 backups / 30 dias / 8 GB (R2, inalterado). Runbook em `docs/runbooks/database-backup.md` atualizado: seção "Atenção — local retention ilimitada" substituída por "Retention policy" com a tabela em vigor.

**Ordem de execução do bucket 🟡 adicionada em 7.5** — 5 ondas organizadas por ganho de compliance/CI por hora de trabalho:
1. **Onda 1 — Ganhos rápidos de CI/segurança**: CP-40 (M) → CP-7..CP-9, CP-13, CP-20..CP-23 (S's). CP-40 primeiro destrava threshold `--audit-level=high` no CI
2. **Onda 2 — Compliance LGPD**: CP-42 (convenção `changes: before/after` + PII redacted) → CP-43 (audit de reads em dados sensíveis Art. 11). Endereçam débito #96
3. **Onda 3 — Qualidade pontual**: 9 S's + CP-25, CP-30, CP-41 (M) — agrupáveis em 2-3 PRs temáticas
4. **Onda 4 — Cloudflare + Observabilidade**: CP-14→15→16 sequencial; CP-17/18/19 paralelo (CP-18 depende de CP-3)
5. **Onda 5 — Refactors XL**: CP-1 (destrava CP-4/26/28/32) → CP-2 → CP-3; CP-5, CP-6, CP-33, CP-38, CP-44

**Racional da ordem:** Ondas 1-2 entregam valor compliance/CI em dias, enquanto os XL (CP-1, CP-2) ficam para janela dedicada com worktree isolado conforme 7.5.1. Reavaliar a cada 5 CPs concluídos — aprendizado do bucket 🔴 mostrou que escopo real difere do pessimismo do audit.

### 2026-04-22 — RU-10 concluída (runbook de backup) + **Bucket 🔴 fechado**

Última ação pendente do bucket urgente. Cria `docs/runbooks/database-backup.md` documentando o processo de backup existente em Coolify + Cloudflare R2.

**Configuração atual validada via UI do Coolify:**
- Backup habilitado, database `synnerdata`, frequência diária 00:00 UTC, timeout 3600s.
- Storage dual: local (`/data/coolify/backups/...`) + Cloudflare R2.
- Retention R2: 30 backups / 30 dias / 8 GB (whichever first).
- Formato: `pg_dump` .dmp; tamanho atual ~310 KB.

**Conteúdo do runbook (6 seções):**
1. Estado atual (tabela com valores concretos)
2. Como verificar saúde dos backups (passos na UI)
3. Procedimento de restore — caminho A (UI Coolify, recomendado) e caminho B (pg_restore direto, offline)
4. Teste periódico trimestral — checklist preenchível + tabela histórica de execuções (primeira execução pendente)
5. Atenção sobre local retention ilimitada (rastreado como CP-45)
6. Contatos e escalação (template)

**Finding operacional**: Local Backup Retention está configurado como 0/0/0 = unlimited. Com a base atual é inofensivo (~113 MB/ano), mas vai acumular indefinidamente. Registrado como **CP-45** (🟡, S) — ajuste operacional simples na UI do Coolify quando conveniente.

**Débito resolvido em 7.7:** #92 (backup policy não documentada).

**Validação:**
- ✅ Arquivo renderiza (markdown); links internos corretos.
- ✅ Pasta `docs/runbooks/` adicionada ao allowlist do `.gitignore` (seguindo padrão de `docs/improvements/` e `docs/reports/`).
- ✅ Referências cruzadas: changelog → runbook → CP-45 no checklist formam circuito coerente.

**Lições:**
- **Operational knowledge > generic best practices**: escrever runbook com valores concretos extraídos da UI do Coolify (frequência, retention, caminhos de storage) vale muito mais que um template genérico com `<!-- TODO -->`. Custo marginal: 1 screenshot do dono + 5min lendo. Benefício: runbook imediatamente operacional.
- **Runbook é vivo**: a tabela de histórico de testes trimestrais (primeira execução pendente) torna o documento autoatualizável — cada teste adiciona linha. Diferente de documentos estáticos que envelhecem sem sinal.

## **Bucket 🔴 concluído (10/10) — 2026-04-22**

Fechamento do bucket urgente. Cronograma original era "até 30 dias"; foi entregue em 1 dia (2026-04-21 audit → 2026-04-22 todas as 10 RUs mergeadas) — menos pelo ritmo, mais pelo fato de muitas ações revelaram-se menos complexas do que o pessimismo inicial do audit. Ações que surpreenderam:

- **RU-1** virou urgente de verdade (hotfix SMTP_FROM pós-merge)
- **RU-4** explodiu de S → L (2 criticals + 17 highs em deps, split em RU-4a/RU-4b/CP-40)
- **RU-7** mudou de direção (recomendei deletar, usuário rejeitou, executei refactor) — lição "unused ≠ dead"
- **RU-9** encolheu de L → M (padrão já estava limpo; audit virou confirmação)
- **RU-10** foi S real (UI do Coolify tinha todos os valores prontos)

**CPs gerados ao longo do bucket**: CP-39 (SMTP_FROM split), CP-40 (dev deps highs), CP-41 (integration tests workflow), CP-42 (changes convention LGPD), CP-43 (read audit LGPD), CP-44 (BOLA CI automation), CP-45 (Coolify local retention). 7 follow-ups úteis que saíram da execução.

**Débitos resolvidos no bucket 🔴** (seção 7.7): #14-#20, #22, #23, #24, #30, #54, #76, #77, #92, #96 (parcial via CP-42/43). Total: ~15 débitos fechados.

Próximo passo: priorização do bucket 🟡 com o dono — 45 ações disponíveis.

### 2026-04-22 — RU-9 concluída (BOLA audit + cross-org isolation tests)

Auditoria estática de multi-tenant em todos os 50 services + testes dinâmicos em 3 módulos representativos.

**Decisão sobre Compozy**: não utilizado. Escopo declarado L, mas na prática o padrão do projeto (filter por `organizationId` em toda query) é tão consistente que varredura foi mecânica. Compozy adicionaria PRD/TechSpec/Tasks para algo sem decisão arquitetural. **Substituí por "PRD-lite"**: o próprio relatório de audit (`docs/reports/2026-04-22-bola-audit.md`) serve como artifact de rastreabilidade com matriz explícita dos 50 services. Disciplina preservada, overhead reduzido.

**Artifacts entregues:**
- `docs/reports/2026-04-22-bola-audit.md` — matriz completa (29 ✅ + 21 N/A + 0 ⚠️), padrões arquiteturais documentados, spot-check de 7 services representativos, classificação por módulo.
- 3 novos test files (4 testes cada = 12 testes totais):
  - `modules/employees/__tests__/employee-org-access.test.ts`
  - `modules/occurrences/medical-certificates/__tests__/medical-certificate-org-access.test.ts`
  - `modules/organizations/cost-centers/__tests__/cost-center-org-access.test.ts`

**Cada teste verifica**: user da org B recebe 404 em GET/PUT/DELETE de recurso da org A, e LIST da org B não inclui recursos da org A.

**Veredicto**: nenhum gap de BOLA encontrado. Padrão multi-tenant está bem aplicado em 100% dos services que manipulam entidades org-scoped. Os 21 services classificados N/A têm justificativa explícita (catálogos globais, Pagar.me wrappers, admin cross-org deliberado, public endpoints).

**Débitos parcialmente resolvidos em 7.7**: OWASP API1:2023 (BOLA) validado como coberto no código atual. Testes novos previnem regressão nos 3 módulos representativos.

**CP-44 registrado** (🟡, M): script de audit BOLA automatizado em CI — AST-scan de queries sem filtro `organizationId`. Preventivo para não perder o estado limpo atual em PRs futuras.

**Validação:**
- ✅ 12/12 novos testes verdes (4 por módulo × 3 módulos).
- ✅ `bun run lint:types` — clean.
- ✅ `npx ultracite check` nos 3 test files — clean.

**Lições:**
- **Padrão consistente é seu próprio audit**: quando o codebase aplica uma convenção de forma disciplinada, auditar é spot-check + grep, não re-verificação exaustiva. O esforço L assumido no checklist era pessimista em relação ao estado real do código.
- **Tests como defesa contra regressão > snapshot**: os 12 testes novos valem mais que um report dateado — viram parte da suite de CI e pegam regressões automaticamente. Relatório complementa, não substitui.
- **"PRD-lite" como alternativa ao Compozy**: para ações L sem trade-off arquitetural, um artifact markdown no PR fornece mesma disciplina com fração do overhead. Compozy continua sendo a escolha certa para XL com decisões de design.

### 2026-04-22 — RU-8 concluída (auditPlugin movido para src/plugins/)

Move `src/lib/audit/audit-plugin.ts` e seus testes para `src/plugins/audit/`. Refactor de localização puro — sem mudança de comportamento.

**Por que agora**: débito #5 (lib/audit convivendo com modules/audit) e #30 (plugin em lib/ quando devia estar em plugins/) são sobre organização semântica da seção 7.6: `lib/` é para utilitários puros; `plugins/` é para Elysia plugins (uso de `.derive`/`.as("scoped")`). auditPlugin pertence a plugins/.

**Movimentos** (git recognized both as renames, 98% + 100% similarity):
- `src/lib/audit/audit-plugin.ts` → `src/plugins/audit/audit-plugin.ts`
- `src/lib/audit/__tests__/audit-plugin.test.ts` → `src/plugins/audit/__tests__/audit-plugin.test.ts`
- `src/lib/audit/` deletado (vazio após)

**Imports**: 1 import atualizado (do próprio test file). Nenhum outro importador em produção — cf. changelog de RU-7, plugin ainda sem consumidores ativos (CP-43 vai mudar isso quando adotar para read audit).

**`src/plugins/` inaugurado**. É o primeiro inquilino. CP-1 (XL, bucket 🟡) vai migrar os demais (logger, health, cors, ratelimit, shutdown, auth, cron, sentry, request-context). RU-8 basicamente adiantou o primeiro caso do CP-1 porque fazia parte natural do Grupo 3 (Audit refactor).

**Débitos resolvidos em 7.7**: #5 e #30.

**Grupo 3 fechado** (per metodologia 7.5.1): RU-6 (audit em API keys) + RU-7 (auto-context + strict types) + RU-8 (relocation) entregues em 3 PRs sequenciais (#241, #242, próxima).

**Validação**:
- ✅ 289 testes verdes em `plugins/audit`, `modules/audit`, `api-keys`, `auth`, `subscription`.
- ✅ `bun run lint:types` — clean.
- ✅ `npx ultracite check src/plugins/` — clean.
- ✅ Política (2) não-regressão: todos os 11 call-sites de `AuditService.log` direto (auth.ts, subscription-mutation, api-keys) continuam verdes. Nenhum importa de `@/lib/audit/` — grep confirmou.

**Próximo grupo**: bucket 🔴 só resta RU-9 (L, BOLA audit) e RU-10 (S, runbook backup). RU-9 merece Compozy completo pela amplitude do escopo (varredura de N services + testes cruzados em ≥3 módulos).

### 2026-04-22 — RU-7 concluída (auditPlugin auto-context + strict types)

Refactor do `auditPlugin` em `src/lib/audit/audit-plugin.ts`. Fecha débitos #23 (context manual) e #24 (loose types) e corrige gaps reveladas durante o refactor.

**Investigação revelou que o plugin estava dormente**: zero consumidores em produção. Apenas seu próprio arquivo de teste importava. Todos os 11 call-sites de audit no projeto usam `AuditService.log` direto (auth.ts, subscription, api-keys pós RU-6). Primeira recomendação foi **deletar o plugin** como código morto.

**Feedback do dono do projeto mudou a direção**: o plugin não é código morto — é **infraestrutura dormente** cuja razão de não adoção é precisamente a fricção do context manual (débito #23). Refatorá-lo remove a fricção; deletá-lo removeria infra que LGPD vai exigir (audit de reads sensíveis — Art. 11). Lição registrada: "unused ≠ dead" quando o use case é compliance diferida.

**Arquivos modificados:**
- `src/lib/audit/audit-plugin.ts` — derive scoped agora lê `user`, `session` e `request` do contexto (tipo cast via `AuthContext`). Signature de `audit(entry)` simplifica (sem context param). Helper local `extractIpAddress` para lógica de IP. Plugin deve ser montado após `betterAuthPlugin` em rotas com `{ auth: {...} }`.
- `src/modules/audit/audit.model.ts` — `AuditLogEntry.action`/`resource` perdem `| string` (enforce enums). Enums ganham `"accept"` (action) e `"invitation"` (resource) — valores legítimos já usados em `auth.ts:auditInvitationAccept`, antes tipados frouxos.
- `src/lib/audit/__tests__/audit-plugin.test.ts` — rewrite completo com 6 testes refletindo a nova API (mock de `user`/`session` via `.derive()`, chamada `audit(entry)` sem context). Removido o 7º teste que documentava o débito #24.
- `src/modules/audit/__tests__/get-audit-logs.test.ts` — fix de regressão consequente: `resource: "pagination-test"` (string ad-hoc) → `"user"` (valor válido do enum). Intenção do teste (pagination) preservada.

**Débitos resolvidos em 7.7**: #23, #24. Débito novo **#96** registrado (convenção inconsistente de `changes` + reads sensíveis não auditados).

**Novos CPs registrados no bucket 🟡** (descobertos durante a RU):
- **CP-42 (M)**: convenção de `changes: { before, after }` em mutations + tratamento de PII (redacted/hash) + retro em 3 módulos críticos.
- **CP-43 (M, depende de RU-7)**: audit de reads em dados sensíveis via `auditPlugin` — destrava reconstituição de acessos para LGPD Art. 48.

**Validação:**
- ✅ 289 testes verdes em `lib/audit`, `modules/audit`, `api-keys`, `auth`, `payments/subscription`.
- ✅ `bun run lint:types` — clean (tightening expôs 2 enum gaps reais que foram adicionados).
- ✅ `npx ultracite check src/lib/audit/ src/modules/audit/` — clean.

**Decisão sobre integration test com auth macro real**: não adicionei. A invariante testada é "plugin lê user/session do contexto"; tests com `.derive()` mock exercitam isso. Integração com `betterAuthPlugin + auth: {}` é combinação de plugins (não contrato do plugin). Se um futuro adopter encontrar problema, adicionamos no contexto daquela adoção (CP-43).

**Lições:**
- **"Unused" não implica "dead"** quando o código é infraestrutura planejada para um caso de uso diferido. Validar o porquê da não-adoção antes de deletar.
- **Compliance tem gravidade própria no juízo de escopo**: deletar código que endereça LGPD requer muito mais evidência do que "ninguém usa hoje". O audit de reads sensíveis é obrigação legal em 30-90 dias (janela LGPD), não aspiracional.
- **Tightening de tipos revela débitos escondidos**: adicionar "accept"/"invitation" aos enums documenta valores que já eram usados em produção — o projeto tinha loose types e isso mascarava a semântica real dos audit entries.

### 2026-04-22 — RU-6 concluída (audit em operações de API keys)

Primeira ação M do bucket 🔴. Adiciona `AuditService.log()` em `ApiKeyService.create/revoke/delete` para garantir rastreabilidade de compliance (LGPD, auditoria de operações admin-only).

**Decisão sobre Compozy**: a metodologia 7.5.1 prevê Compozy a partir da primeira M. Descumprido deliberadamente nesta RU — o escopo era mecânico (3 chamadas de log, 1 enum, mudança de signature), sem trade-offs arquiteturais. Compozy (PRD → TechSpec → Tasks → exec) agrega rigor onde há decisão; aqui o design é óbvio. Reservamos Compozy para CP-1/CP-2 (XL) e futuras M que envolvam design.

**Arquivos modificados:**
- `src/modules/audit/audit.model.ts` — adiciona `"api_key"` ao `auditResourceSchema` enum.
- `src/modules/admin/api-keys/api-key.service.ts` — importa `AuditService`, extrai IP/UA dos headers via helper local `extractAuditMetadata`. Signatures de revoke/delete mudam de `(headers, keyId)` para `(userId, headers, keyId)`. Payload de create inclui prefix mas **nunca a key completa** — preserva invariante do módulo.
- `src/modules/admin/api-keys/index.ts` — controller passa `user.id` nos 3 endpoints.
- `src/modules/admin/api-keys/CLAUDE.md` — nova seção "Audit trail" com tabela de operação → action → changes.
- 3 arquivos de teste — 4 novos casos TDD verificando o audit trail e a invariante "key completa NÃO aparece no entry".

**Formato do audit:**

| Operação | `action` | `changes` |
|---|---|---|
| create | `create` | `after: { prefix, name, organizationId, isGlobal }` |
| revoke | `update` | `before: { enabled: true }`, `after: { enabled: false }` |
| delete | `delete` | — |

**Débito resolvido em 7.7:** #54 (API keys não auditam operações admin).

**Validação:**
- ✅ 35 testes verdes em `src/modules/admin/api-keys/__tests__/` (31 baseline + 4 novos).
- ✅ 177 testes verdes em áreas afetadas (api-keys, audit, lib/audit, auth).
- ✅ `bun run lint:types` — clean.
- ✅ `npx ultracite check` nos arquivos tocados — clean.

**Lição:** a metodologia "Compozy a partir da primeira M" do 7.5.1 é **guideline, não lei**. Avaliar a complexidade real da ação (trade-offs arquiteturais × implementação mecânica) antes de invocar o pipeline. Registrar discordância no changelog quando fizer sentido — como aqui.

### 2026-04-22 — RU-5 concluída (SKIP_INTEGRATION_TESTS documentado)

Débito #77 era "validar semântica da flag". Análise revelou **duas verdades**:

**Verdade 1 — a semântica é legítima**: a flag gateia só 16 casos em 6 arquivos de `src/modules/payments/*`, todos fazendo chamadas HTTP reais a Pagar.me. DB-level integration tests (Postgres + `app.handle(Request)`) **não** usam a flag e rodam sempre em CI. Skipar API externa é pattern defensável (flakiness, credentials, sandbox pollution).

**Verdade 2 — há um gap real**: o env var `SKIP_INTEGRATION_TESTS=true` está no `env:` do **job inteiro** em `test.yml`, então afeta tanto o step de PR quanto o step de full suite no cron (linhas 85-87). Resultado: **esses 16 casos não rodam em NENHUM workflow** — nem PR, nem schedule diário, nem manual dispatch. Só em máquina de dev quando alguém explicitamente desativa. Para cliente em produção processando pagamentos, rot de integração Pagar.me significa risco real quando a API deles mudar contrato.

**RU-5 (esta entrega)** — documentação:
- `src/test/support/skip-integration.ts`: docstring expandido com semântica, uso, motivos do skip em CI, como rodar local, e aviso do gap (CP-41).
- `.claude/CLAUDE.md`: nova subseção em "Execução de Testes" explicando a flag + tabela de contextos + disciplina local até CP-41.
- `README.md`: tabela CI/CD atualizada com nota que externos são skipados em PR e cron.

**Decisão de escopo**: não implementar o workflow dedicado (CP-41). RU-5 era Ação S; criar workflow + configurar secrets Pagar.me sandbox é Ação M com decisão operacional (é dono quem gerencia credenciais de pagamento). Esse tipo de escopo não deve subir dentro de RU numerada.

**CP-41 registrado (🟡, M)**: workflow `test-integration.yml` dedicado com `workflow_dispatch` + schedule semanal + secrets sandbox. Destrava cobertura real de `src/modules/payments/*` em CI.

**Débito resolvido em 7.7:** #77 (parcial — a semântica foi validada e documentada; a execução em CI pendente é agora CP-41).

**Lição**: um débito de checklist pode ser **mais profundo do que o título sugere**. "Validar semântica" soava simples — mas a validação revelou que a flag, aplicada no job todo, também exclui os testes do cron que supostamente dava cobertura completa. Ler o texto da ação não basta — é preciso investigar a configuração real do CI.

### 2026-04-22 — RU-4b concluída (bun audit reintroduzido no CI)

Fecha o segundo terço da RU-4 originalmente escrita no checklist. Adiciona step `bun audit --audit-level=critical` em `.github/workflows/lint.yml` após o `secrets:check`.

**Threshold inicial = `critical`** (não `high` como o checklist original previa):
- RU-4a zerou as 2 criticals em direct deps, mas restam 13 highs em dev tooling.
- Adotar `--audit-level=high` bloquearia PRs por CVEs em `ultracite`/`commitizen`/`secretlint`/`lint-staged` que não têm runtime impact.
- Upgrade pra `high` acontece após CP-40 (triagem dos dev deps).

**Correções no README**:
- Linha 201: `bun pm audit` → `bun audit --audit-level=critical` (o comando foi renomeado pelo Bun; o README ficou mentindo por ~6 semanas desde o commit `1958c52`).
- Linha 205: "Trivy scan (imagem Docker + filesystem)" → "Trivy container scan (imagem Docker de produção)" — o filesystem scan foi removido em 2026-03-09 (commit `f5e8bc2`), README nunca foi sincronizado.

**Débito 100% resolvido em 7.7**: #76 (CI security audit).

**Validação:**
- ✅ `bun audit --audit-level=critical` local — exit code 0 (0 criticals).
- ✅ CI do próprio PR valida a integração (se a step não funcionasse, o próprio PR falharia no lint job).

**Lição extra**: documentação no README sobre CI/CD deu duas mentiras simultâneas no commit `1958c52` (anunciou audit que estava sendo removido + declarou filesystem scan que também foi removido no mesmo dia). É sinal de **ausência de review cruzado entre mudança de código e documentação**. Considerar como prática: sempre que um workflow for alterado, abrir README.md no mesmo PR e auditar a seção CI/CD.

### 2026-04-22 — RU-4a concluída (patch CVEs em auth + db deps)

**Escopo original de RU-4** era "adicionar `bun pm audit` no CI — Ação S". Ao executar, descobertas em sequência rearranjaram completamente o escopo:

1. **Comando renomeou duas vezes**: checklist dizia `bun pm audit`, commit `f5e8bc2` de 2026-03-09 mudou pra `bun pm scan`, e Bun 1.3.x reverteu pra `bun audit` direto. Histórico do projeto acompanhou a instabilidade mas o checklist ficou desatualizado.

2. **Audit foi deliberadamente removido** do `lint.yml` em 2026-03-09 (commit `1958c52`) com justificativa "Trivy container scan covers this". **Justificativa errada**: Trivy scan do binário Bun não indexa advisories de npm da mesma forma. Evidência empírica: PR #237 passou com ✅ Trivy enquanto `bun audit` reporta simultaneamente 2 criticals em direct deps de produção. Janela silenciosa de ~6 semanas acumulando CVEs.

3. **Contradição documental**: o mesmo commit `1958c52` que removeu o step adicionou ao README a seção CI/CD declarando que `bun pm audit` roda no Lint workflow. README mentiu por 6 semanas.

4. **CVEs concretos encontrados hoje no projeto**: 2 critical + 17 high. Entre eles, 2 em **direct production deps**:
   - `better-auth 1.4.5` → GHSA-xg6x-h9c9-2m83 (2FA bypass, critical)
   - `drizzle-orm 0.45.0` → GHSA-gpj5-g38j-94v9 (SQL injection, high)
   - Transitive: `fast-xml-parser` via `@types/nodemailer 7.0.4` → `@aws-sdk/client-sesv2` (critical, dev-only mas ainda assim no lockfile)

**Decisão**: split da RU-4 em três ações sequenciais.

**RU-4a (esta entrega)** — patch security em deps:
- `better-auth 1.4.5 → ~1.4.22` (pin tilde; upgrade pra 1.6.x ficará em PR dedicado)
- `drizzle-orm 0.45.0 → 0.45.2` (caret, patch puro)
- `@types/nodemailer 7.0.4 → 7.0.11` (removeu dep direta de @aws-sdk, elimina fast-xml-parser do tree)

Resultado: **criticals 2 → 0, highs 17 → 13**. Highs remanescentes são 100% em dev tooling (minimatch/picomatch/lodash via ultracite/commitizen/secretlint/lint-staged), zero em runtime.

**Validação**: 348 testes verdes (auth, admin, employees, organizations, audit, logger, errors, request-context), type check + lint limpos. `better-auth-localization 2.3.1` continua compatível (peerDep `^1.4.19`).

**RU-4b (pendente)** — reintroduzir `bun audit` no `lint.yml` com `--audit-level=critical` inicialmente (threshold sobe pra `high` depois do CP-40). Corrigir README linha 201. Documentar que Trivy ≠ bun audit.

**CP-40 (novo, bucket 🟡, a registrar)** — triagem dos 13 highs em dev deps: upgrade de ultracite/commitizen/secretlint/lint-staged para versões que resolvem minimatch/picomatch/lodash. Alternativa: `--ignore=<CVE>` com justificativa documentada.

**Débito coberto em 7.7:** parcialmente #76 (CI security audit) — fecha completamente após RU-4b.

**Lições:**
- **Histórico do código é fonte de verdade complementar ao checklist**: a decisão de remover o audit no commit `1958c52` não estava registrada no checklist da iniciativa (fase audit começou em 2026-04-21, depois da remoção). Varredura de `git log` antes de aceitar uma ação "nova" pode revelar que é uma ação de reversão — muda o enquadramento.
- **Trivy container scan não é equivalente a dep audit**: devem coexistir. Trivy varre a imagem final; `bun audit` varre o dep tree completo (incluindo dev). CP-40 vai formalizar essa distinção na doc do security.yml.
- **Ação "S" no checklist pode esconder uma ação "L"**: RU-4 era Ação S no papel; na prática virou pesquisa de histórico + análise de advisory + 3 upgrades + triagem + split em múltiplas entregas. Revisitar estimativas quando uma ação revelar complexidade oculta é parte da disciplina — não pressionar pra caber no esforço planejado originalmente.

### 2026-04-22 — RU-3 concluída (idleTimeout explícito)

**Ação S** no bucket 🔴. Adiciona `idleTimeout: 30` ao `serve` config em `src/index.ts`, extraído como constante `REQUEST_IDLE_TIMEOUT_SECONDS`.

**Descoberta durante a execução**: o débito #20 original afirmava que "Bun default é 255s" — está **errado**. A doc atual do Bun confirma default de **10 segundos** (255s é o valor *máximo* permitido). Correção aplicada no débito #20 em 7.7 e na nota logo abaixo da tabela de débitos. Isso rebaixou a urgência percebida de RU-3 — a API nunca esteve pendurada indefinidamente — mas mantém-se o valor de explicitar para reduzir acoplamento com default implícito.

**Valor escolhido (30s)**: 3x o default atual do Bun, com margem pra queries de DP pesadas (relatórios via API key do Power BI do cliente), chamadas externas (Pagar.me, SMTP) e webhooks. Ainda bem abaixo do máximo (255s). Para endpoints long-running futuros (streaming/export), usar `server.timeout(req, N)` per-request.

**Naming**: usa-se `REQUEST_IDLE_TIMEOUT_SECONDS` em vez do `REQUEST_TIMEOUT_MS` sugerido inicialmente no checklist — mantém a unidade da API do Bun, evita conversão mental. Não é env var: é runtime config que raramente muda entre ambientes.

**Política de teste**: categoria (4) N/A conforme 7.5.2 — teste de timeout real é custoso. Validação:
- ✅ `bun run lint:types` — clean
- ✅ `npx ultracite check src/index.ts` — clean
- Smoke test visual no boot: aplicação sobe sem erro com nova config de serve

**Débito resolvido em 7.7:** #20 (request timeout global ausente).

**Lições:**
- **Validar premissas do checklist antes de implementar**: o débito #20 era baseado em um valor default errado (255s vs 10s real). A correção só saiu porque pesquisei a doc atual do Bun antes de codar. Próximas RUs de hardening de runtime: sempre validar defaults na doc atual da lib/runtime.
- **Nome da constante ≠ nome no checklist**: o checklist sugeria `REQUEST_TIMEOUT_MS`. Não segui — a API do Bun é em segundos, e forçar `_MS` exigiria conversão. Discordar do texto do checklist é válido quando a razão técnica bate.

### 2026-04-22 — RU-2 concluída (requestId no body do erro)

**PR:** [#236](https://github.com/tlthiago/synnerdata-api-b/pull/236) — mergeada em `preview`.

**Escopo expandido**: a PR original previa tocar apenas `src/lib/errors/`, mas durante a TDD descobrimos que o `derive` do Elysia não dispara para rotas 404 não-matched nem parse errors (issue [elysiajs/elysia#1467](https://github.com/elysiajs/elysia/issues/1467)). Sem o fix do lifecycle, RU-2 deixaria ~30% dos erros 404 reais em produção (scanners/bots) sem `requestId`. Decisão registrada: expandir o escopo para incluir a correção arquitetural no `loggerPlugin`.

**Arquivos modificados:**
- `src/lib/logger/index.ts` — geração do `requestId` movida de `derive` para `onRequest` (primeiro hook do lifecycle, dispara antes do route matching). `derive` passa a apenas ler do `AsyncLocalStorage` para expor no context tipado. Hooks `onAfterHandle` e `onError` de header removidos (redundantes — header agora setado universalmente em `onRequest`).
- `src/lib/logger/CLAUDE.md` — novo ADR "onRequest e não derive"; diagrama de fluxo atualizado; seção obsoleta "onError para X-Request-ID" removida.
- `src/lib/errors/base-error.ts` — `ErrorResponse.error.requestId?` + `toResponse(requestId?)` opcional.
- `src/lib/errors/error-plugin.ts` — injeta `requestId` nos 4 branches (AppError, VALIDATION, NOT_FOUND, unhandled). Comentários descritivos removidos (regra de código autoexplicativo).
- `src/lib/errors/__tests__/error-plugin.test.ts` — 5 testes TDD novos, um por branch de erro.

**Débito resolvido em 7.7:** #16 (MVP — `requestId` ausente no body do erro).

**Validação executada:**
- ✅ `bun test src/lib/logger/__tests__/ src/lib/errors/__tests__/ src/lib/request-context/__tests__/ src/lib/audit/__tests__/audit-plugin.test.ts` — 37 pass / 0 fail
- ✅ `bun run lint:types` — clean
- ✅ `npx ultracite check src/lib/logger/ src/lib/errors/` — clean

**Lições operacionais:**
- **Validação empírica antes de compromisso arquitetural**: a decisão de mover para `onRequest` foi precedida por um probe isolado confirmando que `set.headers` setados em `onRequest` persistem em 200/500/404 unmatched. Evitou retrabalho.
- **Escopo vs disciplina**: expandir o escopo de uma RU "S" (errorPlugin) para incluir um fix em outro plugin (loggerPlugin) só foi aceitável porque o fix era (a) pequeno e cirúrgico, (b) revelava que a implementação parcial era inferior, (c) resolvia bug latente além da RU. Não é padrão.
- **Commits intermediários red**: aceitável quando o split `test → fix` segue o histórico do projeto e o merge final deixa a árvore verde.

### 2026-04-22 — Hotfix SMTP_FROM (regressão de RU-1)

Deploy em produção quebrou no boot do container: `SMTP_FROM="Synnerdata <contato@synnerdata.com.br>"` (formato RFC 5322 display name) não passa no `z.email()` apertado pela RU-1.

**Hotfix em `preview`** (commit `a809a66`): novo `smtpFromSchema` via `.refine()` extrai o endereço do formato `Name <email>` e delega ao `z.email()`. Aceita os dois formatos suportados pelo Nodemailer. Baseline de testes mantido + 2 casos novos (aceita display name válido; rejeita display name com email inválido). 26/26 testes verdes, lint limpo.

**CP-39 registrado** no bucket 🟡 (Qualidade geral): separar `SMTP_FROM` em `SMTP_FROM` (endereço puro) + `SMTP_FROM_NAME` (display name opcional). O hotfix acomoda a regressão; o design de longo prazo é separar concerns, permitindo `z.email()` sem refine. Esforço S, sem dependências.

### 2026-04-21 — RU-1 concluído (hardening `src/env.ts`)

**Branch:** `fix/urgent-foundation-hardening` (Grupo 1 — fundação; RU-2 e RU-3 virão na mesma branch).

**Arquivos modificados:**
- `src/env.ts` — schema endurecido: (a) `envSchema` exportado; (b) `NODE_ENV: z.enum(...)` com default; (c) `BETTER_AUTH_SECRET.min(32)`; (d) `PII_ENCRYPTION_KEY.regex(/^[0-9a-fA-F]{64}$/)`; (e) `SMTP_FROM: z.email()`; (f) `CORS_ORIGIN.describe(...)`; (g) `superRefine` exigindo `SMTP_USER`/`SMTP_PASSWORD` em produção; (h) `isProduction` agora usa `env.NODE_ENV` em vez de `process.env.NODE_ENV` direto.
- `src/__tests__/env.test.ts` (novo) — 24 testes cobrindo todas as 6 regras novas.

**Débitos resolvidos em 7.7:** #14, #15, #16, #17, #18, #19.

**Validação executada:**
- ✅ `bun run lint:types` — sem erros
- ✅ `bun run lint:check` — 563 arquivos verificados, sem warnings
- ✅ `bun test src/__tests__/env.test.ts` — 24 pass / 0 fail (169ms)
- ✅ `bun test src/lib/audit/__tests__/` — 7 pass (baseline `auditPlugin` preservado)
- ✅ Não-regressão: `errors/__tests__/` + `modules/audit/__tests__/` + `modules/admin/api-keys/__tests__/` — **62 pass / 0 fail** (20.4s)

**Valores atuais em `.env` e `.env.test`** compatíveis com as novas regras: `BETTER_AUTH_SECRET` com 32 chars, `PII_ENCRYPTION_KEY` com 64 hex chars, defaults (`SMTP_FROM=noreply@synnerdata.com`) válidos. **Ação externa recomendada:** auditar o GitHub secret `BETTER_AUTH_SECRET` usado no `test.yml` para confirmar `.min(32)` (não auditável via código).

**Próxima ação:** RU-2 (incluir `requestId` no body do erro — TDD no `errorPlugin`).

---

## 9. Referências

- [OWASP API Security Top 10 — 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP API Security Project](https://owasp.org/www-project-api-security/)
- [ElysiaJS — Deploy to Production](https://elysiajs.com/patterns/deploy)
- [ElysiaJS — Config](https://elysiajs.com/patterns/configuration)
- [elysiajs-helmet (GitHub)](https://github.com/aashahin/elysiajs-helmet)
- [Node.js Security Best Practices 2026](https://medium.com/@sparklewebhelp/node-js-security-best-practices-for-2026-3b27fb1e8160)
- [REST API Design — Idempotency, Pagination, Security (ByteByteGo)](https://blog.bytebytego.com/p/the-art-of-rest-api-design-idempotency)
- [Postman — REST API Best Practices](https://blog.postman.com/rest-api-best-practices/)
- [Node.js API Best Practices 2026 (OpenReplay)](https://blog.openreplay.com/nodejs-api-best-practices-2026/)

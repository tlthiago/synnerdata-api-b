# Roadmap priorizado e metodologia de execução

> **Escopo:** roadmap da iniciativa (CPs/RUs/MPs) organizado em 3 buckets (🔴/🟡/🟢) + 5 ondas, metodologia da Fase 3 (execução), política de testes.
>
> **Estado atual resumido:** ver [README.md](./README.md).
> **Débitos catalogados (pré-audit + Fase 1):** [debts.md](./debts.md).
> **Histórico completo:** [changelog.md](./changelog.md).

---

### 7.5 Roadmap priorizado

**Consolidado na Fase 2 (2026-04-21)** a partir do audit da Fase 1 e do relatório em `docs/reports/2026-04-21-api-infrastructure-audit.md`.

**Convenções:**
- **ID** = identificador da ação no roadmap (RU-N, CP-N, MP-N). Usar em branches e PRs: `fix/ru-2-requestid-no-erro`
- **Débitos cobertos** = referência aos débitos de 7.7 resolvidos pela ação
- **Tipo:** `config` (mudança em arquivo de config) · `new` (implementação nova) · `refactor` (move/split/rename) · `docs` (documentação/runbook) · `plan` (plano dedicado em `docs/plans/`)
- **Esforço:** `S` < 1h · `M` 1-4h · `L` > 4h · `XL` plano próprio com múltiplos PRs
- **Depende de:** IDs que precisam estar concluídos antes

#### 🔴 Bucket Urgente (0-30 dias, cliente ativo em produção)

Priorizar **fundação primeiro** (env.ts → errorPlugin → timeout), depois **compliance** (audit de API keys), depois **validação** (BOLA + integration tests).

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **RU-1** | Hardening de `src/env.ts` — adicionar `BETTER_AUTH_SECRET.min(32)`, `PII_ENCRYPTION_KEY.regex(hex)`, `SMTP_FROM.email()`, `NODE_ENV` enum, `SMTP_USER/PASSWORD` refine condicional em prod, documentar formato de `CORS_ORIGIN` | #14, #15, #16, #17, #18, #19 | config | S | — |
| **RU-2** | Incluir `requestId` no body do erro — no `errorPlugin` (`lib/errors/error-plugin.ts`), adicionar `error.requestId` em todas as respostas | #16 MVP | config | S | RU-1 |
| **RU-3** | Request timeout global — configurar `serve.idleTimeout` (ou equivalente Bun) em `src/index.ts`; extrair como constante `REQUEST_TIMEOUT_MS` | #20, MVP #8 | config | S | — |
| **RU-4** | `bun pm audit` no CI — adicionar step em `.github/workflows/lint.yml` com `--audit-level=high`; atualizar README | #76, MVP #18 | config | S | — |
| **RU-5** | Validar/corrigir `SKIP_INTEGRATION_TESTS` em `test.yml` — confirmar semântica, remover se estiver pulando testes importantes, documentar caso legítimo | #77 | config | S | — |
| **RU-6** | Audit de operações em API keys — adicionar `AuditService.log()` em `ApiKeyService.create/revoke/delete` com `resource: "api_key"`, capturing prefix (nunca a key completa) | #54 | new | M | — |
| **RU-7** | Fix auditPlugin — injetar `user`/`session.activeOrganizationId` do contexto do macro `auth` (remover `context` manual); remover `\| string` dos tipos de action/resource | #23, #24 | refactor | M | — |
| **RU-8** | Mover auditPlugin para `src/plugins/audit/` e remover `lib/audit/` — classificar como plugin + atualizar imports | #5, #30 | refactor | M | RU-7 |
| **RU-9** | Auditoria de BOLA em todos os services de domínio + testes cruzados entre orgs — varrer `src/modules/**/*.service.ts` confirmando filtro `organizationId` em todas as queries; adicionar testes de isolamento em pelo menos 3 módulos representativos | BOLA 5.1 #3, OWASP API1 | new | L | — |
| **RU-10** | Runbook de backup Coolify — criar `docs/runbooks/database-backup.md` documentando: frequência de backup no Coolify, retention, processo de restore, teste periódico | #92 | docs | S | — |

**Total bucket 🔴: 10 ações · ~7 S/M + 1 L. Entregável em ~2-3 semanas trabalhando 50% do tempo nelas.**

#### 🟡 Bucket Curto Prazo (30-90 dias, hardening + preparação compliance + organização)

Organizado em **5 PRs dedicados** (refactors grandes) + ações pontuais.

##### Refactors estruturais (PRs dedicados, `plan` em `docs/plans/`)

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **CP-1** | ✅ **2026-04-22** — **Rubrica estrita aplicada**: só plugins Elysia reais (exportam `new Elysia({...})` consumido via `.use()`) foram para `src/plugins/`. 5 plugins migrados: `health`, `logger` (com split Pino util → `lib/logger.ts`, plugin → `plugins/request-logger/logger-plugin.ts`), `error-handler/error-plugin` (classes de erro ficam em `lib/errors/`), `cron`, `auth-guard/auth-plugin` (CP-4 quebrará em sub-arquivos). Mantidos em `lib/` (não são plugins): `cors.ts`, `sentry.ts`, `shutdown/`, `request-context.ts`, `zod-config.ts`, `auth.ts`. Cleanups: pastas vazias `lib/ratelimit/` e `lib/request-context/` removidas, tests relocados. Shallow alignment: `CLAUDE.md` por plugin documentando scope + contrato; `LoggerContext` e `AuthContext` types exportados. **Destrava CP-4, CP-26, CP-28, CP-32.** _Paths refletem rename do PR #268 (2026-04-23); à época do CP-1 eram `plugins/{logger, errors, auth}`._ | #1, #4, #27 (+ #49 parcial) | plan | XL | RU-8 |
| **CP-2** | **PR #2 — Consolidar emails em `src/lib/emails/`** — mapa em débitos #8/#9; padronizar params `to`, abstrair `dispatchEmail({...})`, mover hardcoded contact email p/ env | #8, #9, #68, #69, #70, #71, #72, #73 | plan | XL | — |
| **CP-3** | ✅ **2026-04-23** — `src/routes/v1/index.ts` criado com `prefix: "/v1"` compondo os 7 controllers top-level. 25 controllers perderam `/v1` dos próprios `prefix:` — versão agora é responsabilidade única do composer. `auditController` normalizado: era `/audit-logs` (sem `v1`), agora herda `/v1` do composer → URL final `/v1/audit-logs` (breaking change mínimo — endpoint owner-only). `src/index.ts` trocou 7 `.use(xController)` por 1 `.use(routesV1)` (−7 imports, agrupamento de controllers via comentários de bloco). Tanto `src/test/support/app.ts` quanto `src/test/helpers/app.ts` consolidados no mesmo composer — fix silencioso de bug pré-existente (`helpers/app.ts` montava `cboOccupationController` redundante e não montava `publicController`). Novo smoke test em `src/routes/v1/__tests__/routes-v1.test.ts` cobrindo reachability dos 8 domains + 404 em paths pre-refactor + `/health` fora de `/v1`. **Destrava CP-18** (deprecation headers por versão). Delta: 842 tests pass (841 existentes + 13 smoke); ultracite clean; zero URL change para callers exceto audit. | #10, #13, #42 | plan | L | — |
| **CP-4** | ✅ **2026-04-22** — `lib/auth.ts` 856→339 linhas split em `lib/auth/admin-helpers.ts` (getAdminEmails, handleWelcomeEmail), `lib/auth/audit-helpers.ts` (10 auditXxx), `lib/auth/validators.ts` (validateUniqueRole), `lib/auth/hooks.ts` (11 callbacks extraídos — sendResetPassword, onPasswordReset, validação de delete user, databaseHooks, organization lifecycle). `plugins/auth-guard/auth-plugin.ts` 396→79 linhas split em `plugins/auth-guard/options.ts` (AuthOptions/parseOptions), `plugins/auth-guard/validators.ts` (error classes + role/permission/subscription/feature validators), `plugins/auth-guard/openapi-enhance.ts` (OpenAPI helper, consumido direto por `src/index.ts`). Hooks que chamam `auth.api.*` ficam inline em `auth.ts` (ex: `beforeDelete`) para evitar circular; extraímos só a validação. **Destrava CP-33** (consolidação auditXxx em `buildAuditEntry`). _Diretório renomeado de `plugins/auth/` no PR #268 (2026-04-23)._ | #38, #39, #49, #51 | plan | L | CP-1 |
| **CP-5** | ✅ **2026-04-22** — `employee-status-errors.ts` → `modules/employees/errors.ts` (extending `EmployeeError`, 1 consumer atualizado). `subscription-errors.ts` → `modules/payments/errors.ts` (`SubscriptionRequiredError` novo; `FeatureNotAvailableError` consolidada na versão rica já presente no módulo — auth plugin importa de lá). `lib/helpers/employee-status.ts` → `modules/employees/status.ts` (9 occurrence services atualizados; `lib/helpers/` removido). Dead code `NoActiveOrganizationError` em `payments/errors.ts` (zero imports) eliminada. Factory `errorSchema<C>(code, detailsSchema?)` em `lib/responses/response.types.ts` substitui 6 dos 7 schemas hand-rolled; `badRequestErrorSchema` mantido à parte (`code` não-literal). `errorResponseSchema` genérico removido (dead code). **Delta comportamental documentado**: respostas de `FeatureNotAvailableError` via macro auth agora incluem `details: { featureName }` e perdem a palavra "está" na mensagem (harmoniza com throws via `LimitsService`). | #2, #21, #45 | refactor | L | — |

##### Segurança e webhooks

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **CP-6** | ✅ **2026-04-22** — **Escopo reframado após research das docs do Pagar.me v5**: HMAC signature não é oferecido pelo gateway (confirmado via context7 + WebSearch + SDK oficial Node.js — zero referências a verify/signature); IP allowlist de origem não é publicada (apenas IPs para chamar a API deles). Sem opções provider-offered, o CP virou hardening da implementação Basic Auth existente: (1) validação Zod declarativa do body via `z.looseObject` (422 em malformação, passthrough para campos extras de Pagar.me); (2) `_rawBody` órfão removido (fecha #57); (3) log `webhook:auth_failure` com reason tag em cada um dos 4 paths de falha do Basic Auth (missing_or_wrong_scheme/invalid_base64/missing_separator/invalid_credentials) + clientIp via `extractClientIp`; (4) log `webhook:skipped:missing-metadata` em `handleChargePaid`/`handleChargeFailed` quando `metadata.organization_id` ausente; (5) `captureException` com tags `webhook_event_type`+`pagarme_event_id` no catch do processor; (6) log `webhook:unhandled-event-type` no switch default. **Rate limit skip em `/webhooks`** foi auditado mas descartado como intervenção imediata — volume MVP atual (<10 webhooks/dia vs 100 req/min global) torna risco de 429 essencialmente nulo; diferido como **MP-22** (monitored). Testes: 47 baseline → 63 (7 novos endpoint validation + 7 novos observability + 2 novos unhandled event). | #56 (researched, reframed), #57 (closed) | new→refactor | M | — |
| **CP-7** | ✅ **2026-04-22** — TruffleHog `secrets-scan` job em `security.yml` (com `--only-verified`, diff por PR ou full scan em schedule) | #84 | config | S | — |
| **CP-8** | ✅ **2026-04-22** — SBOM CycloneDX gerado via `trivy-action` format=cyclonedx no job trivy-image, upload como artifact (90d retention) | #85 | config | S | — |
| **CP-9** | ✅ **2026-04-22** — Job `trivy-fs` em `security.yml` com `scan-type: fs`, SARIF upload categorizado separadamente do container scan | #82 | config | S | — |
| **CP-10** | Pin SHA do `oven/bun:1-alpine` no Dockerfile + atualização via Dependabot | #87 | config | S | — |
| **CP-11** | HEALTHCHECK deep no Dockerfile (trocar `/health/live` por `/health` com `--retries=10`) | #88 | config | S | — |
| **CP-12** | `wait-for-db` no `scripts/entrypoint.sh` antes de rodar migrations | #89 | new | S | — |
| **CP-13** | ✅ **2026-04-22** — 8 secrets (BETTER_AUTH_SECRET, PAGARME_*, INTERNAL_API_KEY, PII_ENCRYPTION_KEY) movidos para step-level apenas nos 3 steps que executam código do projeto (migrations, affected tests, full suite) | #95 | config | S | — |

##### Cloudflare Free Tier (decisão 7.3 #1 — etapa final do early-stage)

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **CP-14** | Alinhar com cliente para migrar DNS registro.br → Cloudflare → Coolify (cliente é owner do DNS); documentar processo e rollback | Decisão 7.3 #1 | docs | S | — |
| **CP-15** | Configurar Cloudflare Free Tier: WAF básico, Bot Fight Mode, HSTS, compression, HTTP/2+3, rate limit básico. Manter Let's Encrypt do Coolify atrás | Decisão 7.3 #1, #3 (compression), #4 (HTTP/2) | config | M | CP-14 |
| **CP-16** | Revisar headers HTTP da app após Cloudflare — evitar duplicação (app + CDN ambos setando HSTS etc.) | Débito potencial após CP-15 | config | S | CP-15 |

##### Observabilidade e CI

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **CP-17** | Métricas básicas — OTel Metrics ou Prometheus client: latência por rota, throughput, erro rate, pool de conexões DB. Incluir extração da constante `MAX_REQUEST_BODY_MB` no `src/index.ts` (débito #43) — "while you're there" fix, bootstrap já será tocado para registrar middleware de métricas | Early #2, #43 | new | M | — |
| ~~**CP-18**~~ | ~~Política de deprecation com headers~~ → **Reclassificado para MP-24 em 2026-04-23** — preventivo para evento (breaking change) que não está no radar. Sinal para reativar: primeiro breaking change real sendo planejado | — | — | — | — |
| ~~**CP-19**~~ | ~~Playwright E2E em workflow CI~~ → **Reclassificado para MP-25 em 2026-04-23** — E2E é investimento caro de manter; integration tests (`app.handle()` + factories) cobrem os fluxos hoje. Sinal para reativar: 2+ regressões de UX detectadas tarde OU equipe cresce | — | — | — | — |
| **CP-20** | ✅ **2026-04-22** — `--coverage --coverage-reporter=lcov` ativado em affected + full suite. Upload via `codecov/codecov-action@v5`. Depende de `CODECOV_TOKEN` no repo secrets para publicação | #86 | config | S | — |
| **CP-21** | ✅ **2026-04-22** — `actions/cache@v4` com chave `bun-${{ hashFiles('bun.lock') }}` em lint/test/build (security.yml N/A — roda docker build) | #80 | config | S | — |
| **CP-22** | ✅ **2026-04-22** — `bun install --frozen-lockfile` em lint/test/build (alinhado com Dockerfile que já usava). Detecta drift de package.json vs bun.lock | #81 | config | S | — |
| **CP-23** | ✅ **2026-04-22** — `timeout 10 bun dist/index.js` com env fake válido em `build.yml`. Aceita exit 0/124/143 como sucesso, qualquer outro código reprova o bundle | #79 | config | S | — |

##### Env.ts e auth hardening adicional

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **CP-24** | ✅ **2026-04-22** — `src/lib/auth-plugin.ts` emite `logger.warn({ type: "security:unauthorized_access", method, path, ip, userAgent, hasApiKey })` antes de lançar `UnauthorizedError`. Extração de IP reutiliza o padrão `x-forwarded-for → x-real-ip → null`. Raw token/key nunca logado (flag `hasApiKey` boolean apenas). 4 unit tests cobrindo shape, fallback de IP, null quando sem headers, e garantia de não-vazamento de bearer token. | #36 | new | S | — |
| **CP-25** | ✅ **2026-04-22** — `src/lib/permissions.ts` ganhou helper `inheritRole(base, overrides)` e const `ownerPerms` como fonte da verdade. `manager`, `supervisor` e `viewer` agora derivam de `ownerPerms` via overrides explícitos (manager: 6 overrides; supervisor: 15; viewer: 24). Tipo `OrgRolePermissions` (keys obrigatórios) introduzido para satisfazer `orgAc.newRole`. Matrix test de 109 assertions continua passando sem mudança — equivalência exata preservada. Redução de 112 linhas líquidas. | #50 | refactor | M | — |
| **CP-26** | ✅ **2026-04-22** — `extractErrorMessages` extraído de `src/index.ts` para `src/lib/openapi/error-messages.ts` como util puro. `index.ts` importa a função; rubrica de `src/plugins/` respeitada (só Elysia instances lá, utils em `lib/`). Sem mudança de comportamento — mesma função, mesmo call site no `mapJsonSchema.zod.override`. | #11 | refactor | S | CP-1 |
| **CP-27** | ✅ **2026-04-22** — `registerPaymentListeners()` e `registerEmployeeListeners()` movidos para antes de `app.listen()` em `src/index.ts`. Remove race window em que requests/jobs chegando durante o bootstrap podiam disparar domain events sem handlers montados. Callback do `.listen()` fica só com o startup log. | #12 | config | S | — |
| **CP-28** | ✅ **2026-04-22** — Verificado pós-CP-1: `src/lib/audit/` já não existe no repo (limpo durante RU-8/CP-1 quando `auditPlugin` migrou para `src/plugins/audit/`). Nenhuma referência `from "@/lib/audit` restante. Sem código — só confirmação + marcação no checklist. | #5 resolução final | refactor | S | RU-8 |
| **CP-29** | ✅ **2026-04-22** — `formatErrorDetail` em `src/lib/errors/error-plugin.ts` ganhou parâmetro `depth` com limite `MAX_ERROR_DETAIL_DEPTH = 5`. Quando atingido, emite `"[truncated: max depth 5 reached]"` em vez de recursar — evita stack overflow em `error.cause` cíclico (que crasharia o próprio handler de erro). Função exportada pra permitir 3 unit tests (deep chain, cyclic cause, non-Error input). | #44 | config | S | — |
| **CP-30** | ✅ **2026-04-22** — Dynamic imports em `cron-plugin.ts` (2× `VacationJobsService`) e `auth.ts` (`OrganizationService` em `afterCreateOrganization`) convertidos para static. Graph trace confirmou que nenhum dos módulos alvo importa de volta via `cron-plugin`/`lib/auth` — fronteira dinâmica era defensiva/cargo-cult, não necessária. Suites completas de payments/jobs, occurrences/vacations, auth e organizations/profile passam sem runtime cycle. Zero `await import()` em prod code (restantes são todos em `__tests__/` intencionais). | #28, #52 | refactor | M | — |

##### Qualidade geral

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **CP-31** | ✅ **2026-04-22** — `src/env.ts` passa a exportar `isDev` e `isTest` além do `isProduction` existente. 7 arquivos que liam `process.env.NODE_ENV` direto (`lib/errors/error-plugin.ts`, `lib/logger/index.ts`, `lib/auth.ts`, `payments/{checkout,admin-checkout,plan-change}/*.model.ts`) passam a importar de `@/env`. `error-plugin` usa `!isProduction` (semântica "dev+test") para preservar comportamento anterior de `!= "production"`. Zero usos diretos restantes fora de `env.ts`. | #26, #41 | refactor | S | — |
| **CP-32** | ✅ **2026-04-22** — `src/plugins/cron/cron-plugin.ts` refatorado com helper `createCronJob<T>({ name, pattern, run, log })`. Os 7 jobs declaram só o essencial (schedule, service call, campos a logar); boilerplate (`async run() { const result = ...; logger.info({ type: "cron:<name>", ... }) }`) encapsulado. Genérico `<T>` preserva tipagem do resultado no callback `log`. Comportamento runtime idêntico — mesmos 7 jobs, patterns, services, shape dos logs. | #46 | refactor | M | CP-1 |
| **CP-33** | ✅ **2026-04-22** — `src/lib/auth/audit-helpers.ts` agora exporta `buildAuditEntry(params): AuditLogEntry` com shape tipado (`AuditAction`/`AuditResource` enums de `audit.model`) e conversão flat→nested (`before`/`after` params → `changes: { before, after }` no output). 10 wrappers `auditXxx` chamam `AuditService.log(buildAuditEntry({...}))` — shape centralizado, types apertados. Zero mudança de comportamento. | #51 | refactor | S | CP-4 |
| **CP-34** | ✅ **2026-04-22** — Branded type `EncryptedString` aplicado em `lib/crypto/pii.ts`. `PII.encrypt` retorna `Promise<EncryptedString>`; `PII.decrypt` exige `EncryptedString`; `PII.isEncrypted` vira type guard. Sem mudança de runtime. | #47 | refactor | S | — |
| **CP-35** | ✅ **2026-04-22** — Wrapper `withApiKeyNotFoundFallback(keyId, fn)` em `api-key.service.ts`. Elimina try/catch duplicado em `getById`, `revoke` e `delete`. Métodos perdem `async` (retornam a promise do wrapper direto). | #61 | refactor | S | — |
| **CP-36** | ✅ **2026-04-22** — `POST /v1/public/newsletter/subscribe` não revela mais existência de email: duplicado ativo agora retorna 200 silencioso (no-op). Removido `ConflictError` + schema 409 do controller. Teste atualizado para verificar body idêntico em 1ª e 2ª subscribe. CLAUDE.md do módulo documenta anti-enumeration. | #62 | refactor | S | — |
| **CP-37** | ✅ **2026-04-22** — `lib/health/index.ts` lê `version` de `package.json` via `readFileSync` no module-init; fallback para `"unknown"` só em erro de leitura. Remove `"1.0.50"` hardcoded que drifava quando `npm_package_version` não era populada (ex: container iniciado com `bun src/index.ts`). | #29 | config | S | — |
| **CP-38** | Runbook de oncall em `docs/runbooks/` — DB down, webhook Pagar.me falhando, SMTP caído, Sentry recebendo 5xx em massa | #93 | docs | M | — |
| **CP-39** | ✅ **2026-04-22** — `SMTP_FROM` virou `z.email()` puro; `SMTP_FROM_NAME` adicionado como `z.string().min(1).optional()`. Custom `smtpFromSchema` (com regex RFC 5322) removido. `src/lib/email.tsx` monta `from: { name, address }` quando `SMTP_FROM_NAME` está setado, fallback para string pura caso contrário. **Ação operacional pendente**: split do valor no Coolify (`"Synnerdata <contato@synnerdata.com.br>"` → `SMTP_FROM=contato@synnerdata.com.br` + `SMTP_FROM_NAME=Synnerdata`) antes do deploy. | Revisão de design do #17 após RU-1 | refactor | S | — |
| **CP-40** | ✅ **2026-04-22** — Triagem de 13 highs em dev + prod deps. Estratégia ajustada após auditoria: `bun update` → upgrade secretlint 11→12 → `overrides` para transitivas de deps já no latest (commitizen, drizzle-orm, exceljs) + transitivas dentro de ranges de parents não-latest (better-auth, ultracite 6). CI threshold subiu `critical` → `high`. Escopos não-CVE saíram como CP-46/47/48/49 | Follow-up de RU-4a | refactor | M | RU-4b |
| **CP-41** | Workflow dedicado para integration tests externos (Pagar.me) — novo `.github/workflows/test-integration.yml` com `workflow_dispatch` + schedule semanal, secrets de sandbox Pagar.me configurados, rodando apenas testes gated por `skipIntegration`. Destrava cobertura real dos módulos `src/modules/payments/*` em CI (hoje só rodam em máquina de dev) | Follow-up de RU-5 | new | M | — |
| **CP-42** | ✅ **2026-04-22** — Helper `buildAuditChanges(before, after)` em `src/modules/audit/pii-redaction.ts` com 25 unit tests. Redação automática de 11 campos PII (CPF, RG, pisPasep, CTPS, email, phone, mobile, salary, hourlyRate, CID, birthDate) e exclusão de metadata (createdAt/updatedAt/createdBy/updatedBy/deletedAt/deletedBy). Convenção documentada em `src/modules/audit/CLAUDE.md`. Aplicado em employees (create/update/updateStatus/delete), medical-certificates (create/update/delete) e subscription (cancel/restore). Enum `auditResourceSchema` alinhado com a spec: renomeado `medical_leave` → `medical_certificate`, adicionado `labor_lawsuit` | #96 (parcial), LGPD Art. 18/48 | refactor | M | — |
| **CP-43** | ✅ **2026-04-22** — `auditPlugin` mountado nos 4 controllers (`employee`, `medical_certificate`, `cpf_analysis`, `labor_lawsuit`). GET `/:id` emite `audit({ action: "read", resource, resourceId })` após resolve bem-sucedido. Listagens **não** auditam (ruído). Fix no plugin: destructure movido pra dentro do `audit()` (derive rodava antes do macro auth resolver user/session). Enum `auditResourceSchema` ganhou `cpf_analysis`. Integration test em `medical-certificates/__tests__/get-medical-certificate.test.ts`. Convenção documentada em `src/modules/audit/CLAUDE.md` seção "Read Audit (CP-43)" | #96 (complementa), LGPD Art. 11/48 | new | M | RU-7 |
| ~~**CP-44**~~ | ~~Audit BOLA automatizado em CI~~ → **Reclassificado para MP-27 em 2026-04-24** — preventivo contra regressão que não tem sinal hoje: solo dev + pattern bem estabelecido + RU-9 validou estado limpo (0/50 gaps) + testes cross-org dinâmicos já existem em 3 módulos representativos. Sinal para reativar: equipe cresce (2+ devs), onboarding de novo dev, near-miss real de BOLA, ou refactor grande em `src/modules/` | — | — | — | — |
| **CP-45** | ✅ **2026-04-22** — Local Backup Retention ajustado para 7 backups / 7 dias / 2 GB no Coolify (R2 inalterado em 30/30/8). Ação operacional pura na UI, sem código. Runbook atualizado | Follow-up de RU-10 | config | S | — |
| **CP-46** | Migração ultracite 6 → 7 (Biome → Oxc) — descoberto em CP-40. Ultracite 7 trocou o engine subjacente de Biome para Oxc (`oxlint` + `oxfmt`). Requer: remover `@biomejs/biome` das devDeps, validar `biome.json`/`biome.jsonc` → config equivalente em Oxc, rodar `ultracite check` + `ultracite fix` em todo o codebase, validar que pre-commit via `lint-staged` continua funcionando. Não é tooling crítico para segurança — espera janela dedicada | Descoberto em CP-40 | refactor | L | — |
| **CP-47** | Migração better-auth 1.4 → 1.6 — descoberto em CP-40. Envolve: (a) adicionar coluna `verified` na tabela `twoFactor` (schema migration, default `true`, sem backfill necessário — run `npx @better-auth/cli generate` + drizzle-kit generate + migrate); (b) validar mudança de semântica de `session.freshAge` (agora calculado de `createdAt` em vez de `updatedAt`); (c) rodar suíte completa de auth + 2FA para detectar regressões em hooks, permissions, api-keys; (d) revisar release notes 1.5/1.6 para features opcionais úteis (OTel instrumentation, WeChat provider, etc.). Não é CVE — CVEs de `defu`/`kysely` foram resolvidas via overrides em CP-40 | Descoberto em CP-40 | refactor | L | — |
| **CP-48** | Migração Zod 4.1 → 4.3 — descoberto em CP-40. Zod 4.3 proíbe `.partial()` em schemas com `.refine()` (antes permitia com comportamento indefinido). Afeta ~16 `.model.ts` em `src/modules/` (employees, occurrences/*, organizations/*, payments/billing, etc.). Fix padrão: extrair objeto base (sem refine), fazer `.partial().extend()` nele, aplicar refine depois. Zod está pinado em `~4.1.13` em CP-40 como contenção | Descoberto em CP-40 | refactor | M | — |
| **CP-49** | Sync react/react-dom versions — descoberto em CP-40. `react-dom` não está nas devDeps diretas mas é pulled por `@react-email/components`, e fica desalinhado de `react` em patches (`bun update` bumpou react → 19.2.5 enquanto react-dom ficou em 19.2.4, causando runtime mismatch). Opções: (a) adicionar `react-dom` às devDeps pinado ao mesmo patch; (b) manter `react` pinado exato (feito em CP-40 como contenção); (c) override de `react-dom` matching `react`. Decidir quando for revisar deps novamente | Descoberto em CP-40 | config | S | — |
| **CP-50** | Migração TypeScript 5.9 → 6.x — descoberto em CP-40 quando CI falhou ao puxar TS 6.0.3 ephemerally (TS não estava em devDeps). TS 6 transforma `moduleResolution=node` em erro deprecated (antes era warning). Requer: (a) alterar `tsconfig.json` de `"moduleResolution": "node"` para `"bundler"` (recomendado Elysia/Bun) ou `"node16"`; (b) auditar imports para compatibilidade com resolução nova (extensões obrigatórias em alguns casos); (c) remover o pin `~5.9.3` após migração validada. Contenção atual: TS pinado em devDeps `~5.9.3` | Descoberto em CP-40 | refactor | M | — |

**Total bucket 🟡: 50 ações registradas · 14 ativas · 32 concluídas (CP-1, CP-3, CP-4, CP-5, CP-6, CP-7, CP-8, CP-9, CP-13, CP-20, CP-21, CP-22, CP-23, CP-24, CP-25, CP-26, CP-27, CP-28, CP-29, CP-30, CP-31, CP-32, CP-33, CP-34, CP-35, CP-36, CP-37, CP-39, CP-40, CP-42, CP-43, CP-45) · 3 reclassificadas para MP (CP-18 → MP-24, CP-19 → MP-25 em 2026-04-23; CP-44 → MP-27 em 2026-04-24) · 1 contenção temporária (CP-50).**

##### Ordem de execução sugerida

Sequência proposta para extrair valor rápido antes de atacar os refactors grandes. Decidida após fechamento do bucket 🔴 — critério: **ganho de compliance/CI por hora de trabalho**, com XL ficando para janela dedicada.

| Onda | Foco | Itens | Racional |
|---|---|---|---|
| **Onda 1 — Ganhos rápidos de CI/segurança** | ✅ **Concluída em 2026-04-22** | CP-40 (M) → CP-7 (S), CP-8 (S), CP-9 (S), CP-22 (S), CP-21 (S), CP-23 (S), CP-13 (S), CP-20 (S) | CP-40 entregue em PR separada (escopo maior). Os 8 S's entregues numa PR agrupada com 8 commits atômicos |
| **Onda 2 — Compliance LGPD (débito #96)** | ✅ **Concluída em 2026-04-22** | CP-42 (M) → CP-43 (M) | CP-42 entregou a convenção (`buildAuditChanges` + redação PII); CP-43 aplicou `auditPlugin` nos 4 GET handlers sensíveis. Débito #96 100% endereçado |
| **Onda 3 — Qualidade pontual** | 🔄 Em progresso — **PRs A/B/C entregues 2026-04-22** (9 S's + CP-25 + CP-30). Resta apenas **CP-41** (M) como PR-D standalone | CP-24✅, CP-27✅, CP-29✅, CP-31✅, CP-34✅, CP-35✅, CP-36✅, CP-37✅, CP-39✅ (todos S); CP-25✅, CP-30✅, CP-41 (M) | PR-C: 5 S's de "Qualidade geral" em 5 commits. PR-B: 3 S's de "Error handling + env" em 3 commits. PR-A: 1 S + 2 M's de "Auth hardening" em 3 commits (log unauthorized, inheritRole, dynamic→static imports). CP-41 vale PR separada (workflow novo, requer secrets sandbox Pagar.me) |
| **Onda 4 — Cloudflare + Observabilidade** | Depende de janela com o dono (CP-14 precisa alinhar DNS) | CP-14 → CP-15 → CP-16; CP-17 (inclui #43) | Cloudflare é sequencial (CP-14 destrava CP-15 destrava CP-16). CP-17 standalone. _Ex-CP-18/19 reclassificados para MP-24/25 em 2026-04-23._ |
| **Onda 5 — Refactors grandes** | PRs dedicados, worktree obrigatório (XL), plan formal em `docs/plans/` | CP-2 (XL, bloqueado por #269); CP-38 (M, runbook, PR #282 em aberto) | CP-2 é último por design (toca auth). CP-38 é documentação. _CP-1/3/4/5/6/26/28/32/33 já concluídos 2026-04-22/23. CP-44 reclassificado para MP-27 em 2026-04-24._ |
| **Onda 6 — Infra hardening pequeno** ⭐ criada 2026-04-23 | 1 PR batch com commits atômicos | CP-10 (S, Docker SHA pin), CP-11 (S, HEALTHCHECK deep), CP-12 (S, wait-for-db), CP-49 (S, react/react-dom sync) | 4 CPs órfãos (sem wave original) agrupados. Todos S, independentes, infra-only. ~2-3h total em PR único |
| **Onda 7 — Tooling migrations** ⭐ criada 2026-04-23 | PRs dedicados, um por migration, risco alto | CP-48 (M, Zod 4.1→4.3) → CP-47 (L, better-auth 1.4→1.6) → CP-46 (L, ultracite 6→7) → CP-50 (M, TypeScript 5.9→6.x, contenção atual) | Seguir ordem de risco crescente. Cada migration em worktree + PR próprio + janela de teste. Follow-ups do CP-40 (triagem de deps). Bloqueio externo mínimo; mais a estabilidade da suíte |

**Notas operacionais:**
- **CP-45 já concluída** (2026-04-22) — ação operacional no Coolify, sem código.
- **Onda 1 e Onda 2 não têm dependências cruzadas** — podem rodar em paralelo se houver bandwidth.
- **XL (CP-1, CP-2) em worktree isolado** (ver 7.5.1 § Metodologia híbrida) — regra do projeto para features que bloqueiam outros trabalhos.
- **Ondas 6 e 7 criadas em 2026-04-23** durante sync de wave governance — realocam 8 CPs órfãos (CP-10/11/12/46/47/48/49/50) que nunca tinham sido mapeados em onda original.
- Reavaliar ordem a cada 5 CPs concluídos — aprendizado do bucket 🔴 mostrou que prioridades mudam ao descobrir o escopo real.

#### Ordem de execução recomendada (atualizada 2026-04-24)

Sequência pragmática por **valor × custo × dependência**:

| Prioridade | CP | Onda | Tamanho | Depende de | Racional |
|---|---|---|---|---|---|
| 🔴 1 | **CP-38** Runbook oncall | Onda 5 | M | — | Valor operacional imediato (1 cliente em prod); fecha #93 + cobre migration rollback (#90/91). _PR #282 em aberto (2026-04-24)._ |
| 🟡 2 | **CP-41** Pagarme integration tests workflow | Onda 3 | M | Secrets sandbox Pagar.me | Payments crítico; fecha Onda 3 (última ação restante) |
| 🟡 3 | **Onda 6 batch** (CP-10/11/12/49) | Onda 6 | 4×S | — | Infra hardening quick wins em PR único |
| 🟡 4 | **CP-17** Métricas OTel/Prometheus | Onda 4 | M | Decisão OTel vs Prometheus | Observability gap conhecido; inclui #43 agregado |
| 🟢 5 | **CP-14 → 15 → 16** Cloudflare | Onda 4 | S→M→S | DNS do cliente (externo) | Sequencial, bloqueio externo |
| 🟢 6 | **Onda 7 seq** (CP-48→47→46→50) | Onda 7 | M→L→L→M | Estabilidade da suíte | Tooling migrations em janela dedicada |
| ⏸️ 7 | **CP-2** Emails consolidation | Onda 5 | XL | Issue #269 (flakes) | Último por design; worktree + plan formal obrigatórios |

**Projeção**: completando priorities 1-4 (~8-12h), bucket 🟡 fica reduzido a CP-2 (bloqueado) + sequência Cloudflare (externo) + Onda 7 (janela dedicada). Pode-se afirmar que "trabalho planejável" acabou.

#### 🟢 Bucket Médio Prazo / Sob Demanda (quando houver sinal real)

Não investir antes do sinal. Cada item lista o **sinal que justifica investir**.

| ID | Ação | Débitos / Itens cobertos | Sinal que justifica |
|---|---|---|---|
| **MP-1** | Paginação por cursor | Perf #6, listagens lentas | Listagem específica excedendo SLA ou inconsistente (audit logs, financial entries primeiros) |
| **MP-2** | Cache layer (Redis) | Perf #6 | Queries repetidas dominando CPU ou pool DB |
| **MP-3** | ETag / `If-None-Match` em GETs estáveis | Perf #5 | Bandwidth/latência mensurável em GETs repetidos |
| **MP-4** | BullMQ + Redis para jobs assíncronos | Early 5.2 #5 | 1º SMTP lento bloqueando request OU job pesado que não pode bloquear HTTP |
| **MP-5** | Rate limit Better Auth com `storage: "database"` | #32 | Ao escalar para múltiplas instâncias (LB horizontal) |
| **MP-6** | Tracing distribuído (OTel) | Obs #8 | Introdução de 2º serviço/fila/microserviço |
| **MP-7** | APM avançado (Datadog/New Relic) | Obs #9 | Quando Sentry + logs + métricas não bastarem |
| **MP-8** | Idempotency keys em POSTs críticos | Ctx 5.1 #6 estendido | Após 1º incidente de duplicação em operação não-webhook |
| **MP-9** | Anti-automation em fluxos sensíveis | Ctx 5.3 #7 | 1º sinal de abuso em convite/reset em massa |
| **MP-10** | SSRF prevention | Ctx 5.3 #8 | Ao introduzir webhook/fetch de URL do cliente |
| **MP-11** | Feature flags / canary deploy | Ctx 5.3 #10 | Velocidade de deploy alta (múltiplas/dia) |
| **MP-12** | eSocial — transmissão direta | Decisão 7.3 #3 | Demanda do cliente + estudo de viabilidade |
| **MP-13** | SOC 2 Type I/II certification | Compliance 7.2 | Cliente enterprise exigir |
| **MP-14** | ISO 27001 | Compliance 7.2 | Cliente corporativo/governo exigir |
| **MP-15** | Retention policy de audit logs (implementação de pruning) | #55 | LGPD formal + primeira auditoria |
| **MP-16** | SLO / error budget formal | Scale obs | Ao assinar SLA com cliente |
| **MP-17** | Load testing periódico | Scale obs | Projeção de aumento de carga ou primeiro spike em prod |
| **MP-18** | DR (disaster recovery) testado | Scale obs | Quando SLA exigir ou após primeiro incidente de DB |
| **MP-19** | Paginação de listagem de API keys | #59 | Volume de keys exceder ~50 por org ou listagem ficar lenta |
| **MP-20** | CSP (Content-Security-Policy) | Ctx 5.2 #1 | Se API começar a servir HTML/assets ao browser (hoje API JSON pura, baixo valor) |
| **MP-21** | Captcha/honeypot em endpoints públicos | Ctx 5.2 — #63 | Detectar abuso em contact/newsletter (Cloudflare Bot Fight Mode cobre parte após CP-15) |
| **MP-22** | Excluir `/webhooks` do `RATE_LIMIT_SKIP_PATHS` — webhooks do Pagar.me estão sujeitos ao limite global de 100 req/min. Anti-pattern arquitetural (webhook de provider conhecido + autenticação dedicada não deveria contar no rate limit público); auditado em CP-6 e classificado como 🟡 boa prática preventiva sem valor real no volume atual (MVP com 1 cliente, <10 webhooks/dia) | Descoberto em CP-6 (audit do webhook) | Primeiro sinal de 429 em webhook (alerta via Sentry) ou crescimento da base de clientes que ameace saturar o limite durante retries de Pagar.me |
| **MP-23** | Field-level authorization em responses — campos sensíveis (`salary`, `cpf`, `rg`, `hourlyRate`, `healthInsurance`) retornam em clear para qualquer role com permissão de read sobre employee. Implementação: variante de response schema por role (ex: `employeeResponseByRole(role)` retornando subset apropriado). Considerar antes de MP-13 (SOC 2) | #98; ex-candidato, formalizado 2026-04-23 | Requisito concreto do cliente (ex: "viewer não deve ver salário") OU auditoria LGPD apontando Art. 18 (minimization) gap OU onboarding de cliente enterprise exigindo RBAC granular |
| **MP-24** | Política de deprecation com headers `Deprecation` / `Sunset` — documentar em `docs/api-versioning.md` + helper em `lib/responses/` para injetar headers. Destravado por CP-3 (src/routes/v1/ composer) | Ex-CP-18, reclassificado 2026-04-23; Early #9 | Primeiro breaking change real sendo planejado em endpoint público (ex: mover rota, mudar schema de response, remover campo) |
| **MP-25** | Playwright E2E em workflow CI — novo workflow ou step em `test.yml` (pelo menos no schedule diário) | Ex-CP-19, reclassificado 2026-04-23; #78 | 2+ regressões de UX detectadas em produção (não em CI) OU crescimento da equipe torna integration tests insuficientes para cobrir fluxos críticos |
| **MP-26** | Paginação padronizada — extrair `paginationQuerySchema` para `src/lib/schemas/pagination.ts` e migrar 4 callsites (`price-adjustment`, `admin-provision`, `cbo-occupations`, `admin/organizations`). Fecha gap de §4.1 #11 + §4.2 #6 do `principles.md` | #97; ex-CP-51 candidato, criado formalmente como MP em 2026-04-23 | 5+ endpoints com paginação (aumenta risco de inconsistência) OU bug real de esquecimento de `.max()` em novo endpoint OU planejamento de cursor pagination (MP-1) exigir helper compartilhado |
| **MP-27** | Audit BOLA automatizado em CI — script AST-scan `src/modules/**/*.service.ts` identificando queries `db.select/update/delete` em tabelas org-scoped sem filtro `organizationId`. Falha PR se gap novo introduzido. Preventivo contra regressão. Implementação-guia: TS compiler API + parse do schema Drizzle (auto-descoberta de tabelas com `organizationId`) + exemption via comentário `// bola-ok: <motivo>` para o pattern "read-then-operate-by-id". Allowlist: `modules/admin/*` (cross-org deliberado) | Ex-CP-44, reclassificado 2026-04-24; Follow-up de RU-9 | Equipe cresce (2+ devs) OU onboarding de novo dev (risco de drift do pattern) OU near-miss real de BOLA em review/produção OU refactor grande em `src/modules/` onde cobertura manual fica exaustiva |

**Total bucket 🟢: 27 ações monitoradas (+3 reclassificadas de CP-18/CP-19/CP-44 + MP-23/MP-26 formalizados). Nenhuma investida agora — aguardar sinal.**

---

### Resumo executivo do roadmap

| Bucket | Ações | Esforço consolidado | Prazo alvo | Estado |
|---|---|---|---|---|
| 🔴 Urgente | 10 | ~7 S/M + 1 L = 2-3 semanas com foco parcial | até 30 dias | ✅ Concluído em 2026-04-22 (1 dia de execução efetiva) |
| 🟡 Curto prazo | 50 registradas (32 done · 14 ativas · 3 reclassificadas · 1 contenção) | 4 planos XL/L + ~25 S/M | 30-90 dias | 🔄 Em execução — Ondas 1/2/3 quase completas (resta CP-41); Onda 5 em andamento (9 CPs + 1 follow-up entregues; CP-38 em PR #282). CP-44 reclassificado para MP-27 em 2026-04-24 |
| 🟢 Médio prazo | 21 | Sob demanda | indefinido (monitorar sinais) | ⏸️ Sem investimento até sinal concreto |

**Princípios de execução:**
- Atacar 🔴 **primeiro e até o fim** antes de iniciar 🟡
- Dentro de 🟡, priorizar **PRs dedicados (CP-1 a CP-5)** que destravam outros trabalhos (ex: CP-1 destrava CP-4, CP-26, CP-28)
- Itens de 🟢 só entram com sinal concreto — revisitar a cada trimestre ou após incidentes
- Manter **este documento atualizado** conforme ações são concluídas (ver aviso no topo)

### 7.5.1 Metodologia de execução — Fase 3

Discussão ocorrida após conclusão da Fase 2. Registra propostas de metodologia, agrupamento de PRs, e avaliação de ferramentas (Compozy) para garantir que cada ação seja revisada cuidadosamente antes de tocar código.

#### Template de plano de execução (proposta)

Cada ação M/L/XL gera um arquivo em `docs/plans/YYYY-MM-DD-<id>-<slug>.md` com a estrutura:

```markdown
# Plano <ID> — <Nome da ação>

## Meta
- ID: <RU-N | CP-N>
- Branch: `<tipo>/<id-slug>` (ex: `fix/ru-2-requestid-no-erro`)
- PR alvo: `preview`
- Esforço: S | M | L | XL
- Débitos cobertos: #N, #N (ref [debts.md](./debts.md))
- Depende de: <IDs ou "nenhum">

## Contexto e justificativa
Por que essa ação agora, o que ela destrava, qual risco resolve.

## Pesquisa de best practices (4 fontes — ver [project.md § 7.4.2](./project.md))
- **Elysia docs** (via context7): resumo do que a doc oficial orienta
- **Better Auth docs** (se relevante)
- **Web/OWASP 2026**: síntese de best practices atuais
- **Avocado-hp** (comparação pareada, se relevante)
→ **Conclusão:** qual é o caminho certo validado

## Implementação
- Arquivos a modificar
- Passos sequenciais com código-chave
- Considerações especiais (impacto em outros módulos, gotchas)

## Validação
- [ ] `bun run lint:types` passa
- [ ] `bun run lint:check` passa
- [ ] Testes afetados: `NODE_ENV=test bun test --env-file .env.test <paths>`
- [ ] Smoke test manual (se UI/runtime tocado)
- [ ] OpenAPI ainda gera (se schemas tocados)
- Evidência a capturar antes de marcar "done"

## Rollback
Se algo quebrar em prod, como reverter com segurança.

## Definition of Done
- [ ] Código implementado
- [ ] Testes passam
- [ ] PR aberto para `preview`
- [ ] Débitos em 7.7 marcados como resolvidos (com data)
- [ ] Changelog do checklist atualizado
- [ ] Seção 7.0 atualizada se concluir bucket 🔴 inteiro
```

Ações **S** (config trivial, <1h) não precisam de plano formal — descrição no PR basta.

#### Agrupamento sugerido de PRs (bucket 🔴)

Proposta: 10 ações urgentes em **5 PRs temáticos** para reduzir overhead de review.

| Grupo | Ações | Branch | Racional |
|---|---|---|---|
| **Grupo 1 — Fundação hardening** | RU-1, RU-2, RU-3 | `fix/urgent-foundation-hardening` | env.ts + errorPlugin + timeout; arquivos correlacionados |
| **Grupo 2 — CI hardening** | RU-4, RU-5 | `fix/urgent-ci-hardening` | ambos em `.github/workflows/` |
| **Grupo 3 — Audit refactor** | RU-6, RU-7, RU-8 | `refactor/urgent-audit-plugin` | audit de API keys + refactor do auditPlugin — alta correlação |
| **Grupo 4 — BOLA validation** | RU-9 | `test/urgent-bola-validation` | auditoria + testes; L, escopo grande, isolado |
| **Grupo 5 — Docs** | RU-10 | `docs/urgent-backup-runbook` | runbook isolado |

Bucket 🟡 terá um plano por PR dedicado (CP-1 a CP-5) + agrupamentos por afinidade nas ações pontuais (decidir em subpasta da Fase 3).

#### Política de worktrees

Convenção do projeto (`CLAUDE.md` raiz): *"Use worktrees para trabalho que precisa de isolamento (implementação paralela, features independentes)"*.

Aplicação a este roadmap:
- **Grupos 1, 2, 3, 5 (🔴)** → branches normais de `preview` (trabalho sequencial, S/M)
- **Grupo 4 — RU-9 (L, BOLA)** → worktree se rodar em paralelo com outro grupo
- **CP-1, CP-2 (XL)** → worktree obrigatório (isolamento para não bloquear trabalho normal)

#### Avaliação do Compozy como alternativa ao template caseiro

[Compozy](https://github.com/compozy/compozy) é um CLI Go que orquestra pipeline completo de AI-assisted dev: PRD → TechSpec → Tasks → Execution → Review → Fix → Archive. Artifact-driven em `.compozy/tasks/<slug>/`.

**Fit com o que precisamos** (comparação pareada):

| Necessidade | Template caseiro | Compozy |
|---|---|---|
| Planos revisados cuidadosamente | Eu escrevo, você aprova | `/cy-create-prd` + `/cy-create-techspec` com ADRs |
| Pesquisa 4 fontes (context7, web) | Eu faço manualmente | Skills cy-create-* têm research automático |
| Validação antes de completar | Eu rodo testes | `/cy-final-verify` força evidence-based |
| Revisão de código | Informal | `/cy-review-round` manual ou `fetch-reviews --provider coderabbit` |
| Remediação de review | Manual | `compozy fix-reviews` sistemático |
| Contexto entre PRs | Chat | `cy-workflow-memory` persistente |
| Council de perspectivas (segurança, arquitetura) | Eu faço os papéis | Extension `cy-idea-factory`: 6 agentes (security-advocate, architect-advisor, pragmatic-engineer, product-mind, devils-advocate, the-thinker) |
| Artifacts versionados | `docs/plans/` | `.compozy/tasks/<slug>/` |
| Overhead inicial | Zero | Setup CLI + `compozy setup` |
| Overhead por ação | Baixo | Baixo após setup, mas pipeline PRD→TechSpec→Tasks pesa para ações S |

**Sinais no repositório** (avaliação):
- `skills-lock.json` já tem 6 skills instaladas (`better-auth-*`, `zod-4`, `create-auth-skill`, `organization-best-practices`) — projeto **já usa sistema de skills**
- Skills `cy-*` disponíveis no toolkit desta sessão — infraestrutura Compozy-compatível
- Não há `.compozy/` ainda — CLI não foi setup

**Compozy é overkill para ações S** (RU-1 = adicionar `.min(32)` no env.ts, 1 linha) — pipeline PRD→TechSpec→Tasks custa 10x o tempo de implementação.

**Compozy é adequado ou melhor que template caseiro para ações M/L/XL** — rigor built-in com final-verify + council + review estruturado resolve exatamente o "revisados cuidadosamente" solicitado.

#### Matriz de escolha por tipo de ação

| Tipo | Ações no roadmap | Fluxo recomendado |
|---|---|---|
| **S** | RU-1, RU-2, RU-3, RU-4, RU-5, RU-10, CP pontuais (CP-7, CP-8, CP-9, CP-10, CP-11, CP-12, CP-13, CP-20, CP-21, CP-22, CP-23, CP-26, CP-27, CP-29, CP-31, CP-34, CP-35, CP-36, CP-37, CP-39) | Branch simples a partir de `preview` → implementação + testes → PR → merge. Descrição do PR substitui plano formal |
| **M** | RU-6, RU-7, RU-8, CP-6, CP-15, CP-17, CP-18, CP-19, CP-25, CP-30, CP-32, CP-38 | Compozy completo: `/cy-create-prd` → `/cy-create-techspec` → `/cy-create-tasks` → `compozy start` → `/cy-final-verify` |
| **L** | RU-9, CP-3, CP-4, CP-5 | Compozy completo + `/cy-review-round` para cobertura extensa |
| **XL** | CP-1, CP-2 | Compozy completo + council (security-advocate + architect-advisor + devils-advocate) debatendo decisões + `cy-workflow-memory` para estado entre sub-PRs |

#### Opções de metodologia

Três caminhos possíveis para a Fase 3. Escolher uma e registrar a decisão no final desta subseção.

| Opção | Descrição | Prós | Contras |
|---|---|---|---|
| **A — Pilot Compozy em uma ação M** | Setup do Compozy, testar com RU-7 ou RU-8, avaliar resultado, então decidir se adota integralmente ou volta atrás | Baixo risco; decisão informada por experiência real; se não funcionar, perda é pequena | Atrasa execução do bucket 🔴; exige setup antes de ver valor |
| **B — Híbrido imediato** | Ações **S** (RU-1 a RU-5, RU-10) via branches simples já; paralelamente setup Compozy; a partir da primeira M (RU-6) usar Compozy | Zero bloqueio no trabalho "rápido"; ganha rigor onde ele importa; melhor custo/benefício | Dois fluxos em paralelo inicialmente; exige disciplina para não misturar |
| **C — Template caseiro** | Manter template proposto acima, ignorar Compozy | Zero setup adicional; fluxo familiar | Reinventa o que Compozy já faz melhor; mais trabalho manual meu em planos longos; sem final-verify built-in |

#### Decisão

> **Status:** ✅ Decidida.
>
> **Decisão tomada em:** 2026-04-21
> **Opção escolhida:** **B — Híbrido imediato**
> **Justificativa:** Permite iniciar imediatamente as ações urgentes de baixo esforço (RU-1 a RU-5, RU-10) via branches simples sem bloquear o trabalho com setup, enquanto o Compozy é instalado em paralelo. A partir da primeira ação M (RU-6), usa-se Compozy para ganhar rigor (PRD + TechSpec + final-verify + council) onde ele agrega valor real. Melhor custo/benefício entre as três opções: zero bloqueio para ações rápidas, máximo rigor para refactors que impactam arquitetura.

**Consequências operacionais:**

- **Imediato:** iniciar RU-1 (Grupo 1 — Fundação) via branch `fix/urgent-foundation-hardening`. Descrição do PR substitui plano formal (ações S)
- **Compozy setup (concluído em 2026-04-21):** CLI instalado globalmente, 9 skills core disponíveis, `.compozy/config.toml` criado no projeto com defaults alinhados ao CLAUDE.md (`ide = "claude"`, `model = "opus"`, `auto_commit = false`, `reasoning_effort = "high"`). `.compozy/` versionado (não está no `.gitignore`)
- **Extensão `cy-idea-factory` — diferida:** council de 6 agentes (security-advocate, architect-advisor, pragmatic-engineer, product-mind, devils-advocate, the-thinker) **não instalado agora**. Motivo: roadmap atual (bucket 🔴 + maior parte do 🟡) tem escopo claro vindo do audit; council de debate é overkill para "adicionar `.min(32)`" ou "mover auditPlugin". Instalar **apenas antes de CP-1 ou CP-2** (XL com decisões arquiteturais) ou antes de atacar qualquer item do bucket 🟢 (cache layer, eSocial, SOC 2 — decisões com múltiplos trade-offs sem design pronto). Comando quando chegar a hora: `compozy ext install --yes compozy/compozy --remote github --ref v0.1.12 --subdir extensions/cy-idea-factory && compozy ext enable cy-idea-factory && compozy setup`
- **A partir de RU-6:** usar pipeline Compozy completo (`/cy-create-prd` → `/cy-create-techspec` → `/cy-create-tasks` → `compozy start` → `/cy-final-verify`). Artifacts em `.compozy/tasks/<slug>/` substituem `docs/plans/` para ações M/L/XL
- **Ações S do bucket 🟡** seguem no fluxo simples (não criam artifact Compozy)

### 7.5.2 Política de testes — Fase 3

**Princípio central:** testar o que vai ser tocado, não tudo. Rodar só os testes que cobrem arquivos refatorados ou lógica afetada. Coverage é sinal, não meta — um arquivo com 100% de cobertura em testes tautológicos vale menos que 60% em testes de comportamento real.

#### Categorias de política (por tipo de ação)

Cada ação do roadmap tem uma das 4 categorias abaixo registrada no campo **Política de teste** do seu plano de execução.

| Categoria | Quando aplica | Comando/disciplina |
|---|---|---|
| **(1) TDD clássico** | Comportamento observável muda ou é adicionado (contratos, segurança, compliance, autorização) | Red → Green → Refactor. Teste escrito ANTES da implementação, precisa falhar primeiro |
| **(2) Não-regressão** | Refactor/move sem alteração de comportamento (mover plugin, consolidar arquivos, renomear) | Rodar testes que cobrem o código afetado ANTES (baseline verde) → refatorar → rodar MESMOS testes DEPOIS (tem que continuar verde) |
| **(3) Teste mínimo focado** | Mudança pequena mas observável (1-2 linhas em schema, adição de header, comportamento alterado em edge case) | Adicionar 1-2 testes focados na mudança. Não tentar cobrir tudo — só a mudança |
| **(4) N/A** | Config de CI, documentação, infra externa (Cloudflare), ou mudança de arquivo não-executável (runbook) | Validação pelo próprio pipeline/config ou manualmente |

#### Escopo de execução

**Não rodar suite completa** (227 arquivos de teste, > 10min). Para cada ação, identificar e rodar apenas:

1. **Testes diretos** do arquivo/módulo tocado (`src/<area>/__tests__/*`)
2. **Testes de consumidores** (arquivos que importam o que está sendo refatorado, via `grep` nos imports)
3. **Testes novos** escritos pela categoria da ação

Comando padrão (padrão do projeto, ver `package.json`):

```bash
NODE_ENV=test bun test --env-file .env.test <paths específicos>
```

O projeto já tem `scripts/affected-tests.sh` usado no CI — pode ser adaptado localmente se o escopo for ambíguo.

#### Coverage como sinal de apoio

Rodar `bun run test:coverage` **uma vez no início da Fase 3** como baseline. Usar:

- **Para identificar risco**: arquivo que será refatorado com 0% cobertura → adicionar 1 teste crítico antes de tocar
- **Para comparação**: após ação, cobertura do arquivo tocado deve ser ≥ linha de base
- **Não usar como meta**: não perseguir 90% em arquivo que não precisa (ex: config, bootstrap)

#### Regras de ouro

1. **Testa comportamento, não implementação.** `app.handle(new Request(...))` > spy em função interna.
2. **Não testa o framework.** Não escrever teste que "Elysia responde 200 em `.get()`" ou "Zod parseia schema válido".
3. **Edge case de segurança = sempre testa.** BOLA, authorization, auditoria, encryption — mesmo se só "agregar teste mínimo" parece pouco, testar.
4. **Movimentos (refactor) = rodar existentes.** Se testes existentes continuam passando após refactor, comportamento preservado.
5. **Não adicionar teste que só dá trabalho.** Se teste só valida estrutura/config óbvia, pular.

#### Tabela de políticas por ação do bucket 🔴

Mapeamento específico para cada ação urgente (ajustar nas M/L/XL à medida que entram em plano formal Compozy).

| ID | Categoria | Arquivos afetados | Testes a rodar (baseline) | Testes a escrever |
|---|---|---|---|---|
| **RU-1** | (3) Teste mínimo | `src/env.ts` | Nenhum específico (env parse é boot); após mudança, rodar suite de auth para confirmar que novas regras não quebraram | 1 arquivo `src/__tests__/env.test.ts` com: (a) rejeita `BETTER_AUTH_SECRET` < 32; (b) rejeita `PII_ENCRYPTION_KEY` não-hex; (c) rejeita `SMTP_FROM` não-email; (d) em prod exige `SMTP_USER`/`SMTP_PASSWORD` |
| **RU-2** | (1) TDD | `src/lib/errors/error-plugin.ts` | `src/lib/errors/__tests__/*` | Novo teste em `error-plugin.test.ts`: `app.handle(Request)` que causa AppError → response contém `error.requestId` matching `req-<uuid>` |
| **RU-3** | (4) N/A | `src/index.ts` (bootstrap) | — | Teste de timeout real é custoso (precisa esperar); validar manualmente via startup log / verificar config está presente |
| **RU-4** | (4) N/A | `.github/workflows/lint.yml` | — | Validação pelo próprio CI ao rodar `bun pm audit` |
| **RU-5** | (4) N/A | `.github/workflows/test.yml` | — | Investigação — sem teste a adicionar |
| **RU-6** | (1) TDD | `src/modules/admin/api-keys/api-key.service.ts` | `src/modules/admin/api-keys/__tests__/*` | Novos testes em `create-api-key.test.ts`, `delete-api-key.test.ts`, `revoke-api-key.test.ts`: spy em `AuditService.log` confirma chamada com `resource: "api_key"`, `action` correta, `resourceId`, `userId` |
| **RU-7** | (1) TDD + (2) Não-regressão | `src/lib/audit/audit-plugin.ts` (ou `src/plugins/audit/`) + consumidores | `src/modules/audit/__tests__/*` + grep em controllers que usam `audit()` | Novo teste: `audit()` chamado sem context injeta `user` e `organizationId` do session automaticamente (TDD) + testes existentes de consumidores continuam passando (não-regressão) |
| **RU-8** | (2) Não-regressão | `src/lib/audit/` → `src/plugins/audit/` (move) | `src/modules/audit/__tests__/*` + testes de todos os controllers que chamam `audit()` | Nenhum — comportamento não muda |
| **RU-9** | (1) TDD | Criar testes novos em pelo menos 3 módulos representativos (ex: `modules/employees/`, `modules/occurrences/vacations/`, `modules/admin/api-keys/`) | Suite atual dos módulos escolhidos | Novos testes BOLA: user da org A recebe 403/404 ao tentar (a) GET por ID, (b) LIST filtrado, (c) UPDATE, (d) DELETE de recurso pertencente à org B |
| **RU-10** | (4) N/A | Runbook (doc) | — | — |

#### Definition of Done com testes (atualização do template em 7.5.1)

Adicionar ao template de plano:

```markdown
## Política de teste
- **Categoria:** (1) TDD clássico | (2) Não-regressão | (3) Teste mínimo | (4) N/A
- **Testes a escrever antes:** [lista com paths] ou "nenhum"
- **Testes de baseline/regressão:** [lista com paths ou comando `bun test <paths>`]
- **Justificativa se N/A:** [motivo]
```

Novos itens no **Definition of Done**:

- [ ] Testes escritos antes da implementação (categoria 1) ou focados adicionados (categoria 3)
- [ ] `bun test <paths afetados>` passa 100% após a mudança
- [ ] Se refactor sem mudança de comportamento (categoria 2), testes de baseline continuam passando
- [ ] Coverage do arquivo/módulo tocado igual ou maior que linha de base


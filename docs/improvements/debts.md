# Catálogo de débitos

> **Escopo:** 96 débitos identificados durante pré-audit + Fase 1 do audit item-a-item. Organizados em 6 blocos (lib/, emails, src/ raiz, bootstrap, auth, módulos críticos, emails, CI/CD). Resolvidos são marcados com `~~strikethrough~~` + referência ao CP/RU que resolveu.
>
> **Como resolvidos viram 🟡 concluídos no roadmap:** [roadmap.md](./roadmap.md).
> **Dashboard com contagem atual de resolvidos/abertos:** [README.md](./README.md).

---

### 7.7 Débitos de organização de código já identificados

Pré-audit — itens de **organização semântica** detectados no `src/` atual. Entram no backlog de refactors da Fase 2 (🟡 Curto prazo, não urgentes — não bloqueiam MVP).

#### Em `src/lib/` — mistura de responsabilidades

| # | Débito | Ação sugerida |
|---|---|---|
| 1 | ~~**Plugins Elysia e utilitários puros misturados** em `src/lib/`~~ | ✅ **Resolvido em CP-1 (2026-04-22)** — `src/plugins/` inaugurado com rubrica estrita: só Elysia instances mountadas via `.use()` vão para `plugins/`; utils puros permanecem em `src/lib/`. 5 plugins migrados (health, logger, errors/error-plugin, cron, auth) |
| 2 | ~~`src/lib/helpers/employee-status.ts` tem **lógica de domínio**, não utilitário~~ | ✅ **Resolvido em CP-5 (2026-04-22)** — movido para `src/modules/employees/status.ts`; 9 occurrence services atualizados; diretório `lib/helpers/` removido |
| 3 | ~~`src/lib/utils/` com genuínos utilitários (`retry.ts`, `timeout.ts`)~~ | ✅ **Resolvido em CP-5 (2026-04-22)** — duplicação `helpers/` vs `utils/` resolvida: `helpers/` foi removido, `utils/` mantido como era |
| 4 | ~~`src/lib/request-context.ts` **e** `src/lib/request-context/` convivendo~~ | ✅ **Resolvido em CP-1 (2026-04-22), confirmado no sync de 2026-04-23** — diretório `lib/request-context/` não existe mais; só o arquivo `lib/request-context.ts` permanece. Debt estava stale em debts.md sem marcação de resolução |
| 5 | ~~`src/lib/audit/` convivendo com `src/modules/audit/` já existente~~ | ✅ **Resolvido em RU-8 + CP-1 + CP-28 (2026-04-22)** — `auditPlugin` movido para `src/plugins/audit/`; `src/lib/audit/` removido. CP-28 confirmou zero referências remanescentes |
| 6 | ~~`src/lib/__tests__/` dentro de `lib/`~~ | ✅ **Resolvido em CP-52 (2026-04-23)** — `lib/__tests__/` agora contém **apenas** tests de arquivos no root de `lib/` (pii, shutdown, document-validators, request-context) — isso **é** colocalização (test ao lado do código, mesmo nível). Tests de sub-dirs vivem no próprio sub-dir (ex: `lib/auth/__tests__/permissions.test.ts` após mover junto com `permissions.ts`). Padrão agora consistente |
| 7 | ~~`src/lib/auth.ts` com 24KB~~ | ✅ **Resolvido em CP-4 (2026-04-22)** — `lib/auth.ts` 856→339 linhas, split em `lib/auth/{admin-helpers, audit-helpers, validators, hooks}.ts`. Plugin `auth-plugin.ts` 396→79 linhas |

#### Em `src/emails/` vs `src/lib/email.tsx` — duplicação de responsabilidade

**Decisão registrada:** consolidar seguindo o padrão do avocado-hp — tudo em `src/lib/emails/{senders, templates, components}`. Justificativa: emails são utilitários puros (não são plugins Elysia), têm responsabilidade única por subpasta, e a estrutura já foi validada no projeto-referência.

**Escopo mapeado no Bloco 5 da Fase 1 (2026-04-21) — validado via `grep`:**

| # | Débito | Ação |
|---|---|---|
| 8 | ~~**`src/emails/` e `src/lib/email.tsx` convivendo**~~ | ✅ **Resolvido em CP-2 (2026-04-24)** — `src/emails/` movido para `src/lib/emails/` via `git mv` (history preservada): components, templates/{auth,contact,payments}, render.ts, constants.ts, __tests__/ |
| 9 | ~~**`src/lib/email.tsx` com 520 linhas**~~ | ✅ **Resolvido em CP-2 (2026-04-24)** — split em `src/lib/emails/mailer.ts` (transporter + sendEmail + sendBestEffort) + `senders/{auth,payments,admin,contact}.tsx` (19 senders por domínio: 7 auth + 10 payments + 1 admin + 1 contact). `src/lib/email.tsx` deletado |

**Impacto real mapeado via `grep` (bom — muito menor do que estimado):**

- **0 arquivos fora de `lib/`** importam templates de `@/emails/` diretamente — só o próprio `lib/email.tsx` consome os templates
- **6 arquivos consumidores** importam de `@/lib/email` (precisam atualizar imports para novos senders):
  - `modules/payments/plan-change/plan-change.service.ts`
  - `modules/payments/checkout/checkout.service.ts`
  - `modules/payments/admin-provision/admin-provision.service.ts`
  - `modules/payments/hooks/listeners.ts`
  - `modules/public/contact/contact.service.ts`
  - `modules/payments/jobs/jobs.service.ts`
- **1 arquivo crítico de auth**: `lib/auth.ts:23-31` importa 6 senders de `./email` (verification, reset, welcome, provision-activation, 2FA OTP, org-invitation). Quebrar aqui impede login/signup
- **Templates têm imports relativos** para `../../components/email-*` — ao mover junto, paths relativos ficam iguais (0 mudanças necessárias nos templates)
- **Total de arquivos tocados:** ~33 (26 moves + 5 novos senders + 1 mailer + 1 removal + 7-8 atualizações de import)

**Cuidados obrigatórios na execução:**

1. ✅ **`grep` de imports já executado** — confirmado que apenas 6 consumidores externos + `lib/auth.ts` precisam atualização
2. **Better Auth usa 6 senders em `lib/auth.ts`** — testar verificação de email, reset, welcome, invitation, 2FA OTP após refactor
3. **Templates `.tsx` têm JSX** — garantir que o tsconfig reconhece o novo caminho
4. **Rodar `bun test` no subset de email + auth** antes de commit
5. **Executar ciclo completo E2E**: signup → verification email → login → reset password (via MailHog em dev)

**Por que virar plano dedicado na Fase 3** (não PR oportunista): apesar do escopo menor do que estimado, ~33 arquivos + integração com auth/payments críticos justifica plano em `docs/plans/YYYY-MM-DD-emails-consolidation.md` com checklist de validação.

#### Em `src/` raiz — falta de `src/routes/`

| # | Débito | Ação sugerida |
|---|---|---|
| 10 | ~~Sem `src/routes/` — composição de controllers provavelmente espalhada entre `src/index.ts` e os próprios módulos~~ | ✅ **Resolvido em CP-3 (2026-04-23)** — `src/routes/v1/index.ts` criado como composer com `prefix: "/v1"`; `src/index.ts` trocou 7 `.use(xController)` por 1 `.use(routesV1)` |

#### Débitos descobertos no Bloco 1 da Fase 1 (2026-04-21)

| # | Débito | Origem | Ação sugerida |
|---|---|---|---|
| 11 | ~~**`extractErrorMessages` (28 linhas de Zod v4 internals) dentro de `src/index.ts`**~~ | ✅ **Resolvido em CP-26 (2026-04-22)** — extraído para `src/lib/openapi/error-messages.ts`; `index.ts` importa a função |
| 12 | ~~**Registro de listeners (`registerPaymentListeners`, `registerEmployeeListeners`) dentro do `.listen()` callback**~~ | ✅ **Resolvido em CP-27 (2026-04-22)** — listeners movidos para antes de `app.listen()`; callback do `.listen()` ficou só com startup log |
| 13 | ~~**Versionamento na URL inconsistente**~~ | ✅ **Resolvido em CP-3 (2026-04-23)** — 25 controllers normalizados (perdem `/v1/` do próprio `prefix:`); `/v1/` declarado uma vez no composer `src/routes/v1/`. Audit normalizado: `/audit-logs` → `/v1/audit-logs` |
| 14 | ~~`env.ts` — `BETTER_AUTH_SECRET` sem `.min(32)`~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — adicionado `.min(32)` ao schema |
| 15 | ~~`env.ts` — `SMTP_USER`/`SMTP_PASSWORD` `.optional()` sem refine condicional em prod~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — `superRefine` exige ambos quando `NODE_ENV=production` |
| 16 | ~~`env.ts` — `PII_ENCRYPTION_KEY.length(64)` não valida hex~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — `.regex(/^[0-9a-fA-F]{64}$/)` com mensagem explicativa |
| 17 | ~~`env.ts` — `SMTP_FROM: z.string()`~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — trocado por `z.email().default(...)` |
| 18 | ~~`env.ts` — `NODE_ENV` não validado no schema~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — `NODE_ENV: z.enum(["development","production","test"]).default("development")`; `isProduction` agora lê de `env.NODE_ENV` |
| 19 | ~~`env.ts` — `CORS_ORIGIN` formato comma-separated implícito~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — `.describe()` documenta formato comma-separated (parser delegado a `parseOrigins` em `lib/cors.ts`) |
| 20 | ~~**Falta request timeout global**~~ | ✅ **Resolvido em RU-3 (2026-04-22)** — `serve.idleTimeout` explícito em `src/index.ts` via constante `REQUEST_IDLE_TIMEOUT_SECONDS = 30` |

#### Débitos descobertos no Bloco 2 da Fase 1 (2026-04-21)

| # | Débito | Severidade | Ação sugerida |
|---|---|---|---|
| 21 | ~~**Erros de domínio em `src/lib/errors/`** (`employee-status-errors.ts`, `subscription-errors.ts`)~~ | ✅ **Resolvido em CP-5 (2026-04-22)** — errors de domínio relocados para `src/modules/employees/errors.ts` e `src/modules/payments/errors.ts`. `lib/errors/` ficou com `base-error.ts` + `http-errors.ts` |
| 22 | ~~`auditPlugin` sem try/catch em `AuditService.log()`~~ | — | **Reavaliado — não é débito.** `AuditService.log()` (`modules/audit/audit.service.ts:9-29`) **já tem try/catch interno** com silent catch via logger. Design intencional documentado no CLAUDE.md do módulo audit: "Logging é assíncrono e silencioso — falhas não propagam erro". `auditPlugin` chama `AuditService.log()` via `await` mas é seguro porque o método nunca propaga erro |
| 23 | ~~**`auditPlugin` exige contexto manual**~~ | ✅ **Resolvido em RU-7 (2026-04-22)** — `user`/`session.activeOrganizationId` auto-injetados do ctx do macro `auth`; controllers não passam mais `context: { userId, organizationId }` |
| 24 | ~~**`auditPlugin` — `action`/`resource` aceitam `string`**~~ | ✅ **Resolvido em RU-7 (2026-04-22)** — tipos apertados para enums `AuditAction`/`AuditResource` estritos; `\| string` removido |
| 25 | **`errorPlugin` não trata `code === "PARSE"`** | 🟡 qualidade | Parse errors (JSON inválido) caem no "unhandled" com 500. Avocado-hp tratava como 400 `PARSE_ERROR`. Adicionar branch explícito |
| 26 | ~~**`errorPlugin` usa `process.env.NODE_ENV` direto** em vez de importar `isProduction` de `env.ts`~~ | ✅ **Resolvido em CP-31 (2026-04-22)** — `error-plugin.ts` passou a importar `isProduction` de `@/env`; zero usos de `process.env.NODE_ENV` direto remanescentes |
| 27 | ~~**`lib/cron-plugin.ts` é plugin Elysia em `lib/`**~~ | ✅ **Resolvido em CP-1 (2026-04-22)** — `cron-plugin.ts` migrado para `src/plugins/cron/cron-plugin.ts` |
| 28 | ~~**`cron-plugin.ts` usa dynamic import para `VacationJobsService`**~~ | ✅ **Resolvido em CP-30 (2026-04-22)** — graph trace confirmou que fronteira dinâmica era defensiva/cargo-cult; converted para static import sem runtime cycle |
| 29 | ~~**`lib/health/index.ts` — version fallback hardcoded `"1.0.50"`**~~ | ✅ **Resolvido em CP-37 (2026-04-22)** — `lib/health/index.ts` lê `version` de `package.json` via `readFileSync` no module-init; fallback `"unknown"` só em erro de leitura |
| 30 | ~~**Configuração do `auditPlugin` em `lib/audit/audit-plugin.ts` conflita com `modules/audit/`**~~ | ✅ **Resolvido em RU-8 + CP-1 (2026-04-22)** — `auditPlugin` movido para `src/plugins/audit/`; importa `AuditService` de `modules/audit/` sem residir em `lib/` |

#### Débitos descobertos no Bloco 3 da Fase 1 (2026-04-21) — Auth

| # | Débito | Severidade | Ação sugerida |
|---|---|---|---|
| 31 | ~~8 de 9 hooks de audit no Better Auth sem `.catch()`~~ | — | **Reavaliado — não é débito.** Mesma razão do #22: `AuditService.log()` tem silent catch interno. Todos os hooks de `auth.ts` chamam `AuditService.log()` via helpers (`auditUserCreate`, `auditLogin`, etc.) — erros são logados sem propagar. O `.catch()` em `afterCreateOrganization` é redundante (defensivo mas não necessário). **Consistência de estilo** pode virar débito leve separado — ver #31-revisado abaixo |
| 32 | **Rate limit do Better Auth em `storage: "memory"`** | 🟡 hardening | **Validado via context7/Better Auth docs**: solução 1-linha — trocar para `storage: "database"` + `modelName: "rateLimit"` (Better Auth cria tabela automaticamente) OU `storage: "secondary-storage"` com Redis. Feature built-in, **zero código custom**. Migrar quando escalar horizontalmente ou se rate limit for crítico para SOC2 |
| 33 | **Macro `auth.resolve` chama `auth.api.getSession` em toda request autenticada** | 🟡 performance | Cookie cache de 5min já ajuda (`session.cookieCache`). Validar se está funcionando. Para API keys, `auth.api.verifyApiKey` é chamado todo request — validar cache |
| 34 | **`auth-plugin.ts` define `NoActiveOrganizationError`, `AdminRequiredError`, `SuperAdminRequiredError` inline** | 🟢 organização | Mover para `lib/errors/auth-errors.ts` para consistência com hierarquia AppError |
| 35 | **`validatePasswordComplexity` usa `APIError` do Better Auth, não `AppError` do projeto** | 🟢 organização | Better Auth prefere `APIError` dele nos hooks (correto). Mas manter `AppError` consistente fora desse contexto. Documentar a convenção |
| 36 | ~~**API key sem log explícito de falha de auth** (UnauthorizedError thrown silently)~~ | ✅ **Resolvido em CP-24 (2026-04-22)** — `auth-plugin.ts` emite `logger.warn({ type: "security:unauthorized_access", method, path, ip, userAgent, hasApiKey })` antes de lançar `UnauthorizedError`. Raw token nunca logado |
| 37 | **Password complexity sem check contra common passwords** | 🟢 nice-to-have | Better Auth não tem plugin pronto para isso. `haveibeenpwned` API ou lista k-anonymity em `validatePasswordComplexity` — baixa prioridade |
| 38 | ~~**`lib/auth.ts` com 24KB** concentra: config Better Auth + 9 helpers de audit + `getAdminEmails` + `validateUniqueRole` + tipos + hooks de DB + plugins~~ | ✅ **Resolvido em CP-4 (2026-04-22)** — `lib/auth.ts` 856→339 linhas; `lib/auth/{admin-helpers, audit-helpers, validators, hooks}.ts` criados; 11 callbacks extraídos |
| 39 | **Inconsistência de estilo em hooks de audit** | 🟢 qualidade | `afterCreateOrganization` usa `.catch()` defensivo (redundante mas explícito); demais hooks usam `await` direto. Padronizar um estilo. Como `AuditService.log()` já tem silent catch, **remover os `.catch()` redundantes** é mais limpo |
| 40 | **Uso de `as any` em `auth-plugin.ts`** 3x e em vários arquivos | 🟡 qualidade | `auth.api as any` para acessar `hasPermission` e `verifyApiKey` (typing limitation do Better Auth). Documentar com comentário do motivo (já feito) mas avaliar extension de tipo (ambient .d.ts) |
| 41 | ~~**Audit de qualidade geral**: vários arquivos usam `process.env.NODE_ENV` direto em vez de importar de `@/env`~~ | ✅ **Resolvido em CP-31 (2026-04-22)** — 7 arquivos migrados para importar `isProduction`/`isDev`/`isTest` de `@/env`. Zero usos diretos fora de `env.ts` |

#### Débitos de qualidade — revisão retroativa dos Blocos 1-3 (2026-04-21)

Dimensão "Qualidade da implementação" adicionada à metodologia após o Bloco 3. Esta tabela registra débitos de qualidade encontrados nos arquivos já auditados mas não destacados antes.

**Bloco 1 (Bootstrap + env):**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 42 | ~~**`src/index.ts` encadeia 16 `.use()`** linearmente sem agrupamento semântico~~ | ✅ **Resolvido em CP-3 (2026-04-23)** — `routesV1` absorveu 7 controllers em 1 `.use()`; 5 comentários `// ---` agrupando por concern (Core infra, HTTP middleware, Auth + docs, Background jobs, Versioned API routes) |
| 43 | **`src/index.ts:60-64`** — config `serve.maxRequestBodySize` hardcoded | 🟢 qualidade | Extrair constante nomeada (ex: `const MAX_BODY_SIZE_MB = 10`) ou puxar de env para configurabilidade. **Agregado a CP-17** (métricas) — bootstrap será tocado para registrar middleware de métricas, fix natural enquanto lá |

**Bloco 2 (lib/):**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 44 | ~~**`lib/errors/error-plugin.ts::formatErrorDetail`** é recursivo sem limite de profundidade~~ | ✅ **Resolvido em CP-29 (2026-04-22)** — parâmetro `depth` com `MAX_ERROR_DETAIL_DEPTH = 5`; emite `"[truncated: max depth 5 reached]"` ao invés de recursar. 3 unit tests |
| 45 | ~~**`lib/responses/response.types.ts`** tem 7 schemas de erro quase idênticos~~ | ✅ **Resolvido em CP-5 (2026-04-22)** — factory `errorSchema<C>(code, detailsSchema?)` criada; 6 dos 7 schemas migrados. `badRequestErrorSchema` mantido à parte (code não-literal) |
| 46 | ~~**`lib/cron-plugin.ts`** hardcoda 7 jobs com `.use(cron({...}))` encadeado~~ | ✅ **Resolvido em CP-32 (2026-04-22)** — helper `createCronJob<T>({ name, pattern, run, log })` em `plugins/cron/cron-plugin.ts`; 7 jobs declaram só o essencial; genérico `<T>` preserva tipagem |
| 47 | ~~**`lib/crypto/pii.ts`** — `encrypt` retorna `string` e `decrypt` espera `string`~~ | ✅ **Resolvido em CP-34 (2026-04-22)** — branded type `EncryptedString`; `PII.encrypt` retorna `Promise<EncryptedString>`, `PII.decrypt` exige `EncryptedString`; `PII.isEncrypted` vira type guard |
| 48 | **`lib/errors/error-plugin.ts`** — função `formatValidationErrors` usa cast inseguro `err as ElysiaValidationError` | 🟢 type safety | Usar type guard ou schema Zod para parse defensivo |

**Bloco 3 (Auth):**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 49 | ~~**`lib/auth-plugin.ts` com 369 linhas**~~ | ✅ **Resolvido em CP-4 (2026-04-22)** — `plugins/auth-guard/auth-plugin.ts` 396→79 linhas; split em `plugins/auth-guard/{options, validators, openapi-enhance}.ts`. Diretório renomeado de `plugins/auth/` em PR #268 (2026-04-23) para evitar colisão com `lib/auth/` |
| 50 | ~~**`lib/permissions.ts`** — duplicação massiva entre `orgRoles`~~ | ✅ **Resolvido em CP-25 (2026-04-22)** — helper `inheritRole(base, overrides)` + `ownerPerms` como fonte da verdade. Manager (6 overrides), supervisor (15), viewer (24). Matrix test 109 assertions preservado. ~112 linhas reduzidas |
| 51 | ~~**`lib/auth.ts`** — 9 helpers `auditXxx` quase idênticos~~ | ✅ **Resolvido em CP-33 (2026-04-22)** — `buildAuditEntry(params): AuditLogEntry` em `lib/auth/audit-helpers.ts` com shape tipado; 10 wrappers `auditXxx` chamam `AuditService.log(buildAuditEntry({...}))` |
| 52 | ~~**`lib/auth.ts` — `afterCreateOrganization`** usa dynamic import para `OrganizationService`~~ | ✅ **Resolvido em CP-30 (2026-04-22)** — graph trace confirmou ausência de dep circular; dynamic import convertido para static |
| 53 | **`lib/auth-plugin.ts::resolveApiKeyOrgContext`** faz `auth.api.verifyApiKey` a cada request com API key | 🟡 performance | Sem cache — toda request com `x-api-key` verifica no DB (via Better Auth). Para cliente consumindo Power BI, isso pode ser muitos queries redundantes. Cache simples por TTL curto (30s) pode ajudar. Validar no Bloco 4 (api-keys) se há cache built-in |

#### Débitos descobertos no Bloco 4 da Fase 1 (2026-04-21) — Módulos críticos

**Webhook Pagar.me** (`modules/payments/webhook/`):

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 54 | ~~**API keys não auditam operações admin**~~ | ✅ **Resolvido em RU-6 (2026-04-22)** — `AuditService.log()` adicionado em create/revoke/delete; capturing createdBy + prefix (nunca a key completa). `resource: "api_key"` enum. Cobre LGPD + SOC2 |
| 55 | **Sem retention policy definida para audit logs** | 🟡 compliance | CLAUDE.md do audit não define quanto tempo logs são mantidos. LGPD pede retention justificada. Definir política (ex: 5 anos para eventos de segurança, 2 anos para CRUD operacional) e implementar jobs de pruning |
| 56 | ~~**Webhook usa Basic Auth em vez de HMAC signature**~~ | ✅ **Resolvido em CP-6 (2026-04-22, reframed)** — research via context7 + WebSearch + SDK oficial confirmou que Pagar.me v5 **não oferece HMAC** nem publica IP allowlist. Escopo virou hardening do Basic Auth existente: Zod validation declarativa, logs `webhook:auth_failure` por reason, `extractClientIp`, `captureException` com tags, log de unhandled events |
| 57 | ~~**`_rawBody` em `WebhookService.process`** passed mas não usado para verificação~~ | ✅ **Resolvido em CP-6 (2026-04-22)** — `_rawBody` órfão deletado do service + 36 callsites de teste em 6 arquivos. `parse: "text"` removido. Body agora é Zod-validated via `z.looseObject` no Elysia |
| 58 | ~~**Webhook silencia quando metadata ausente**~~ | ✅ **Resolvido em CP-6 (2026-04-22)** — `logger.info({ type: "webhook:skipped:missing-metadata" })` em `handleChargePaid`/`handleChargeFailed` quando `metadata.organization_id` ausente |

**API Keys** (`modules/admin/api-keys/`):

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 59 | **Listagem sem paginação** | 🟡 performance/DoS | `ApiKeyService.list()` retorna TODAS as keys (sem limit/offset). Com 1 cliente hoje OK, mas com N clientes e M keys cada, vira DoS via query pesada. Better Auth `listApiKeys` não tem paginação nativa — implementar via filter ou fetch + slice |
| 60 | **Rate limit por key inconsistente entre service e plugin** | 🟢 documentação | `api-key.service.ts:34` diz `rateLimitMax: 100`; `lib/auth.ts:848` diz `maxRequests: 200`. CLAUDE.md do api-keys explica "200 para compensar dupla verificação". Documentar a intenção explicitamente ou unificar |
| 61 | ~~**`isBetterAuthNotFound` helper repetido em cada método**~~ | ✅ **Resolvido em CP-35 (2026-04-22)** — wrapper `withApiKeyNotFoundFallback(keyId, fn)` em `api-key.service.ts`; try/catch duplicado eliminado em `getById`, `revoke`, `delete` |

**Public** (`modules/public/`):

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 62 | ~~**Newsletter revela existência de email**~~ | ✅ **Resolvido em CP-36 (2026-04-22)** — `POST /v1/public/newsletter/subscribe` retorna 200 silencioso (no-op) em duplicado ativo; `ConflictError` + schema 409 removidos. Anti-enumeration documentada em CLAUDE.md |
| 63 | **Public endpoints sem captcha/honeypot** | 🟡 anti-automation | `/v1/public/contact` e `/v1/public/newsletter/subscribe` são alvos para bots/spam. Rate limit global (100/min) pode não ser suficiente. Cloudflare Free Tier (decisão 7.3 #1) resolverá parte. Considerar também honeypot field no form |
| 64 | **Contact form envia email síncrono** | 🟡 performance | `contact.service` provavelmente chama `sendContactEmail` via await no request. Se SMTP lento, request lento. Já coberto em débito 5.2 #5 (Jobs assíncronos) |

**Audit** (`modules/audit/`):

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 65 | **Filtros de `getByOrganization` aceitam `string` direto** | 🟢 robustez | `audit.service.ts:41-55` faz `new Date(options.startDate)` sem validar. Input inválido pode retornar resultados inesperados. Validação já é feita no `auditQuerySchema` Zod antes — mas defesa em profundidade é ok |
| 66 | **`audit.service.ts:35` — `select()` retorna **todas** as colunas de audit logs** | 🟢 performance | `db.select().from(auditLogs)` — sem projeção. Em compliance logs podem crescer muito. Considerar select explícito com só campos necessários, ou só pegar `changes` sob demanda (lazy) |
| 67 | **Sem endpoint `/audit-logs/:id` individual** | 🟢 completude | Apenas list e por-resource. Se suporte precisar ver um único evento, não há endpoint. Nice-to-have |

#### Débitos descobertos no Bloco 5 da Fase 1 (2026-04-21) — Emails

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 68 | **Inconsistência de nome de parâmetro em senders** (`to` vs `email`) | 🟡 qualidade/DX | `sendVerificationEmail({ email })`, `sendPasswordResetEmail({ email })` mas `sendWelcomeEmail({ to })`, `sendUpgradeConfirmationEmail({ to })`. Mesma coisa semanticamente, nomes diferentes. Padronizar para `to` (mais claro e alinhado com Nodemailer) em todos os senders durante o refactor (débito #9) |
| 69 | **19 senders com padrão quase idêntico** `renderEmail + sendEmail` | 🟡 duplicação | Cada sender tem ~15 linhas fazendo a mesma coisa. Avaliar abstração: função genérica `dispatchEmail({ to, subject, component })` que faz render + send, e cada sender vira 3-4 linhas. Fazer durante o refactor (débito #9) |
| 70 | ~~**Email hardcoded `"contato@synnerdata.com.br"`** em `sendContactEmail`~~ | ✅ **Resolvido em CP-53 commit `cc79fd5` (2026-04-23)** — nova env var `CONTACT_INBOX_EMAIL` com default preservando comportamento. PR #271 |
| 71 | ~~**`sendAdminCancellationNoticeEmail` usa `env.SMTP_USER` como destinatário admin**~~ | ✅ **Resolvido em CP-53 commit `cc79fd5` (2026-04-23)** — nova env var `ADMIN_NOTIFICATION_EMAIL` opcional (semanticamente correto vs SMTP_USER que é credencial). PR #271 |
| 72 | **`roleLabels` em `src/emails/constants.ts`** duplica nomes de roles | 🟢 duplicação | roles (owner, manager, supervisor, viewer) também estão em `lib/permissions.ts`. Criar `lib/permissions/role-labels.ts` (ou similar) e importar dos dois lugares |
| 73 | **Transporter condicional `env.SMTP_USER && env.SMTP_PASSWORD`** | 🟡 robustez | ⚠️ **Parcialmente resolvido em CP-53 commit `cc79fd5` (2026-04-23)** — `requireTLS: env.NODE_ENV === "production" && env.SMTP_PORT !== 465` adicionado em PR #271. Garante STARTTLS em prod SMTP 587. **Resta**: o conditional `SMTP_USER && SMTP_PASSWORD` ainda aceita transporter sem auth em prod (fluxo silencioso em falha de config). RU-1 já faz refine condicional no env — transporter conditional aqui é defensive duplicate. Fix final depende da OQ-14 (política de erro em emails) |
| 74 | **Falhas de email não são propagadas** | 🟡 observabilidade | `lib/auth.ts:53-69` tem `handleWelcomeEmail` com try/catch que só loga. `sendEmail` em si não tem catch — erro propaga. Inconsistência: alguns callers capturam silently, outros deixam subir. Documentar política ("email é best-effort em X contextos, crítico em Y"). Related: #5.2 #5 (jobs assíncronos) |
| 75 | **Templates carregam React + React Email** — bundle size em produção | 🟢 performance | Com 19 templates + 5 components, o bundle tem React completo só para servir emails. Medir impacto após primeiro deploy de produção. Tree-shaking deve ajudar; não é prioridade |

#### Débitos descobertos no Bloco 6 da Fase 1 (2026-04-21) — CI/CD e Deploy

**CI workflows (.github/workflows/):**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 76 | ~~**`bun audit` ausente** em todos os workflows e scripts do package.json~~ | ✅ **Resolvido em RU-4 (2026-04-22)** — `bun audit --audit-level=high` step em `lint.yml:42`; comando foi renomeado durante execução (`bun pm audit` → `bun pm scan` → `bun audit` entre Bun 1.2.x e 1.3.x — detalhes no changelog 2026-04-22). Threshold subido de `critical` → `high` em CP-40 após triagem de CVEs |
| 77 | ~~**`SKIP_INTEGRATION_TESTS: "true"`** em test.yml~~ | ✅ **Resolvido em RU-5 (2026-04-22)** — semântica documentada no CLAUDE.md: flag gateia **apenas** testes que fazem chamadas HTTP reais a Pagar.me. DB-level integration tests rodam sempre. Gap rastreado como CP-41 |
| 78 | **Playwright E2E não está em nenhum workflow** | 🟡 cobertura | **Reclassificado para MP-25 em 2026-04-23** (ex-CP-19). `test:e2e` existe em `package.json` mas não é executado em CI. E2E é investimento caro de manter em MVP com 1 cliente + equipe pequena; `app.handle()` + factories cobrem os fluxos integrados hoje. Sinal para reativar (MP-25): 2+ regressões de UX detectadas em produção (não em CI) OU crescimento da equipe |
| 79 | ~~**Build workflow não faz smoke test**~~ | ✅ **Resolvido em CP-23 (2026-04-22)** — `timeout 10 bun dist/index.js` com env fake válido em `build.yml`. Aceita exit 0/124/143 como sucesso, qualquer outro código reprova o bundle |
| 80 | ~~**Sem cache de `bun install`** em todos workflows~~ | ✅ **Resolvido em CP-21 (2026-04-22)** — `actions/cache@v4` com chave `bun-${{ hashFiles('bun.lock') }}` em lint/test/build |
| 81 | ~~**`lint.yml` roda `bun install` sem `--frozen-lockfile`**~~ | ✅ **Resolvido em CP-22 (2026-04-22)** — `bun install --frozen-lockfile` em lint/test/build (alinhado com Dockerfile). Detecta drift de package.json vs bun.lock |
| 82 | ~~**Trivy scaneia imagem, não filesystem**~~ | ✅ **Resolvido em CP-9 (2026-04-22)** — job `trivy-fs` em `security.yml` com `scan-type: fs`, SARIF upload categorizado separadamente do container scan |
| 83 | **Trivy severity `CRITICAL,HIGH` ignora MEDIUM** | 🟢 cobertura | Pode deixar MEDIUM real passar. Considerar incluir `MEDIUM` quando volume for gerenciável |
| 84 | ~~**Sem scan de secrets em histórico git** (gitleaks/trufflehog)~~ | ✅ **Resolvido em CP-7 (2026-04-22)** — TruffleHog `secrets-scan` job em `security.yml` (com `--only-verified`, diff por PR ou full scan em schedule) |
| 85 | ~~**Sem SBOM (Software Bill of Materials)**~~ | ✅ **Resolvido em CP-8 (2026-04-22)** — SBOM CycloneDX gerado via `trivy-action` format=cyclonedx no job trivy-image, upload como artifact (90d retention) |
| 86 | ~~**Sem coverage reporting**~~ | ✅ **Resolvido em CP-20 (2026-04-22)** — `--coverage --coverage-reporter=lcov` em affected + full suite; upload via `codecov/codecov-action@v5`. Depende de `CODECOV_TOKEN` no repo secrets |

**Dockerfile:**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 87 | ~~**Base image `oven/bun:1-alpine` sem pin de SHA**~~ | ✅ **Resolvido em CP-10 (2026-04-24)** — Dockerfile pinado com `oven/bun:1-alpine@sha256:4de475...`. Dependabot ecossistema docker já configurado no `.github/dependabot.yml` detecta novos digests semanalmente |
| 88 | ~~**HEALTHCHECK só chama `/health/live`**~~ | ✅ **Resolvido em CP-11 (2026-04-24)** — trocado para `/health` com body check `grep -q '"status":"healthy"'` (endpoint sempre retorna 200, status vive no body via envelope). `retries` 5→10 (100s total). Coolify reinicia container se DB morrer |

**Entrypoint e runtime:**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 89 | ~~**Migrations rodam a cada startup sem wait-for-db**~~ | ✅ **Resolvido em CP-12 (2026-04-24)** — `src/db/wait-for-db.ts` tenta `SELECT 1` com retry (30 attempts × 1s delay + 2s connection timeout, ~30s total) antes de `bun run src/db/migrate.ts` em `scripts/entrypoint.sh`. Falha hard com log estruturado via Pino |
| 90 | ~~**Sem estratégia de migration em scale**~~ | ✅ **Resolvido em CP-38 (2026-04-24)** — runbook `docs/runbooks/migration-rollback.md` documenta nota de escala: quando escalar horizontalmente (2+ instâncias), mover migration para job one-shot separado (Coolify pre-deploy hook ou Kubernetes Job). Não investir antes do sinal de escala |
| 91 | ~~**Sem rollback de migration**~~ | ✅ **Resolvido em CP-38 (2026-04-24)** — runbook `docs/runbooks/migration-rollback.md` documenta 3 caminhos (parcial/corrupt-registry/destruído) com comandos SQL concretos e fallback para restore via `database-backup.md` |

**Deploy e observabilidade de produção:**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 92 | ~~**Backup policy do Postgres gerenciado pelo Coolify não está documentada no repo**~~ | ✅ **Resolvido em RU-10 + CP-45 (2026-04-22)** — runbook `docs/runbooks/database-backup.md` criado com frequência, retention, processo de restore; Local Backup Retention ajustado para 7/7 dias/2GB no Coolify (R2 inalterado) |
| 93 | ~~**Sem runbook de oncall/incidente**~~ | ✅ **Resolvido em CP-38 (2026-04-24)** — 6 runbooks novos em `docs/runbooks/` (db-down, app-container, pagarme-webhook, smtp-down, 5xx-surge, migration-rollback) + índice `README.md` com decision tree sintoma→runbook |
| 94 | **Version do projeto em `package.json:3` (`1.0.50`) é manual** | 🟢 qualidade DX | Sem semantic-release ou similar — dev precisa bumpar manualmente. Para lib/app com release frequente, considerar automation. Não crítico agora |
| 95 | ~~**Em `test.yml`, secrets Pagar.me/Auth expostos no `env` do job inteiro**~~ | ✅ **Resolvido em CP-13 (2026-04-22)** — 8 secrets (BETTER_AUTH_SECRET, PAGARME_*, INTERNAL_API_KEY, PII_ENCRYPTION_KEY) movidos para step-level apenas nos 3 steps que executam código do projeto (migrations, affected tests, full suite) |
| 96 | ~~**Convenção inconsistente de `changes` em audit logs + reads sensíveis sem audit**~~ | ✅ **Resolvido em CP-42 + CP-43 (2026-04-22)** — CP-42: helper `buildAuditChanges(before, after)` com redação automática de 11 campos PII + exclusão de metadata. CP-43: `auditPlugin` mountado em 4 controllers (employee, medical_certificate, cpf_analysis, labor_lawsuit); GET `/:id` emite `audit({ action: "read", ... })`. **Débito LGPD Art. 11/18/48 100% endereçado** |

#### Débitos descobertos na revisão de documentação (2026-04-23)

Surgidos durante sync de `principles.md` com estado real do código — pontos que o audit da Fase 1 deixou como `?` e foram classificados formalmente nesta rodada.

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 97 | **Paginação sem schema compartilhado** | 🟡 qualidade/DoS | 4 endpoints (`price-adjustment`, `admin-provision`, `cbo-occupations`, `admin/organizations`) declaram `limit: z.coerce.number().int().min(1).max(100).default(20)` inline em cada `*.model.ts`. Extrair `paginationQuerySchema` (com `limit`, `offset`, `search` opcional, `sort` opcional) para `src/lib/schemas/pagination.ts`. Migrar os 4 callsites. **Formalizado como MP-26 em 2026-04-23** (era candidato CP-51). Sinal para ativar: 5+ endpoints paginados OU bug real de `.max()` esquecido |
| 98 | **Sem field-level authorization em responses (data minimization)** | 🟢 compliance/governance | Campos sensíveis (`salary`, `cpf`, `rg`, `hourlyRate`, `healthInsurance`) retornam em clear para qualquer role com permissão de read sobre o employee. Não há filtro por papel em nível de campo — `viewer` vê o mesmo que `owner`. Audit logs já têm PII redaction via `buildAuditChanges()` (CP-42), mas responses dos controllers não. **Sinal para investir**: requisito concreto do cliente (ex: "viewer não deve ver salário") OU auditoria LGPD apontando Art. 18 minimization gap. Implementação: variante de response schema por role (ex: `employeeResponseByRole(role)` retornando o subset apropriado). Considerar antes de MP-13 (SOC 2). **Formalizado como MP-23 em 2026-04-23** (era candidato no doc sync CP-53) |

#### Features do Better Auth que já usamos (referência para não reinventar)

Para cada necessidade, **primeiro verificar se o Better Auth já oferece**. Tabela do que já está ativo:

| Necessidade | Feature Better Auth | Status |
|---|---|---|
| Rate limit em auth endpoints | `rateLimit.customRules` | ✅ Ativo (5 regras custom) |
| CSRF protection | `trustedOrigins` | ✅ Ativo |
| Cookies seguros | `advanced.useSecureCookies` | ✅ Ativo em prod |
| IP real atrás de proxy | `advanced.ipAddress.ipAddressHeaders` | ✅ Ativo (x-forwarded-for, x-real-ip) |
| Email verification obrigatória | `emailAndPassword.requireEmailVerification` | ✅ Ativo |
| Revogação de session em reset | `emailAndPassword.revokeSessionsOnPasswordReset` | ✅ Ativo |
| Session cache (perf) | `session.cookieCache` | ✅ Ativo (5min) |
| Password complexity | `emailAndPassword.password.hash` hook | ✅ Ativo (upper+lower+digit+special) |
| 2FA OTP + backup codes | `twoFactor` plugin | ✅ Ativo (encrypted OTP/backup) |
| Admin roles | `admin` plugin | ✅ Ativo (super_admin/admin) |
| Multi-tenancy (org) | `organization` plugin | ✅ Ativo (hooks + limits) |
| API Keys com permissions | `apiKey` plugin | ✅ Ativo (rate limit próprio 200/min) |
| i18n de mensagens | `better-auth-localization` | ✅ Ativo (pt-BR) |
| Hash password | `better-auth/crypto` | ✅ Ativo |
| OpenAPI de auth | `openAPI` plugin + enhance custom | ✅ Ativo |

#### Features do Better Auth **ainda não usadas** (avaliar se viram relevantes)

A consultar via `context7` e docs oficiais quando surgir gap específico — **não implementar custom antes de verificar**:

| Feature | Quando considerar |
|---|---|
| `magic link` plugin (passwordless) | Se quisermos reduzir fricção de senha esquecida |
| `email-otp` plugin | OTP por email como alternativa a password |
| `passkey` / WebAuthn | Se compliance exigir auth mais forte que 2FA |
| `jwt` plugin | Se consumidores externos preferirem JWT a cookies |
| `bearer` plugin | Bearer token suporte |
| `username` plugin | Login por username além de email |
| `accountLinking` | Social providers (Google, GitHub) |
| `oAuthProxy` | OAuth pass-through |
| `phone-number` plugin | Login por telefone |
| Rate limit `storage: "database"` | Ao escalar horizontalmente |
| `ac`/`access` custom statements | Se quisermos resources fora do escopo atual |

**Princípio adotado:** antes de propor qualquer implementação custom em auth/identity, **consultar as docs do Better Auth via `context7`** para confirmar que não existe feature built-in.

#### Notas gerais

- **Débitos críticos em produção:**
  - **#22 (auditPlugin sem try/catch)** — pode derrubar requests em produção se DB de audit falhar
  - **#31 (8 hooks de audit no Better Auth sem catch)** — mesmo padrão, mas em pontos mais sensíveis (signup, login, org ops)
  - **MVP item #16 (requestId no envelope de erro)** — confirmado ausente no `errorPlugin`
- **Débitos #1 (plugins mistos), #8 (emails duplicado) e #22 (audit bloqueante)** são os de maior impacto — merecem PRs dedicados
- Demais débitos (#2–#7, #9–#21, #23–#30) são oportunistas: resolvem quando a Fase 3 tocar na área
- Exceto #22, nenhum débito **bloqueia o MVP funcional** — são organização semântica + hardening leve
- Débito **#20 (request timeout)** é hardening real — entra no bucket 🟡 early-stage (o default atual do Bun de 10s é razoável mas implícito no código; tornar explícito reduz acoplamento com default do runtime)

---


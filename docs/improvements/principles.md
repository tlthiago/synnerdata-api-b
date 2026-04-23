# Princípios e padrões agnósticos de API

> **Escopo:** padrões de segurança, confiabilidade, maturidade e performance que valem para **qualquer API em produção**, independentes de projeto.
>
> **Aplicação ao synnerdata-api-b:** contexto, decisões e audit em [project.md](./project.md); execução priorizada em [roadmap.md](./roadmap.md).
>
> **Dashboard:** [README.md](./README.md).

---

## 1. Princípios de priorização

### YAGNI vs segurança — a regra prática

> **YAGNI aplica-se à complexidade da solução, não à proteção contra abuso.**

- **"Não implementar X"** → quase sempre YAGNI legítimo.
  *Exemplos:* não implementar paginação com cursor, cache distribuído, idempotency keys universais.
- **"Não limitar X"** → quase sempre dívida de segurança disfarçada.
  *Exemplos:* não limitar body size, `limit` máximo na listagem, tempo de request.

**Caso prático:** paginação client-side (backend devolve tudo, front pagina visualmente) é corte de complexidade válido em early-stage. Mas sem `limit.max(100)` no schema, qualquer cliente pode chamar `GET /items?limit=999999` e derrubar o servidor. Uma linha de código evita DoS.

### Segurança tem gradações

| Camada | O que é | Estágio |
|---|---|---|
| **Contra incidente catastrófico** | Vazamento entre clientes, brute-force, DoS trivial, HTTPS | MVP obrigatório |
| **Redução de superfície de ataque** | Security headers completos, secrets manager, response filtering sistemático | Early-stage |
| **Defesa em profundidade** | Anti-automation, SSRF prevention, cursor complexity analysis | Scale |

Um projeto com segurança "MVP" **não está inseguro** — está apropriadamente protegido para seu estágio. Segurança máxima no dia 1 é paranoia que viola YAGNI.

### Critério de corte por estágio

| Estágio | Critério | Pergunta guia |
|---|---|---|
| **MVP** | Ausência causa incidente grave **OU** implementação custa < 30min com alto payoff | "Se eu lançar sem isso, em quanto tempo vira problema?" |
| **Early-stage** | Dói em semanas/meses de uso real, mas não bloqueia launch | "Adicionar antes do primeiro incidente ou antes da primeira auditoria" |
| **Scale** | Só faz sentido com volume/clientes/integração específicos | "Esperar sinal real antes de investir" |

---

## 2. Fluxo de trabalho

Metodologia para sair da teoria (checklist agnóstico) e chegar a código melhor (implementação priorizada) sem fase morta ou trabalho dobrado.

### Fase 0 — Contexto aplicado (sem código)

Fechar os 6 eixos de contexto no **projeto específico**. Decidir quais itens `context-dependent` viram relevantes e em qual estágio. Registrar decisões arquiteturais e compliance aplicável.

**Entrega:** seções 7.1, 7.2 e 7.3 preenchidas.

### Fase 1 — Audit item a item (sem código)

Varrer o código (bootstrap, lib, módulos relevantes) e para **cada item da checklist** marcar:

- ✅ implementado corretamente
- ⚠️ existe mas com débito (precisa refactor)
- ❌ não existe (implementação nova)
- N/A no contexto

**Entrega:** colunas `Status` e `Observações` preenchidas nas seções 4 e 5.

### Fase 2 — Roadmap priorizado (sem código)

Consolidar os achados em 3 buckets de execução:

- 🔴 **Urgente** — MVP faltante + débitos críticos (risco real hoje em prod)
- 🟡 **Curto prazo (30-90 dias)** — hardening + preparação compliance integrada
- 🟢 **Médio prazo / sob demanda** — itens scale + certificações quando surgir exigência

**Entrega:** [roadmap.md](./roadmap.md) preenchido.

### Fase 3 — Execução item a item

Atacar o roadmap em ordem 🔴 → 🟡 → 🟢. Para cada item, independente de ser refactor ou implementação nova:

1. Abrir branch dedicada (`feat/` ou `fix/` ou `refactor/`) derivando de `preview`
2. Implementar com testes (seguir padrões do projeto)
3. PR → preview → main
4. Voltar ao checklist e atualizar status

**Princípio-chave:** não separar "revisar existente" de "implementar faltante" em macro-fases. A prioridade real é por **risco**, não por "já existe ou não". Itens relacionados devem ser atacados juntos para evitar tocar os mesmos arquivos duas vezes.

---

## 3. Eixos de contexto

Dimensões que alteram a prioridade/aplicabilidade de cada item. Referência para decidir o que entra em "context-dependent" no contexto específico do projeto.

| # | Eixo | Valores típicos |
|---|---|---|
| 1 | **Tipo de cliente** | browser / mobile / server-to-server / IoT |
| 2 | **Tenancy** | single-tenant / multi-tenant |
| 3 | **Domínio / regulação** | B2B / B2C / financeiro / saúde / governo / genérico |
| 4 | **Arquitetura interna** | monolito / microserviços / serverless / filas assíncronas |
| 5 | **Escala / padrão de carga** | baixo volume / alto volume / read-heavy / write-heavy |
| 6 | **Exposição** | pública na internet / privada (VPC/VPN) / atrás de BFF / consumida por terceiros |

---

## 4. Núcleo universal

Vale para **qualquer API** em produção, independente de contexto. Faltar qualquer item de MVP é risco real.

**Legenda de Status (a preencher na fase de audit):** ✅ implementado · ⚠️ parcial · ❌ não implementado

### 4.1 MVP universal

Em ordem decrescente de prioridade.

| # | Item | Por quê | Status | Observações |
|---|---|---|---|---|
| 1 | HTTPS/TLS em produção | Não-negociável em qualquer API pública | ✅ | Coolify + Let's Encrypt automático (README §Deploy) |
| 2 | Authentication forte (se dados não-públicos) | Lib madura (hash argon2/bcrypt, sessão/JWT com expiração) | ✅ | Better Auth com: email/password + `requireEmailVerification: true` + complexity hook (upper/lower/digit/special) + `minPasswordLength: 8` / `maxPasswordLength: 128` (anti-DoS hash) + `revokeSessionsOnPasswordReset: true` + 2FA OTP criptografado (5 tentativas, 6 dígitos, 5min) + 10 backup codes criptografados + cookie cache 5min + `useSecureCookies` em prod. 🏆🏆 synnerdata >> avocado-hp |
| 3 | Input validation em toda boundary externa | Schema lib (Zod, Joi, AJV) — primeira linha de defesa | ✅ | Zod v4 + `z.config(z.locales.pt())` em `lib/zod-config.ts` (erros em pt-BR automáticos) + `lib/validation/documents.ts` com CPF/CNPJ check digits reais. 🏆 synnerdata > avocado-hp |
| 4 | Error handling consistente (envelope previsível) | Clientes precisam de formato único; evita vazamento de stack trace | ✅ | `errorPlugin` com `AppError` hierarchy + Sentry integration em 5xx/unhandled + formatação recursiva de `cause` (Drizzle wrap) + `cause` exposto em dev, escondido em prod. 🏆 synnerdata > avocado-hp |
| 5 | Env validation + fail-fast no boot | Config quebrada não deve subir silenciosamente | ⚠️ | Parse Zod na startup ✅. Débitos: `BETTER_AUTH_SECRET` sem `.min(32)`; `SMTP_USER/PASSWORD` `.optional()` sem refine condicional em prod; `PII_ENCRYPTION_KEY.length(64)` não valida hex; `SMTP_FROM` deveria ser `z.email()`; `NODE_ENV` não validado (usa `process.env.NODE_ENV` direto); `CORS_ORIGIN` formato comma-separated implícito |
| 6 | Secrets fora do código | `.env` não commitado; não hardcoded | ✅ | Tudo via `env.ts`; `.env` não commitado |
| 7 | Body size limit explícito | Defaults dos runtimes costumam ser generosos demais — DoS trivial | ✅ | `maxRequestBodySize: 1024 * 1024 * 10` (10MB) em `src/index.ts:62`. 🏆 synnerdata > avocado-hp |
| 8 | Request timeout | Handler bloqueado pendura o servidor indefinidamente | ❌ | **Não configurado.** Nem no `index.ts` (Elysia `serve.idleTimeout`) nem por plugin |
| 9 | Rate limit global | Primeira barreira contra abuso/scan automatizado | ✅ | `elysia-rate-limit` — 100 req/min por IP, 60s window, headers expostos. `src/index.ts:93-105` |
| 10 | Rate limit agressivo em endpoints de auth | Brute-force em login é atacado por bots automaticamente | ✅ | Better Auth tem rate limit interno **mais rigoroso que o global**: `/sign-in/*` 5req/min, `/sign-up/*` 3req/min, `/two-factor/*` 3req/min, `/forgot-password/*` 3req por 5min, `/send-verification-email` 3req por 5min, `/get-session` unlimited. Skip no rate limit global está **correto**. ⚠️ Ressalva: `storage: "memory"` — não escala horizontalmente. Com 1 instância no Coolify hoje = ok; revisar em escala |
| 11 | Max page size em qualquer endpoint de listagem | DoS via query pesada, independente de paginação sofisticada | ? | Validar nos controllers dos módulos (Bloco 4) e em `lib/schemas/` (Bloco 2) |
| 12 | Health check (liveness) | Qualquer orquestrador/load balancer precisa | ✅ | `/health/live` (liveness) + `/health` (deep: DB com latência, version, uptime). `lib/health/index.ts` |
| 13 | Graceful shutdown (SIGTERM) | Requests em voo não podem ser cortadas ao deploy | ✅ | SIGTERM + SIGINT, flag `isShuttingDown`, logs estruturados em cada etapa, `Bun.sleep()` no grace period, `pool.end()` no fim. `lib/shutdown/shutdown.ts` |
| 14 | Logs estruturados (JSON) | Logs text-based não permitem agregação/queries | ✅ | Pino JSON em prod, pino-pretty em dev, silent em test. Nível por ambiente (info/debug/silent). `lib/logger/CLAUDE.md` documenta arquitetura. 🏆 synnerdata > avocado-hp (tem CLAUDE.md dedicado) |
| 15 | Correlation ID / Request ID | Header de request + log — correlacionar suporte a logs | ✅ | `req-<uuid>` gerado no `derive`, injetado via `AsyncLocalStorage`, Pino mixin inclui `requestId` em todo log automaticamente. `X-Request-ID` injetado no header tanto em sucesso (`onAfterHandle`) quanto em erro (`onError` do logger). 🏆 synnerdata > avocado-hp (avocado-hp não injetava header em erro) |
| 16 | requestId no body do erro | Primeiro ticket de suporte vai pedir — custo trivial | ❌ | **Confirmado ausente.** `errorPlugin` loga `requestId` via mixin (em log), mas o envelope de resposta NÃO retorna `requestId`. Cliente só vê no header `X-Request-ID` — suporte precisa pedir manualmente |
| 17 | Error tracking (Sentry ou equivalente) | Logs você não lê; error tracker alerta 5xx | ✅ | GlitchTip via `@sentry/bun`. `beforeSend` **remove `authorization` e `cookie`** do request (proteção contra vazamento de credencial). `tracesSampleRate` 0.2 prod / 1.0 dev. Environment "production"/"preview". `captureException` chamado em 5xx AppError e unhandled. 🏆 synnerdata > avocado-hp (avocado-hp não tinha) |
| 18 | Dependency audit em CI | Supply chain é vetor principal; `npm/bun audit` + Dependabot/Renovate | ⚠️ | **Trivy** scan imagem Docker (semanal + PR main/preview) ✅. **Dependabot** completo (npm + docker + github-actions) com target `preview`, groups e security patches ✅. **Mas `bun pm audit` NÃO está em nenhum workflow nem no package.json** — README está errado ao afirmar isso. Trivy cobre CVE de lib Docker, mas deps JS específicas são auditadas só via Dependabot (reativo, não bloqueia PR). Adicionar `bun pm audit --audit-level=high` no lint.yml. 🏆 Dependabot config é excelente |
| 19 | Lockfile versionado + reproducible builds | Sem lockfile, cada build pode trazer deps diferentes | ✅ | `bun.lock` versionado. Dockerfile usa `--frozen-lockfile --production --ignore-scripts`. `.dockerignore` exclui node_modules/dist/.git/.env*/.claude. Multi-stage build reproduzível |

### 4.2 Early-stage universal

Adicionar antes do primeiro incidente ou antes da primeira auditoria.

| # | Item | Por quê | Status | Observações |
|---|---|---|---|---|
| 1 | Health check deep (DB, deps críticas) | Liveness ≠ saúde real — DB fora ainda responde liveness | ✅ | `/health` executa `SELECT 1` com latência e retorna unhealthy se falhar. Só checa DB (sem Pagar.me/SMTP, correto para evitar cascata) |
| 2 | Métricas básicas (latência/throughput/erro rate) | Logs resolvem triagem; métricas antecipam degradação | ❌ | Sem Prometheus/OTel aparente no bootstrap. GlitchTip cobre error tracking, não métricas |
| 3 | OpenAPI / contrato documentado | Documentação viva + client gen + validação externa | ✅ | `@elysiajs/openapi` + `mapJsonSchema` Zod v4 customizado + `extractErrorMessages` (bônus: `x-error-messages` nos schemas). 🏆 synnerdata > avocado-hp. `paths: {}` em prod (reduz info disclosure) |
| 4 | Versionamento na URL (`/v1`) | Prepara para breaking changes sem quebrar clientes | ⚠️ | **Inconsistência.** Bootstrap registra controllers sem prefix global (`src/index.ts:137-143`). `adminController` usa `/v1/admin` (visto em `modules/CLAUDE.md`), mas outros (employees, organizations, occurrences, payments, audit, public) precisam ser auditados no Bloco 4 para confirmar padrão |
| 5 | Response filtering sistemático | Response schemas tipados em todos os endpoints evitam vazamento acidental | ? | Padrão documentado em `docs/code-standards/`; auditar adesão no Bloco 4 |
| 6 | Paginação padronizada | Schema reutilizável `limit`/`offset`/`sort`/`search` | ? | Auditar `lib/schemas/` e controllers no Bloco 2/4 |
| 7 | Secrets manager (Vault/AWS SM/Doppler) | `.env` basta no MVP; em prod com múltiplos ambientes vira fraqueza | ❌ | Coolify gerencia `.env` via UI. Aceitável no MVP com 1 cliente; revisar quando escalar |
| 8 | Testes de integração na CI | Testes unitários não pegam regressão de integração | ⚠️ | `test.yml` com Postgres + MailHog como services, affected tests em PR + full suite diário. **Mas `SKIP_INTEGRATION_TESTS: "true"` setado no CI** — integration tests aparentemente pulados (validar semântica do flag). **Playwright E2E NÃO está em nenhum workflow** — só há script `test:e2e` no package.json sem CI. 🏆 Affected tests via `scripts/affected-tests.sh` é plus sobre avocado-hp |
| 9 | Política de deprecation (`Deprecation`/`Sunset` headers) | Antes do primeiro breaking change em endpoint público | ❌ | Sem headers ou política escrita. API Key em prod consumida por cliente (Power BI) reforça necessidade |
| 10 | Backup automatizado do DB | Testar restore, não só backup | ⚠️ | Postgres gerenciado pelo Coolify. **Não há verificação do código** sobre política de backup/restore. Validar via UI do Coolify: frequência, retention, teste periódico de restore. Documentar em runbook |

### 4.3 Scale universal

Quando volume/clientes/SLA justificarem investimento.

| # | Item | Por quê | Status | Observações |
|---|---|---|---|---|
| 1 | Observabilidade madura (retenção, alertas, dashboards) | Métricas cruas sem alerta/dashboard não acionam ninguém | | |
| 2 | SLO/error budget formal | Ao assinar SLA com cliente | | |
| 3 | Load testing periódico | Sem isso, primeiro spike de tráfego derruba a API | | |
| 4 | DR/disaster recovery policy ativa | Backup ≠ DR; testar restore regularmente | | |
| 5 | Runbooks / playbooks de incidente | Oncall precisa saber o que fazer às 3h da manhã | | |
| 6 | Chaos engineering (opcional/extremo) | Só quando maturidade já é alta | | |

---

## 5. Context-dependent

Aplicável conforme contexto do projeto. Cada item lista o **eixo + valor** que o ativa, e o **estágio** dentro desse contexto.

### 5.1 MVP conforme contexto

Quando o contexto está presente, esses itens viram MVP (não podem esperar).

| # | Item | Contexto ativador | Por quê é MVP nesse contexto | Status | Observações |
|---|---|---|---|---|---|
| 1 | CORS configurado com origin específica | Cliente = browser | Front não funciona sem isso; `*` é inseguro | ✅ | `parseOrigins(env.CORS_ORIGIN)` suporta múltiplas origins, `credentials: true`, `allowedHeaders` + `exposeHeaders` específicos, `maxAge: 86400`. 🏆 synnerdata > avocado-hp |
| 2 | CSRF protection | Cookie-based auth em browser | XSRF trivial sem proteção | ✅ | Better Auth via `trustedOrigins: parseOrigins(env.CORS_ORIGIN)` — CSRF check por origin. Cookies `useSecureCookies` em prod (HTTPS only) |
| 3 | BOLA — authz por objeto/tenant | Tenancy = multi-tenant | Vazamento entre clientes é catastrófico desde o 1º cliente (OWASP API1) | ⚠️ | Macro `auth` injeta `session.activeOrganizationId` (fonte de isolamento). API key tem `organizationId` na metadata (extraído em `resolveApiKeyOrgContext`). **Mas**: cada service precisa filtrar por `organizationId` manualmente — auditar no Bloco 4 para confirmar disciplina. Risco #1 do OWASP |
| 4 | RBAC / authorização funcional (BFLA) | Domínio com papéis distintos | Usuário comum não pode executar ação de admin (OWASP API5) | ✅ | `lib/permissions.ts` define system roles (super_admin/admin/user) + org roles (owner/manager/supervisor/viewer) + api-key roles via `createAccessControl`. 26 resources × actions no org level. Macro `auth: { permissions: {...} }` valida via `auth.api.hasPermission()`. 🏆 synnerdata > avocado-hp (avocado-hp tinha menos resources) |
| 5 | Audit log de ações sensíveis | Regulação (financeiro/saúde/gov/LGPD) | Obrigação legal; imutabilidade do registro | ⚠️ | `AuditService.log()` em `modules/audit/audit.service.ts` tem silent catch interno (design intencional, OK). 🏆 Audit disparado em hooks Better Auth (user create, login, org CRUD, member changes, invitation accept). **Débitos reais**: (1) `auditPlugin` em `lib/audit/` (lugar errado — débito #5); (2) Exige contexto manual no plugin (débito #23); (3) Tipos frouxos (débito #24); (4) **API keys NÃO auditam create/revoke/delete** — crítico para compliance (novo débito #54); (5) **Imutabilidade**: `modules/audit/audit.service.ts` só tem `insert` + `select`, sem update/delete — ✅ imutável. Falta **retention policy** (débito #55) |
| 6 | Idempotency keys | Integração com pagamento/fiscal externa síncrona | Duplicação = dinheiro/multa | ✅ | **Webhook Pagar.me tem idempotência completa** (`webhook.service.ts:80-96`): check `pagarmeEventId` → se `processedAt` existe, skip. Grava evento antes de processar, atualiza `processedAt` após sucesso. Se erro, salva error mas mantém unprocessed (permite retry). `handleSubscriptionUpdated` também usa timestamp ordering para prevent out-of-order updates. 🏆 synnerdata > avocado-hp |
| 7 | Criptografia em repouso (DB, backups) | PII / financeiro / saúde / regulado | Obrigação legal (LGPD/HIPAA/PCI) | ✅ | **Implementação excelente** em `lib/crypto/pii.ts`: AES-256-GCM authenticated encryption, **scrypt KDF** com salt per-encrypt (não chave fixa), formato `salt:iv:tag:encrypted`. Helpers `PII.mask.{cpf,email,phone,pis,rg}` para display seguro. `isEncrypted()` para detectar formato. 🏆 **synnerdata >> avocado-hp** (avocado-hp não tinha nada disso). Validar no Bloco 4 quais campos são efetivamente cifrados no DB |
| 8 | WAF ou bot protection | Exposição = pública B2C ou financeira | Tráfego malicioso/scraping em massa | ❌ | Sem WAF/CDN na frente. Decisão registrada em 7.3 #1 — adotar Cloudflare Free Tier no **final do early-stage** |
| 9 | mTLS entre serviços | Arquitetura = microserviços em rede não-confiável | Confiança mútua entre nós | N/A | Monolito — não aplicável |

### 5.2 Early-stage conforme contexto

| # | Item | Contexto ativador | Por quê | Status | Observações |
|---|---|---|---|---|---|
| 1 | Security headers browser (CSP, X-Frame, Referrer-Policy) | Cliente = browser e API exposta sem CDN aplicando | Redução de superfície a XSS/clickjacking | ⚠️ | **Parcial.** ✅ X-Frame-Options: DENY, Referrer-Policy, X-XSS-Protection, Permissions-Policy configurados via `.headers()` em `src/index.ts:65-74`. ❌ **CSP ausente** — mas valor limitado em API JSON pura (protege HTML renderizado). 🏆 synnerdata > avocado-hp (avocado-hp não tinha nenhum) |
| 2 | HSTS, X-Content-Type-Options | Qualquer API HTTPS | Baixo custo; bloqueia ataques de downgrade/MIME sniffing | ✅ | `X-Content-Type-Options: nosniff` sempre; `Strict-Transport-Security: max-age=31536000; includeSubDomains` em produção. `src/index.ts:66,72`. 🏆 synnerdata > avocado-hp |
| 3 | Compression (gzip/brotli) | Payloads grandes sem CDN comprimindo na frente | Reduz bandwidth e latência percebida | ❌ | Sem middleware de compression. Cloudflare Free Tier (decisão 7.3 #1) vai resolver |
| 4 | HTTP/2 no edge | Cliente com múltiplas conexões concorrentes | Multiplexing reduz overhead de TCP | ? | Depende do proxy do Coolify (Caddy/Traefik). Validar no Bloco 6 |
| 5 | Jobs assíncronos (fila) | Side-effects que não podem bloquear request (email, relatório, integração) | Request não pode depender de SMTP/API externa lenta | ⚠️ | `cronPlugin` em `lib/cron-plugin.ts` registra **7 cron jobs** via `@elysiajs/cron` **no mesmo processo**: `expire-trials`, `notify-expiring-trials`, `process-scheduled-cancellations`, `suspend-expired-grace-periods`, `process-scheduled-plan-changes`, `activate-scheduled-vacations`, `complete-expired-vacations`. Emails/webhooks síncronos no request path (a confirmar Bloco 4/5). Sem fila externa (Redis/BullMQ) — aceitável MVP; revisar quando volume exigir. Dynamic import suspeito para `VacationJobsService` (possível dep circular) |
| 6 | Retention policy para logs/audit | Regulado (LGPD/HIPAA/PCI) ou B2B com compliance | Retenção exigida por lei ou contrato | ? | Auditar `modules/audit/` no Bloco 4 e política do Coolify/Postgres no Bloco 6 |
| 7 | Data minimization em responses | Multi-tenant + dados sensíveis | Reduz superfície de vazamento (OWASP API3) | ? | Depende de response schemas nos módulos — auditar no Bloco 4 |
| 8 | API gateway / BFF | Múltiplos consumidores (web + mobile + parceiros) | Agregação, caching, rate limit uniforme | N/A | Apenas web + API key — não justifica hoje |
| 9 | Content negotiation (Accept/Content-Type) rigorosa | API pública com múltiplos formatos | Contrato claro | ? | Elysia + Zod trata Content-Type; validar no Bloco 2 |

### 5.3 Scale conforme contexto

| # | Item | Contexto ativador | Sinal para investir | Status | Observações |
|---|---|---|---|---|---|
| 1 | Tracing distribuído (OTel) | Arquitetura = microserviços ou filas assíncronas | 2º serviço/fila introduzido — monolito puro não precisa | | |
| 2 | Circuit breaker / retry-backoff | Dependências externas síncronas | 1ª dependência externa crítica no request path | | |
| 3 | Cache layer (Redis/Memcached) | Read-heavy, queries caras repetidas | Queries dominando CPU ou pool de conexões | | |
| 4 | ETag / conditional GET (`If-None-Match`) | Payloads grandes estáveis re-baixados | Bandwidth/latência de GETs repetidos medível | | |
| 5 | CDN edge caching | Leitura pública estável (catálogos, docs) | Tráfego geograficamente distribuído ou alto volume |  | |
| 6 | Paginação por cursor | Tabelas grandes e voláteis | Listagem offset ficando lenta ou inconsistente | | |
| 7 | Anti-automation em fluxos sensíveis | Fluxos com side-effect/custo sendo abusados | 1º sinal de abuso (convite em massa, reset em massa) | | |
| 8 | SSRF prevention (allowlist de host) | API faz fetch de URL fornecida pelo cliente | Introdução de webhook ou integração por URL | | |
| 9 | Service mesh | Arquitetura = microserviços em prod | Múltiplos serviços com comunicação interna complexa | | |
| 10 | Feature flags / canary deploy | Velocidade de deploy alta (múltiplas/dia) | Risco de deploy completo grande demais | | |
| 11 | APM avançado (Datadog/New Relic) | Quando Sentry + logs + métricas não bastarem | Diagnóstico ficando limitado pelos dados existentes | | |
| 12 | Idempotency keys em POSTs críticos | Criação de recursos com efeito não-reversível ou caro | Após 1º incidente de duplicação | | |

---

## 6. OWASP API Security Top 10 (2023)

Referência oficial para risk-ranking de APIs. Usar como "não esquecer" na fase de audit.

| # | Risco | Cobertura típica no núcleo universal | Reforço por contexto |
|---|---|---|---|
| API1 | Broken Object Level Authorization (BOLA) | — | Multi-tenant → MVP |
| API2 | Broken Authentication | Auth forte (MVP universal) | — |
| API3 | Broken Object Property Level Authorization | Input validation + Response filtering (universal) | Multi-tenant → reforçar em MVP |
| API4 | Unrestricted Resource Consumption | Body/timeout/rate limit/max page (MVP universal) | — |
| API5 | Broken Function Level Authorization (BFLA) | — | Papéis/roles → MVP |
| API6 | Unrestricted Access to Sensitive Business Flows | — | B2C ou fluxos com custo → Scale |
| API7 | SSRF | — | API faz fetch de URL do cliente → Scale |
| API8 | Security Misconfiguration | Security headers (Early universal), dep audit (MVP universal) | — |
| API9 | Improper Inventory Management | OpenAPI + versionamento (Early universal) | — |
| API10 | Unsafe Consumption of APIs | — | API consome terceiros síncronos → Scale |

---


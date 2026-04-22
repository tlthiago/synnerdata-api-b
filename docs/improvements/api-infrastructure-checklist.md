# Checklist de Infraestrutura de API

> **⚠️ Documento vivo.** Este arquivo deve ser **atualizado continuamente** conforme a iniciativa avança:
> - Decisão nova ou mudada → atualizar a seção correspondente **e** registrar no Changelog (última seção)
> - Item auditado → atualizar Status (✅/⚠️/❌/N/A) + Observações nas seções 4 e 5
> - Fase concluída → atualizar quadro 7.0 e registrar no Changelog
> - Débito novo descoberto → adicionar em 7.7
>
> Quem retomar este trabalho (você, outro agente, ou o futuro-você daqui a 3 meses) deve conseguir reconstruir **de onde viemos, onde estamos e para onde vamos** apenas lendo este arquivo.

Documento com a matriz de práticas de infraestrutura que sustentam uma API em termos de **segurança, confiabilidade, maturidade e performance**. A parte conceitual é **agnóstica** (reusável em qualquer projeto); a seção de aplicação está preenchida com o contexto do **synnerdata-api-b**.

Organização:
1. **Princípios de priorização** — regras para decidir o que entra em cada estágio.
2. **Fluxo de trabalho** — 4 fases para sair da teoria e chegar a código melhor.
3. **Eixos de contexto** — dimensões que alteram a prioridade de cada item.
4. **Núcleo universal** — vale para qualquer API; estratificado em MVP / Early-stage / Scale.
5. **Context-dependent** — ativa quando a API tem certo contexto; estratificado em MVP / Early-stage / Scale.
6. **OWASP API Top 10 (2023)** — mapeamento de referência.
7. **Aplicação ao projeto (synnerdata-api-b)** — status da iniciativa, contexto aplicado, compliance, decisões registradas, plano da Fase 1, débitos já identificados.
8. **Changelog** — registro temporal das decisões e entregas.
9. **Referências** — fontes usadas.

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

**Entrega:** seção 7.5 preenchida.

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

## 7. Aplicação ao projeto (synnerdata-api-b)

Seção específica do projeto. Começa pelo **status atual** da iniciativa (7.0) — sempre que uma fase avançar, **atualizar aqui e no Changelog**.

### 7.0 Status da iniciativa

| Fase | Status | Data | Entregas |
|---|---|---|---|
| **0. Contexto aplicado** | ✅ Concluída | 2026-04-21 | Seções 7.1–7.3, 7.6, 7.7 preenchidas + convenção semântica + 10 débitos pré-audit |
| **1. Audit item a item** | ✅ Concluída | 2026-04-21 | Status nas seções 4 e 5 preenchidos (~65 itens); 95 débitos totais em 7.7; relatório em [`docs/reports/2026-04-21-api-infrastructure-audit.md`](../reports/2026-04-21-api-infrastructure-audit.md) |
| **2. Roadmap priorizado** | ✅ Concluída | 2026-04-21 | Seção 7.5 com 69 ações organizadas em 3 buckets (🔴 10 urgentes / 🟡 38 curto prazo / 🟢 21 sob demanda) com IDs, dependências, tipo e esforço |
| **3. Execução** | 🔄 Em execução | 2026-04-22 | **Bucket 🔴 concluído (10/10)**. Bucket 🟡 **Onda 1 completa (10/10)** + **Onda 2 completa (2/2)**. Total concluídas no 🟡: **12 CPs** (CP-7, CP-8, CP-9, CP-13, CP-20, CP-21, CP-22, CP-23, CP-40, CP-42, CP-43, CP-45). RU-1..RU-10 entregues em PRs sequenciais em `preview`. Grupo 3 fechado. `src/plugins/` inaugurado. BOLA audit completo (0 gaps). Runbook de backup em `docs/runbooks/`. Helper `buildAuditChanges` + `auditPlugin` em produção (4 módulos auditando reads sensíveis: employees, medical-certificates, cpf-analyses, labor-lawsuits). CP-39..CP-50 registrados como follow-ups. **Débito #96 100% endereçado**. |

**➡️ Próxima ação:** **Bucket 🟡 — Onda 3** (Qualidade pontual). Agrupáveis em 2-3 PRs temáticas: **auth hardening** (CP-24, CP-25, CP-30), **error handling** (CP-27, CP-29), **env centralization** (CP-31), **qualidade geral** (CP-34, CP-35, CP-36, CP-37, CP-39). CP-41 (workflow dedicado Pagar.me) vale PR separada. Total: 9 S's + 3 M's.

### 7.1 Contexto do projeto

Produto: **Synnerdata** — SaaS B2B de gestão de Departamento Pessoal brasileiro. Atualmente no **MVP com 1 cliente ativo em produção** consumindo a API via front web próprio e via API keys (para integração Power BI do cliente).

| Eixo | Valor no projeto | Implicação |
|---|---|---|
| 1. Tipo de cliente | Browser (front web responsivo) + server-to-server (API keys → Power BI do cliente) | CORS é obrigatório, CSRF via Better Auth; headers browser-specific (CSP/X-Frame) têm valor menor em rotas consumidas por API key |
| 2. Tenancy | Multi-tenant (1 organização = 1 empresa cliente), plugin organizations do Better Auth | **BOLA é risco #1** — isolamento por `organizationId` obrigatório e com testes |
| 3. Domínio / regulação | B2B SaaS de DP brasileiro — PII sensível (CPF, salário), **dados de saúde sensíveis** (atestados médicos — Art. 11 LGPD), processos trabalhistas. Pagamentos via Pagar.me (sem armazenar cartão) | LGPD obrigatória com rigor extra para dados de saúde; PCI N/A (delegado); audit trail imutável é requisito |
| 4. Arquitetura interna | Monolito Elysia + PostgreSQL; jobs agendados via `cron-plugin` no mesmo processo; sem filas externas | Tracing distribuído é YAGNI; correlation ID simples basta |
| 5. Escala / carga | **MVP — 1 cliente, volume baixo**, centenas de funcionários por org, sem projeção para milhares. Uso read+write equilibrado | Cache/cursor/paginação sofisticada são YAGNI; foco em correção e hardening |
| 6. Exposição | Pública (SaaS na internet), DNS DuckDNS, TLS Let's Encrypt via Coolify, **sem WAF/CDN na frente hoje** (cai direto no Coolify) | Sem edge cobrindo, a app assume responsabilidade por security headers, rate limit, compression, DDoS mitigation básica |

### 7.2 Compliance aplicável

Mapa de conformidade para o contexto do synnerdata. Define o que **entra como requisito do MVP/early-stage** e o que é sob demanda.

| Framework | Aplica? | Nível de esforço no contexto atual |
|---|---|---|
| **LGPD** | ✅ Obrigatório | Dados pessoais de funcionários brasileiros. **Dados de saúde** (atestados médicos) são sensíveis pelo Art. 11 — exigem base legal específica, criptografia reforçada, retention justificada. **LGPD é tratada como requisito integrado ao MVP/early-stage, não fase separada** |
| **PCI DSS** | ❌ Não se aplica | Pagar.me tokeniza o cartão — API recebe `card_id`, nunca PAN/CVV. Requisito único: garantir em audit que **nenhum log/persistência toca dados de cartão cru** |
| **SOC 2 (Type I/II)** | ⚠️ Opcional / sob demanda | Certificação, não lei. Só investir quando cliente enterprise exigir. Hoje sem sinal |
| **ISO 27001** | ⚠️ Opcional / sob demanda | Similar a SOC 2 — pressão de venda corporativa/governo. Sem sinal hoje |
| **eSocial (transmissão)** | ❌ N/A hoje → 🟢 Scale futuro | Hoje a API **só armazena dados localmente para consulta interna do cliente**. Evolução para transmissão direta ao eSocial é roadmap **Scale**, sem pedido atual do cliente |
| **NRs trabalhistas (NR-1, NR-6, NR-7)** | Indireto | Não regulam a API, mas EPI/atestados/PCMSO podem ser exigidos em fiscalização trabalhista do cliente → **retention policy de audit, EPIs e atestados é obrigação contratual**, não só boa prática |

**Resumo operacional:** no horizonte MVP/early-stage, o foco é **LGPD bem feita com rigor extra para dados de saúde**. SOC 2 e ISO 27001 entram sob demanda de cliente. eSocial é scale. PCI é verificação de audit (não permitir vazamento acidental de cartão).

### 7.3 Decisões arquiteturais registradas

Decisões tomadas nesta rodada de planejamento que devem guiar a execução.

| # | Decisão | Estágio | Observações |
|---|---|---|---|
| 1 | **Cloudflare Free Tier na frente da API** — cobre WAF básico, DDoS, HSTS, TLS 1.3, HTTP/2+3, compression, bot fight mode, rate limit básico | 🟡 Early-stage — **etapa final** | DNS hoje no registro.br é do cliente. Requer alinhamento com o cliente para apontar DNS → Cloudflare → Coolify. TLS Let's Encrypt do Coolify permanece atrás |
| 2 | **Sem WAF/CDN no MVP** | 🔴 MVP | Decisão consciente: volume baixo + 1 cliente B2B não justifica edge agora. A app assume responsabilidades que CDN cobriria (security headers, rate limit, compression) até a decisão #1 ser executada |
| 3 | **eSocial direto = Scale** | 🟢 Scale | Requer estudo de viabilidade (layout, certificado, protocolos). Sem pedido do cliente atual |
| 4 | **Sem front mobile nativo** | N/A | Web responsivo atende o uso atual e planejado |
| 5 | **LGPD integrada, não fase separada** | 🔴 MVP / 🟡 Early-stage | Criptografia de PII, audit trail, retention, response filtering entram como requisito do próprio MVP/early-stage |
| 6 | **API Keys já em prod** (cliente usa para Power BI) | Ativo | Auth via API key precisa de: rate limit próprio, scopes documentados, rotação, audit de uso, cuidado extra com BOLA |
| 7 | **GlitchTip (error tracking)** já instalado via `SENTRY_DSN` | ✅ Atende MVP | Confirmar em audit que cobre erros 5xx + contexto de usuário/org |

### 7.4 Audit item a item

**A preencher na Fase 1.** Varrer código e marcar Status (✅/⚠️/❌/N/A) + Observações nas seções 4 e 5 acima. Aqui ficará o resumo consolidado após o audit.

#### 7.4.1 Plano de execução da Fase 1

Ordem sugerida de inspeção — do bootstrap para fora, seguindo o fluxo da request. A cada arquivo, marcar Status + Observações nos itens relevantes das seções 4 e 5.

**Bootstrap e configuração (fundamento)**

1. `src/index.ts` — ordem de plugins globais, CORS, rate limit, body size, listen, security headers, OpenAPI
2. `src/env.ts` — validação Zod completa, fail-fast, todos os secrets declarados

**Infraestrutura (lib/ + plugins em lib/)**

3. `src/lib/errors/` + `src/lib/responses/` — hierarquia `AppError`, envelope consistente, inclusão de `requestId` no erro
4. `src/lib/logger/` — Pino estruturado, correlation ID via AsyncLocalStorage, silent em test
5. `src/lib/ratelimit/` — config global + presença de rate limit dedicado em `/api/auth`
6. `src/lib/shutdown/` — SIGTERM/SIGINT, grace period, `pool.end()`
7. `src/lib/health/` — liveness + deep check (DB)
8. `src/lib/cors.ts` — origin restrito, credentials, methods
9. `src/lib/sentry.ts` — integração GlitchTip, captura de 5xx, contexto de usuário/org
10. `src/lib/request-context/` + `request-context.ts` — investigar duplicação (débito #4)
11. `src/lib/audit/` — classificar: plugin ou morto (débito #5)
12. `src/lib/crypto/` — uso do `PII_ENCRYPTION_KEY`, algoritmo, quais campos criptografados
13. `src/lib/validation/` + `src/lib/schemas/` + `src/lib/zod-config.ts` — reuso, consistência
14. `src/lib/utils/` (retry, timeout) — presença de helpers úteis para deps externas

**Auth (coração do projeto)**

15. `src/lib/auth.ts` (24KB) — config Better Auth, senders injetados, permissions, hooks, audit
16. `src/lib/auth-plugin.ts` — macros `auth` e `orgAuth`, validação de `activeOrganizationId`, check de BOLA
17. `src/lib/permissions.ts` — statements de permissions, consistência com orgAuth
18. `src/lib/password-complexity.ts` — regras de senha

**Módulos críticos para infra (sem entrar em domínio)**

19. `src/modules/payments/webhook/` — validação de assinatura (`PAGARME_WEBHOOK_USERNAME/PASSWORD`), **idempotency**, timeout, logging sem dados de cartão
20. `src/modules/public/` — rate limit por rota, validação Zod, captcha/honeypot em fluxos com side-effect
21. `src/modules/admin/api-keys/` — BOLA por `organizationId`, rate limit por key, rotação, scopes, audit de uso
22. `src/modules/audit/` — confirmar que é domínio (service imutável, retention)

**Emails**

23. `src/emails/` + `src/lib/email.tsx` — confirmar escopo do refactor já decidido (débito #8)

**CI/CD e deploy (do README)**

24. `.github/workflows/` — lint, test, build, security (Trivy), dependabot
25. `Dockerfile` / `scripts/entrypoint.sh` — migrations automáticas, non-root, multi-stage

#### Entregáveis da Fase 1

1. **Status + Observações preenchidos nas tabelas das seções 4 e 5** (todos os itens que o projeto assumiu como relevantes para o contexto)
2. **Relatório narrativo** em `docs/reports/YYYY-MM-DD-api-infrastructure-audit.md` com:
   - Resumo executivo (X itens ✅, Y ⚠️, Z ❌)
   - Achados surpreendentes (positivos e negativos)
   - Riscos imediatos identificados em prod (se houver — cliente em produção)
   - Recomendação inicial de priorização
3. **Seção 7.7 expandida** se surgirem débitos novos durante a varredura
4. **Changelog** atualizado com a conclusão da Fase 1

#### 7.4.2 Metodologia de avaliação (como julgar "está bom / precisa melhorar")

**Princípio central:** não copiar nenhuma referência. Avaliar cada item pela **melhor solução para o contexto synnerdata**, usando múltiplas fontes e juízo técnico independente.

**4 fontes a consultar para cada item auditado**, ponderadas na ordem:

| # | Fonte | Como usar | Ferramenta |
|---|---|---|---|
| 1 | **Código atual do synnerdata** | O que existe, como está implementado, qual o débito real | `Read`, `Grep`, `Glob` |
| 2 | **Docs oficiais do Elysia** | Padrão recomendado pelo framework, APIs atualizadas, breaking changes, deprecations | `context7` (mcp tool) — `resolve-library-id` + `query-docs` |
| 3 | **Best practices na web** | OWASP, artigos recentes (2026), comunidade, análises de segurança | `WebSearch` + `WebFetch` |
| 4 | **Avocado-hp como inspiração** | Referência **de organização e padrão**, não de decisão técnica. Benchmark pareado, não dogma | `Read` em `~/Documentos/avocado-hp/avocado-hp/apps/server/src/` |

**Critério de julgamento:** para cada item, responder *"qual a melhor solução para este projeto, neste contexto?"* — **nunca** *"está igual ao avocado-hp?"*.

**Dimensões de avaliação** (cada item passa por 4 lentes):

| # | Dimensão | Pergunta-guia | Fonte principal |
|---|---|---|---|
| 1 | **Presença/completude** | O item existe e está configurado? | Código atual |
| 2 | **Organização semântica** | Está no lugar correto da estrutura de pastas (seção 7.6)? | Código atual + 7.6 |
| 3 | **Qualidade da implementação** | A implementação é sólida (tipagem, responsabilidade única, testabilidade, legibilidade)? Sinais: `any` excessivo, arquivos > 20KB com múltiplos concerns, funções longas, duplicação, dynamic imports suspeitos, lógica inline que deveria ser extraída | Leitura atenta do código |
| 4 | **Aderência a best practices** | Segue docs oficiais (Elysia, Better Auth, Zod) + OWASP + padrões de 2026? | Docs via `context7` + web research |

**Quando consultar `context7` e `WebSearch` (obrigatório em débitos significativos):**

Cada débito 🟡 ou 🔴 relevante deve ser validado contra ao menos uma fonte externa antes de ser registrado como ação final. Em particular:

- **Antes de sugerir implementação custom**: consultar docs do framework via `context7` (ex: `/better-auth/better-auth`, `/elysiajs/documentation`) para verificar se já existe feature built-in. Ver princípio "Better Auth primeiro" em 7.7
- **Antes de sugerir refactor de segurança**: buscar best practice atualizada via `WebSearch` (ex: HMAC webhook signature, security headers para JSON API, rate limit storage)
- **Para cada débito de qualidade capturado**: anotar na coluna "Ação" se houve validação externa ou se é julgamento do audit

Exemplo aplicado nesta auditoria:
- Débito #32 (rate limit `storage: "memory"`) → context7 `/better-auth/better-auth` → confirmou solução built-in (`storage: "database"`) — 1 linha de mudança
- Débito #56 (Basic Auth em webhook) → WebSearch → confirmou HMAC-SHA256 como padrão 2026 (Stripe, GitHub, Shopify, Okta) → anotar que Pagar.me v5 precisa ser verificado especificamente
- Débito 5.2 #1 (CSP ausente) → WebSearch → confirmou "for API-only servers, CSP is less critical" → manter como 🟢 baixa prioridade em vez de MVP

**Possíveis veredictos por item:**

| Veredicto | Significado | Ação |
|---|---|---|
| ✅ `synnerdata está correto` | Alinhado em TODAS as 4 dimensões | Status ✅ nas tabelas 4/5 |
| ✅ `funcional mas qualidade melhorável` | Dimensão 1 ✅ mas 2/3/4 com ressalva | Status ✅ + débito em 7.7 descrevendo o aspecto de qualidade |
| ⚠️ `synnerdata < ideal` | Existe mas com gap em 1+ dimensão | Status ⚠️ + observação + débito em 7.7 |
| ⚠️ `synnerdata = avocado-hp, ambos subótimos` | Mesmo débito que vimos no outro projeto — solução vem das fontes 2/4 | Documentar solução correta; Status ⚠️ |
| 🏆 `synnerdata > avocado-hp` | Implementação daqui supera a de lá | Celebrar; ✅; **anotar para trazer de volta ao avocado-hp** |
| ❌ `não existe` | Item ausente | Status ❌ + prioridade (MVP/Early/Scale) |
| ⚠️ `existe mas em lugar errado` | Implementado mas viola 7.6 | Status ⚠️ + débito em 7.7 |

**Pontos de partida sabidos (não começar do zero):**

- synnerdata **já tem** coisas que avocado-hp não tinha: `PII_ENCRYPTION_KEY` + `src/lib/crypto/`, `INTERNAL_API_KEY` para jobs, Trivy scan, Dependabot, `retry.ts`/`timeout.ts`, GlitchTip integrado, Uptime Kuma, `api-keys` em prod, infra de testes mais rica (builders/factories/fixtures)
- avocado-hp tinha débitos que **provavelmente existem aqui também**: body size limit, request timeout, rate limit em `/api/auth`, security headers — mas **investigar de forma independente**, não assumir
- avocado-hp **organiza melhor** `lib/` vs `plugins/` e emails — aí sim adotar a ideia

**Princípio "Better Auth primeiro" (crítico):**

Better Auth é peça essencial do projeto e resolve **muitos gaps de auth/identity nativamente**. Antes de propor qualquer implementação custom em auth, session, CSRF, rate limit de auth, 2FA, password, API keys, organizações, invitations:

1. **Verificar primeiro** se Better Auth já oferece a feature (ver tabela em 7.7 "Features já usadas" e "Features ainda não usadas")
2. **Consultar docs via `context7`** (`mcp__context7__resolve-library-id` + `query-docs`) antes de propor código custom
3. **Preferir configuração da lib** a código próprio — menos código para manter, menos bugs, lib é auditada pela comunidade
4. **Só implementar custom** quando Better Auth comprovadamente não cobrir E o gap for real no contexto do projeto

Exemplo já aplicado: rate limit em `/api/auth` parecia débito MVP; auditoria revelou que Better Auth tem `customRules` muito mais granulares que uma implementação custom genérica faria. Débito **resolvido sem código novo**.

#### 7.4.3 Regras da Fase 1

- **Somente leitura** — não alterar código; apenas registrar estado atual
- **Não corrigir nada ainda** — tentação de "já que está aqui, conserto" atrapalha o mapeamento; corrige na Fase 3
- **Se encontrar algo que parece crítico em prod** (ex: webhook sem idempotency, rota sem auth), destacar no relatório como 🔴 **urgente** para a Fase 2, mas seguir o audit até o fim
- **Investigação independente** — para cada item, consultar as 4 fontes da seção 7.4.2 antes de emitir veredicto. Não é cópia, é investigação
- **Registrar incertezas** — se algo não for claro entre "correto" e "débito", marcar com `?` nas Observações e listar o que precisa confirmar

#### Pontos de atenção já mapeados para a Fase 1

Descobertas da leitura superficial dos módulos — não detalhes de negócio, só áreas onde a infra toca pontos sensíveis e precisam inspeção cuidadosa:

- **`modules/auth/` não tem controller/service próprios** — auth é **100% plugin-based via Better Auth**. Toda lógica vive em `lib/auth.ts` (24KB), `lib/auth-plugin.ts` e `lib/permissions.ts`. Esses três arquivos são o **coração da infra de auth** e são candidatos diretos a migrar para `src/plugins/`
- **`modules/payments/webhook/`** — endpoint recebe eventos do Pagar.me. Inspecionar na Fase 1: validação de assinatura (`PAGARME_WEBHOOK_USERNAME`/`PASSWORD`), **idempotency** contra reprocessamento de evento, rate limit próprio, timeout adequado, logging do payload cru (sem PII/cartão) para replay
- **`modules/public/`** — rotas **sem autenticação**, superfície de ataque direta. Inspecionar: rate limit por rota (mais agressivo que global), validação Zod rigorosa, nenhum vazamento de dados sensíveis, captcha/honeypot em fluxos com side-effect (ex: contact form)
- **`modules/admin/api-keys/`** — auth method alternativo já em produção (cliente consome via Power BI). Inspecionar: isolamento por `organizationId` (BOLA), rate limit próprio por key, rotação, scopes documentados, audit de uso, revogação

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
| **CP-1** | **PR #1 — Criar `src/plugins/` e migrar plugins Elysia de `lib/`** — `logger/`, `health/`, `cors.ts`, `ratelimit/` (investigar estrutura vazia), `shutdown/`, `auth-plugin.ts` (quebrado em sub-arquivos), `cron-plugin.ts`, `sentry.ts`, `request-context/` (consolidar com `request-context.ts`) | #1, #4, #27 (+ #49 parcial) | plan | XL | RU-8 |
| **CP-2** | **PR #2 — Consolidar emails em `src/lib/emails/`** — mapa em débitos #8/#9; padronizar params `to`, abstrair `dispatchEmail({...})`, mover hardcoded contact email p/ env | #8, #9, #68, #69, #70, #71, #72, #73 | plan | XL | — |
| **CP-3** | **PR #3 — `src/routes/v1/` + versionamento padronizado** — extrair catálogo de controllers de `src/index.ts` para `src/routes/v1/index.ts`; alinhar prefix `/api/v1/` em todos os controllers | #10, #13, #42 | plan | L | — |
| **CP-4** | **PR #4 — Quebrar `lib/auth.ts` (24KB) e `lib/auth-plugin.ts` (369 linhas)** — `auth/config.ts`, `auth/audit-helpers.ts`, `auth/validators.ts`, `auth/hooks.ts`; `auth/plugin.ts` + `auth/openapi-enhance.ts` | #38, #39, #49, #51 | plan | L | CP-1 |
| **CP-5** | **PR #5 — Limpar `lib/errors/`** — mover `employee-status-errors.ts`, `subscription-errors.ts` para `modules/<domínio>/errors.ts`; mover `lib/helpers/employee-status.ts` para `modules/employees/`; consolidar schemas de erro com factory `errorSchema(code)` (padrão avocado-hp) | #2, #21, #45 | refactor | L | — |

##### Segurança e webhooks

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **CP-6** | Validar suporte a HMAC no Pagar.me v5 e migrar webhook (se suportado); se não suportado, adicionar IP allowlist como defesa adicional | #56, #57 | new | M | — |
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
| **CP-17** | Métricas básicas — OTel Metrics ou Prometheus client: latência por rota, throughput, erro rate, pool de conexões DB | Early #2 | new | M | — |
| **CP-18** | Política de deprecation com headers `Deprecation` / `Sunset` — documentar em `docs/api-versioning.md` + helper em `lib/responses/` para injetar headers | Early #9 | new | M | CP-3 |
| **CP-19** | Playwright E2E em workflow CI — novo workflow ou step em `test.yml` (pelo menos no schedule diário) | #78 | config | M | — |
| **CP-20** | ✅ **2026-04-22** — `--coverage --coverage-reporter=lcov` ativado em affected + full suite. Upload via `codecov/codecov-action@v5`. Depende de `CODECOV_TOKEN` no repo secrets para publicação | #86 | config | S | — |
| **CP-21** | ✅ **2026-04-22** — `actions/cache@v4` com chave `bun-${{ hashFiles('bun.lock') }}` em lint/test/build (security.yml N/A — roda docker build) | #80 | config | S | — |
| **CP-22** | ✅ **2026-04-22** — `bun install --frozen-lockfile` em lint/test/build (alinhado com Dockerfile que já usava). Detecta drift de package.json vs bun.lock | #81 | config | S | — |
| **CP-23** | ✅ **2026-04-22** — `timeout 10 bun dist/index.js` com env fake válido em `build.yml`. Aceita exit 0/124/143 como sucesso, qualquer outro código reprova o bundle | #79 | config | S | — |

##### Env.ts e auth hardening adicional

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **CP-24** | Log explícito em `UnauthorizedError` do macro auth com IP + path (não logar a chave/token) | #36 | new | S | — |
| **CP-25** | `permissions.ts` — helper `inheritRole(base, overrides)` para reduzir duplicação entre owner/manager/supervisor/viewer | #50 | refactor | M | — |
| **CP-26** | Mover `extractErrorMessages` de `src/index.ts` para `lib/openapi/error-messages.ts` (ou `src/plugins/openapi/` após CP-1) | #11 | refactor | S | CP-1 |
| **CP-27** | Registrar listeners (`registerPaymentListeners`, `registerEmployeeListeners`) ANTES do `.listen()` no bootstrap | #12 | config | S | — |
| **CP-28** | Mover `lib/audit/` totalmente — após RU-8 verificar se sobrou algo; remover pasta vazia | #5 resolução final | refactor | S | RU-8 |
| **CP-29** | `formatErrorDetail` com limite de profundidade (max 5) para evitar stack overflow em `cause` cíclico | #44 | config | S | — |
| **CP-30** | Investigar dynamic imports suspeitos — `cron-plugin.ts` + `lib/auth.ts` `afterCreateOrganization` (possível dep circular) | #28, #52 | refactor | M | — |

##### Qualidade geral

| ID | Ação | Débitos cobertos | Tipo | Esforço | Depende de |
|---|---|---|---|---|---|
| **CP-31** | Centralizar uso de `isProduction`/`isDev` via `@/env` (hoje há `process.env.NODE_ENV` direto em vários arquivos) | #26, #41 | refactor | S | — |
| **CP-32** | `cron-plugin.ts` — refatorar 7 jobs duplicados via array declarativo ou helper `createCronJob({ name, pattern, handler })` | #46 | refactor | M | CP-1 |
| **CP-33** | `auth.ts` helpers `auditXxx` duplicados — consolidar em `buildAuditEntry(...)` | #51 (parcial — resto em CP-4) | refactor | S | CP-4 |
| **CP-34** | Branded type `EncryptedString` para `lib/crypto/pii.ts` diferenciando plaintext de ciphertext | #47 | refactor | S | — |
| **CP-35** | `isBetterAuthNotFound` wrapper genérico em `api-key.service.ts` (reduz duplicação em 3 métodos) | #61 | refactor | S | — |
| **CP-36** | Newsletter — não revelar existência de email (retornar mesma response em duplicado e novo) | #62 | refactor | S | — |
| **CP-37** | Version fallback em `lib/health/index.ts` — trocar `"1.0.50"` hardcoded por `"unknown"` ou ler do `package.json` | #29 | config | S | — |
| **CP-38** | Runbook de oncall em `docs/runbooks/` — DB down, webhook Pagar.me falhando, SMTP caído, Sentry recebendo 5xx em massa | #93 | docs | M | — |
| **CP-39** | Separar `SMTP_FROM` em duas envs — `SMTP_FROM` (apenas endereço, `z.email()` puro) + `SMTP_FROM_NAME` (display name opcional); remover `smtpFromSchema` custom; montar `from: { name, address }` em `src/lib/email.tsx`; migrar value no Coolify | Revisão de design do #17 após RU-1 | refactor | S | — |
| **CP-40** | ✅ **2026-04-22** — Triagem de 13 highs em dev + prod deps. Estratégia ajustada após auditoria: `bun update` → upgrade secretlint 11→12 → `overrides` para transitivas de deps já no latest (commitizen, drizzle-orm, exceljs) + transitivas dentro de ranges de parents não-latest (better-auth, ultracite 6). CI threshold subiu `critical` → `high`. Escopos não-CVE saíram como CP-46/47/48/49 | Follow-up de RU-4a | refactor | M | RU-4b |
| **CP-41** | Workflow dedicado para integration tests externos (Pagar.me) — novo `.github/workflows/test-integration.yml` com `workflow_dispatch` + schedule semanal, secrets de sandbox Pagar.me configurados, rodando apenas testes gated por `skipIntegration`. Destrava cobertura real dos módulos `src/modules/payments/*` em CI (hoje só rodam em máquina de dev) | Follow-up de RU-5 | new | M | — |
| **CP-42** | ✅ **2026-04-22** — Helper `buildAuditChanges(before, after)` em `src/modules/audit/pii-redaction.ts` com 25 unit tests. Redação automática de 11 campos PII (CPF, RG, pisPasep, CTPS, email, phone, mobile, salary, hourlyRate, CID, birthDate) e exclusão de metadata (createdAt/updatedAt/createdBy/updatedBy/deletedAt/deletedBy). Convenção documentada em `src/modules/audit/CLAUDE.md`. Aplicado em employees (create/update/updateStatus/delete), medical-certificates (create/update/delete) e subscription (cancel/restore). Enum `auditResourceSchema` alinhado com a spec: renomeado `medical_leave` → `medical_certificate`, adicionado `labor_lawsuit` | #96 (parcial), LGPD Art. 18/48 | refactor | M | — |
| **CP-43** | ✅ **2026-04-22** — `auditPlugin` mountado nos 4 controllers (`employee`, `medical_certificate`, `cpf_analysis`, `labor_lawsuit`). GET `/:id` emite `audit({ action: "read", resource, resourceId })` após resolve bem-sucedido. Listagens **não** auditam (ruído). Fix no plugin: destructure movido pra dentro do `audit()` (derive rodava antes do macro auth resolver user/session). Enum `auditResourceSchema` ganhou `cpf_analysis`. Integration test em `medical-certificates/__tests__/get-medical-certificate.test.ts`. Convenção documentada em `src/modules/audit/CLAUDE.md` seção "Read Audit (CP-43)" | #96 (complementa), LGPD Art. 11/48 | new | M | RU-7 |
| **CP-44** | Audit BOLA automatizado em CI — script que AST-scan `src/modules/**/*.service.ts` identificando queries `db.select/update/delete` em tabelas org-scoped sem filtro `organizationId`. Falha PR se gap novo introduzido. Preventivo contra regressão após RU-9 ter validado o estado limpo atual | Follow-up de RU-9 | new | M | — |
| **CP-45** | ✅ **2026-04-22** — Local Backup Retention ajustado para 7 backups / 7 dias / 2 GB no Coolify (R2 inalterado em 30/30/8). Ação operacional pura na UI, sem código. Runbook atualizado | Follow-up de RU-10 | config | S | — |
| **CP-46** | Migração ultracite 6 → 7 (Biome → Oxc) — descoberto em CP-40. Ultracite 7 trocou o engine subjacente de Biome para Oxc (`oxlint` + `oxfmt`). Requer: remover `@biomejs/biome` das devDeps, validar `biome.json`/`biome.jsonc` → config equivalente em Oxc, rodar `ultracite check` + `ultracite fix` em todo o codebase, validar que pre-commit via `lint-staged` continua funcionando. Não é tooling crítico para segurança — espera janela dedicada | Descoberto em CP-40 | refactor | L | — |
| **CP-47** | Migração better-auth 1.4 → 1.6 — descoberto em CP-40. Envolve: (a) adicionar coluna `verified` na tabela `twoFactor` (schema migration, default `true`, sem backfill necessário — run `npx @better-auth/cli generate` + drizzle-kit generate + migrate); (b) validar mudança de semântica de `session.freshAge` (agora calculado de `createdAt` em vez de `updatedAt`); (c) rodar suíte completa de auth + 2FA para detectar regressões em hooks, permissions, api-keys; (d) revisar release notes 1.5/1.6 para features opcionais úteis (OTel instrumentation, WeChat provider, etc.). Não é CVE — CVEs de `defu`/`kysely` foram resolvidas via overrides em CP-40 | Descoberto em CP-40 | refactor | L | — |
| **CP-48** | Migração Zod 4.1 → 4.3 — descoberto em CP-40. Zod 4.3 proíbe `.partial()` em schemas com `.refine()` (antes permitia com comportamento indefinido). Afeta ~16 `.model.ts` em `src/modules/` (employees, occurrences/*, organizations/*, payments/billing, etc.). Fix padrão: extrair objeto base (sem refine), fazer `.partial().extend()` nele, aplicar refine depois. Zod está pinado em `~4.1.13` em CP-40 como contenção | Descoberto em CP-40 | refactor | M | — |
| **CP-49** | Sync react/react-dom versions — descoberto em CP-40. `react-dom` não está nas devDeps diretas mas é pulled por `@react-email/components`, e fica desalinhado de `react` em patches (`bun update` bumpou react → 19.2.5 enquanto react-dom ficou em 19.2.4, causando runtime mismatch). Opções: (a) adicionar `react-dom` às devDeps pinado ao mesmo patch; (b) manter `react` pinado exato (feito em CP-40 como contenção); (c) override de `react-dom` matching `react`. Decidir quando for revisar deps novamente | Descoberto em CP-40 | config | S | — |
| **CP-50** | Migração TypeScript 5.9 → 6.x — descoberto em CP-40 quando CI falhou ao puxar TS 6.0.3 ephemerally (TS não estava em devDeps). TS 6 transforma `moduleResolution=node` em erro deprecated (antes era warning). Requer: (a) alterar `tsconfig.json` de `"moduleResolution": "node"` para `"bundler"` (recomendado Elysia/Bun) ou `"node16"`; (b) auditar imports para compatibilidade com resolução nova (extensões obrigatórias em alguns casos); (c) remover o pin `~5.9.3` após migração validada. Contenção atual: TS pinado em devDeps `~5.9.3` | Descoberto em CP-40 | refactor | M | — |

**Total bucket 🟡: 50 ações registradas · 37 ativas · 12 concluídas (CP-7, CP-8, CP-9, CP-13, CP-20, CP-21, CP-22, CP-23, CP-40, CP-42, CP-43, CP-45 em 2026-04-22) · 1 contenção temporária (CP-50).**

##### Ordem de execução sugerida

Sequência proposta para extrair valor rápido antes de atacar os refactors grandes. Decidida após fechamento do bucket 🔴 — critério: **ganho de compliance/CI por hora de trabalho**, com XL ficando para janela dedicada.

| Onda | Foco | Itens | Racional |
|---|---|---|---|
| **Onda 1 — Ganhos rápidos de CI/segurança** | ✅ **Concluída em 2026-04-22** | CP-40 (M) → CP-7 (S), CP-8 (S), CP-9 (S), CP-22 (S), CP-21 (S), CP-23 (S), CP-13 (S), CP-20 (S) | CP-40 entregue em PR separada (escopo maior). Os 8 S's entregues numa PR agrupada com 8 commits atômicos |
| **Onda 2 — Compliance LGPD (débito #96)** | ✅ **Concluída em 2026-04-22** | CP-42 (M) → CP-43 (M) | CP-42 entregou a convenção (`buildAuditChanges` + redação PII); CP-43 aplicou `auditPlugin` nos 4 GET handlers sensíveis. Débito #96 100% endereçado |
| **Onda 3 — Qualidade pontual** | Resolver débitos S restantes enquanto XL ainda não começou | CP-24, CP-27, CP-29, CP-31, CP-34, CP-35, CP-36, CP-37, CP-39 (todos S); CP-25, CP-30, CP-41 (M) | Podem ser agrupados em 2-3 PRs temáticos (auth hardening, error handling, env centralization). CP-41 vale dedicar PR separada (workflow novo) |
| **Onda 4 — Cloudflare + Observabilidade** | Depende de janela com o dono (CP-14 precisa alinhar DNS) | CP-14 → CP-15 → CP-16; CP-17, CP-18, CP-19 | Cloudflare é sequencial (CP-14 destrava CP-15 destrava CP-16). Observabilidade (CP-17/18/19) pode rodar em paralelo — CP-18 depende de CP-3 |
| **Onda 5 — Refactors grandes** | PRs dedicados, worktree obrigatório, plan formal em `docs/plans/` | CP-1 (XL) → CP-4, CP-26, CP-28, CP-32 (dependem de CP-1); CP-2 (XL); CP-3 (L) → CP-18; CP-5 (L); CP-6 (M), CP-33, CP-38, CP-44 | CP-1 tem o maior raio de desbloqueio (4 CPs menores dependem dele). CP-2 e CP-3 independentes. CP-38 e CP-44 são documentação/tooling — podem intercalar |

**Notas operacionais:**
- **CP-45 já concluída** (2026-04-22) — ação operacional no Coolify, sem código.
- **Onda 1 e Onda 2 não têm dependências cruzadas** — podem rodar em paralelo se houver bandwidth.
- **XL (CP-1, CP-2) em worktree isolado** (ver 7.5.1 § Metodologia híbrida) — regra do projeto para features que bloqueiam outros trabalhos.
- Reavaliar ordem a cada 5 CPs concluídos — aprendizado do bucket 🔴 mostrou que prioridades mudam ao descobrir o escopo real.

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

**Total bucket 🟢: 21 ações monitoradas. Nenhuma investida agora — aguardar sinal.**

---

### Resumo executivo do roadmap

| Bucket | Ações | Esforço consolidado | Prazo alvo | Estado |
|---|---|---|---|---|
| 🔴 Urgente | 10 | ~7 S/M + 1 L = 2-3 semanas com foco parcial | até 30 dias | ✅ Concluído em 2026-04-22 (1 dia de execução efetiva) |
| 🟡 Curto prazo | 45 registradas (1 done · 44 ativas) | 5 planos XL/L + ~37 S/M | 30-90 dias | 🔄 Ordem de execução definida (ver 7.5 § Ordem de execução sugerida) |
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
- Débitos cobertos: #N, #N (ref 7.7)
- Depende de: <IDs ou "nenhum">

## Contexto e justificativa
Por que essa ação agora, o que ela destrava, qual risco resolve.

## Pesquisa de best practices (4 fontes — seção 7.4.2)
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

### 7.6 Organização semântica do projeto

A organização de pastas é parte do produto. Cada adição deve caber naturalmente na estrutura existente; criar pasta nova só é aceitável quando representa um **conceito semântico novo**, não por conveniência.

**Princípio guia:** antes de criar arquivo ou pasta, perguntar — *"onde um mantenedor futuro procuraria isso?"*. Se a resposta não for óbvia, o lugar está errado.

#### Código (`src/`)

Cada pasta em `src/` tem um **critério semântico próprio**. A regra é clara: o critério decide onde algo mora, e cada pasta carrega responsabilidade única.

`src/modules/` é responsabilidade do **domínio/negócio** e não está no escopo deste documento (vive em `docs/code-standards/module-code-standards.md`).

| Pasta | Responsabilidade | Critério |
|---|---|---|
| `src/lib/` | **Utilitários puros** — agnósticos ao framework HTTP | Função/classe/schema **testável sem subir uma app Elysia**. Sem `new Elysia()`, sem hooks, sem macros |
| `src/plugins/` ⭐ novo | **Plugins Elysia** — infraestrutura cross-cutting com ciclo de vida HTTP | Tem `new Elysia({ name })`, hooks (`derive`, `onError`, `onAfterHandle`, `onAfterResponse`) ou macros (`auth`, `orgAuth`) |
| `src/routes/` ⭐ sugerida | **Montadores de rotas** — composição de controllers por versão da API | `src/routes/v1/index.ts` compondo todos os controllers. Deixa `src/index.ts` enxuto (bootstrap + plugins globais, não catálogo de rotas) |
| `src/db/` | **Acesso a dados** — conexão, migrations, schema, seeds | Infra do Drizzle: `index.ts` (conexão), `migrate.ts`, `schema/`, `migrations/`, `seeds/` |
| `src/emails/` | **Templates e renderização de email** — React Email | `components/` (shared), `templates/<dominio>/` (por contexto), `render.ts`. **Senders** (que disparam o envio) são utilitários em `src/lib/` ou `src/plugins/` dependendo da complexidade |
| `src/test/` | **Infraestrutura de testes** — helpers, fixtures, factories, builders, preload | Suporte aos testes dos módulos. Não testa nada por si — é ferramenta |
| `src/env.ts` | **Validação de configuração** — Zod schema para env vars | Única fonte de config. Toda env var nova passa por aqui |
| `src/index.ts` | **Bootstrap** — instanciar Elysia, registrar plugins globais, registrar `routes/v1`, listen | Enxuto: composição, não lógica. Se cresce demais, sinal de que algo deveria ter ido para `plugins/` ou `routes/` |

**Regra prática:** antes de criar arquivo ou pasta, perguntar:
- **É plugin Elysia?** (tem `new Elysia()`, hooks, macros) → `src/plugins/`
- **É utilitário puro, testável sem subir app?** → `src/lib/`
- **É domínio/negócio?** → `src/modules/`
- **É composição de rotas de uma versão da API?** → `src/routes/v1/`
- **É acesso a banco?** → `src/db/`
- **É template de email?** → `src/emails/`
- **É infraestrutura de teste?** → `src/test/`

Se a resposta não for óbvia, o critério da pasta está ambíguo e precisa revisão.

#### Convenção adotada para este projeto

Hoje o `src/lib/` mistura utilitários puros e plugins Elysia; e existe duplicidade (ex: `src/emails/` + `src/lib/email.tsx`). A convenção acima passa a valer **a partir desta iniciativa** via:

1. **Plugins novos (do MVP/early-stage) nascem em `src/plugins/`** desde já — mesmo que o legado ainda esteja em `lib/`. Paramos de piorar a mistura.
2. **Legado migra oportunisticamente**: quando a Fase 3 tocar em algo que está no lugar errado, aproveita o PR e move.
3. **Débitos grandes** (mover múltiplos plugins de uma vez, consolidar emails) podem virar PRs dedicados de refactor se o volume justificar — ver 7.7.

#### Documentação (`docs/`)

Subpastas já convencionadas que devem ser **reaproveitadas**, não duplicadas:

| Pasta | Propósito | Uso nesta iniciativa |
|---|---|---|
| `docs/code-standards/` | Padrões e convenções de código | Atualizar se o audit revelar padrão novo a adotar |
| `docs/improvements/` | **Planos estruturais de melhoria da API** (maturidade, infra, deployment) | ✅ Este checklist mora aqui |
| `docs/plans/` | Planos de execução **feature-by-feature**, datados (`YYYY-MM-DD-<nome>.md`) | Plans gerados na Fase 3 para itens complexos do roadmap |
| `docs/reports/` | Relatórios de estado em um ponto do tempo (audit, snapshot) | Relatório consolidado da Fase 1 (audit) |
| `docs/refactoring/` | Notas sobre refactors estruturais | Se algum débito técnico gerar refactor relevante |
| `docs/payments-decisions/` | ADRs específicos do módulo de pagamentos | — |

#### Artefatos das próximas fases deste trabalho

| Fase | Artefato | Onde mora |
|---|---|---|
| Fase 0 (concluída) | Este checklist + contexto aplicado | `docs/improvements/api-infrastructure-checklist.md` ✅ |
| Fase 1 | Audit de estado — Status preenchido em cada item + relatório consolidado | Status nas seções 4 e 5 **deste arquivo**; relatório narrativo em `docs/reports/YYYY-MM-DD-api-infrastructure-audit.md` |
| Fase 2 | Roadmap priorizado com 3 buckets (🔴/🟡/🟢) | Seção 7.5 **deste arquivo** |
| Fase 3 | Execução por item. Itens simples = PR direto; itens complexos ganham plan próprio | PRs via branches `feat/` `fix/` `refactor/` a partir de `preview`. Plans em `docs/plans/YYYY-MM-DD-<slug>.md` |

#### Padrões de código a respeitar ao executar

- **Zod v4** para validação (nunca `t.*` do Elysia) — single source of truth para validação + OpenAPI
- **Envelope** `{ success, data }` ou `{ success, error }` via helpers em `src/lib/responses/`
- **AppError hierarchy** em `src/lib/errors/` e erros de domínio em `errors.ts` do módulo — nunca `status()` do Elysia
- **IDs domínio-prefixados** (`<domain>-${crypto.randomUUID()}`)
- **Soft delete** com `deletedAt`/`deletedBy` e filtro `isNull(...)` nas queries
- **Timestamps + auditoria** (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`) — populados do session
- **Filtro obrigatório por `organizationId`** em qualquer query de entidade de domínio (defesa BOLA)
- **JSON Merge Patch** (RFC 7396) em updates com campos nullable
- **Sem re-exports / barrel files** (exceto `src/db/schema/index.ts`)

### 7.7 Débitos de organização de código já identificados

Pré-audit — itens de **organização semântica** detectados no `src/` atual. Entram no backlog de refactors da Fase 2 (🟡 Curto prazo, não urgentes — não bloqueiam MVP).

#### Em `src/lib/` — mistura de responsabilidades

| # | Débito | Ação sugerida |
|---|---|---|
| 1 | **Plugins Elysia e utilitários puros misturados** em `src/lib/` | Criar `src/plugins/` e migrar: `logger/`, `health/`, `ratelimit/`, `shutdown/`, `cors.ts`, `auth-plugin.ts`, `cron-plugin.ts`, `sentry.ts`, `request-context/` |
| 2 | `src/lib/helpers/employee-status.ts` tem **lógica de domínio**, não utilitário | Mover para `src/modules/employees/` (helper específico do domínio não pertence a `lib/`) |
| 3 | `src/lib/utils/` com genuínos utilitários (`retry.ts`, `timeout.ts`) | Manter. Após remoção de `helpers/` (débito #2), resolve a duplicação `helpers/` vs `utils/` |
| 4 | `src/lib/request-context.ts` **e** `src/lib/request-context/` convivendo | Investigar migração incompleta; manter só a forma atual e remover a duplicata. Mover o resultado final para `src/plugins/` |
| 5 | `src/lib/audit/` convivendo com `src/modules/audit/` já existente | **Módulo `audit/` já existe em `modules/`** (controller + service + model). Investigar o que `lib/audit/` contém: provavelmente é plugin Elysia que deve ir para `src/plugins/audit/`, ou código duplicado/morto a remover |
| 6 | `src/lib/__tests__/` dentro de `lib/` | Padrão do projeto é `__tests__/` ao lado do código — revisar se cabe migrar para junto de cada artefato |
| 7 | `src/lib/auth.ts` com 24KB | Arquivo grande pode esconder concerns misturados — revisar se cabe dividir em `auth.ts` (config) + `auth-permissions.ts` + `auth-hooks.ts` |

#### Em `src/emails/` vs `src/lib/email.tsx` — duplicação de responsabilidade

**Decisão registrada:** consolidar seguindo o padrão do avocado-hp — tudo em `src/lib/emails/{senders, templates, components}`. Justificativa: emails são utilitários puros (não são plugins Elysia), têm responsabilidade única por subpasta, e a estrutura já foi validada no projeto-referência.

**Escopo mapeado no Bloco 5 da Fase 1 (2026-04-21) — validado via `grep`:**

| # | Débito | Ação |
|---|---|---|
| 8 | **`src/emails/` e `src/lib/email.tsx` convivendo** — duas "fontes de email" no código | Consolidar em `src/lib/emails/`. Movimentação: `src/emails/components/` (5 arquivos) → `src/lib/emails/components/`; `src/emails/templates/{auth,contact,payments}/` (19 templates) → `src/lib/emails/templates/{auth,contact,payments}/`; `src/emails/render.ts` → `src/lib/emails/render.ts`; `src/emails/constants.ts` → `src/lib/emails/constants.ts`; `src/emails/__tests__/` → `src/lib/emails/__tests__/`. Remover `src/emails/` vazio |
| 9 | **`src/lib/email.tsx` com 476 linhas** concentra transporter Nodemailer + 19 senders (7 auth + 9 payments + 1 admin + 1 contact) | Dividir em: `src/lib/emails/mailer.ts` (transporter + helper `sendEmail`, ~40 linhas); `src/lib/emails/senders/auth.tsx` (7 senders); `src/lib/emails/senders/payments.tsx` (9 senders); `src/lib/emails/senders/admin.tsx` (1 sender); `src/lib/emails/senders/contact.tsx` (1 sender). Remover `src/lib/email.tsx` |

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
| 10 | Sem `src/routes/` — composição de controllers provavelmente espalhada entre `src/index.ts` e os próprios módulos | Investigar na Fase 1. Se `src/index.ts` registra controllers diretamente, extrair para `src/routes/v1/index.ts` — isolando bootstrap (plugins globais + listen) do catálogo de rotas |

#### Débitos descobertos no Bloco 1 da Fase 1 (2026-04-21)

| # | Débito | Origem | Ação sugerida |
|---|---|---|---|
| 11 | **`extractErrorMessages` (28 linhas de Zod v4 internals) dentro de `src/index.ts`** | Bootstrap está acoplado à lógica de extração de error messages para OpenAPI | Extrair para `src/lib/openapi/error-messages.ts` (ou em futuro `src/plugins/openapi/`) |
| 12 | **Registro de listeners (`registerPaymentListeners`, `registerEmployeeListeners`) dentro do `.listen()` callback** | `src/index.ts:147-148` — se listen falhar, listeners não registram | Registrar antes do `.listen()` ou mover para plugins dedicados |
| 13 | **Versionamento na URL inconsistente** | Bootstrap registra controllers sem prefix global `/api/v1`. `admin` usa `/v1/admin`, mas outros módulos precisam auditar | Padronizar: extrair para `src/routes/v1/index.ts` compondo todos os controllers com prefix único (alinhado com débito #10) |
| 14 | ~~`env.ts` — `BETTER_AUTH_SECRET` sem `.min(32)`~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — adicionado `.min(32)` ao schema |
| 15 | ~~`env.ts` — `SMTP_USER`/`SMTP_PASSWORD` `.optional()` sem refine condicional em prod~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — `superRefine` exige ambos quando `NODE_ENV=production` |
| 16 | ~~`env.ts` — `PII_ENCRYPTION_KEY.length(64)` não valida hex~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — `.regex(/^[0-9a-fA-F]{64}$/)` com mensagem explicativa |
| 17 | ~~`env.ts` — `SMTP_FROM: z.string()`~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — trocado por `z.email().default(...)` |
| 18 | ~~`env.ts` — `NODE_ENV` não validado no schema~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — `NODE_ENV: z.enum(["development","production","test"]).default("development")`; `isProduction` agora lê de `env.NODE_ENV` |
| 19 | ~~`env.ts` — `CORS_ORIGIN` formato comma-separated implícito~~ | ✅ **Resolvido em RU-1 (2026-04-21)** — `.describe()` documenta formato comma-separated (parser delegado a `parseOrigins` em `lib/cors.ts`) |
| 20 | **Falta request timeout global** | Bun.serve default atual é **10s** (`idleTimeout`; 255s era default antigo). O valor atual é razoável, mas depende de default implícito — sem controle explícito no código | Configurar `serve.idleTimeout` explícito em `src/index.ts` ou plugin dedicado |

#### Débitos descobertos no Bloco 2 da Fase 1 (2026-04-21)

| # | Débito | Severidade | Ação sugerida |
|---|---|---|---|
| 21 | **Erros de domínio em `src/lib/errors/`** (`employee-status-errors.ts`, `subscription-errors.ts`) | 🟡 organização | Mover para `src/modules/employees/errors.ts` e `src/modules/payments/subscription/errors.ts`. `lib/errors/` fica só com `base-error.ts`, `error-plugin.ts`, `http-errors.ts` |
| 22 | ~~`auditPlugin` sem try/catch em `AuditService.log()`~~ | — | **Reavaliado — não é débito.** `AuditService.log()` (`modules/audit/audit.service.ts:9-29`) **já tem try/catch interno** com silent catch via logger. Design intencional documentado no CLAUDE.md do módulo audit: "Logging é assíncrono e silencioso — falhas não propagam erro". `auditPlugin` chama `AuditService.log()` via `await` mas é seguro porque o método nunca propaga erro |
| 23 | **`auditPlugin` exige contexto manual** | 🟡 hardening | Hoje cada controller passa `context: { userId, organizationId }` ao chamar `audit()`. Propenso a esquecer. Melhor: injetar via macro auth (padrão avocado-hp) — deriva `user`/`session` e o plugin de audit pega automaticamente |
| 24 | **`auditPlugin` — `action`/`resource` aceitam `string`** | 🟡 hardening | Tipo `AuditAction \| string` permite valores ad-hoc e perde type safety. Remover `\| string` força enum estrito |
| 25 | **`errorPlugin` não trata `code === "PARSE"`** | 🟡 qualidade | Parse errors (JSON inválido) caem no "unhandled" com 500. Avocado-hp tratava como 400 `PARSE_ERROR`. Adicionar branch explícito |
| 26 | **`errorPlugin` usa `process.env.NODE_ENV` direto** em vez de importar `isProduction` de `env.ts` | 🟢 leve | Inconsistência — `env.ts` já exporta `isProduction`. Padronizar |
| 27 | **`lib/cron-plugin.ts` é plugin Elysia em `lib/`** | 🟡 organização | Confirma débito #1 geral — mover para `src/plugins/cron/` |
| 28 | **`cron-plugin.ts` usa dynamic import para `VacationJobsService`** | 🟡 investigar | Padrão suspeito — pode indicar dependência circular entre `lib/cron-plugin.ts` e `modules/occurrences/vacations/`. Investigar causa e remover dynamic import se não houver motivo real |
| 29 | **`lib/health/index.ts` — version fallback hardcoded `"1.0.50"`** | 🟢 leve | Se `npm_package_version` não vier, usa valor fixo que fica desatualizado. Trocar por `"unknown"` ou importar do `package.json` |
| 30 | **Configuração do `auditPlugin` em `lib/audit/audit-plugin.ts` conflita com `modules/audit/`** | 🟡 organização | O plugin importa `AuditService` + tipos de `modules/audit/`. Inverter dependência: plugin Elysia em `src/plugins/audit/` pode importar do módulo, mas não existir dentro de `lib/` |

#### Débitos descobertos no Bloco 3 da Fase 1 (2026-04-21) — Auth

| # | Débito | Severidade | Ação sugerida |
|---|---|---|---|
| 31 | ~~8 de 9 hooks de audit no Better Auth sem `.catch()`~~ | — | **Reavaliado — não é débito.** Mesma razão do #22: `AuditService.log()` tem silent catch interno. Todos os hooks de `auth.ts` chamam `AuditService.log()` via helpers (`auditUserCreate`, `auditLogin`, etc.) — erros são logados sem propagar. O `.catch()` em `afterCreateOrganization` é redundante (defensivo mas não necessário). **Consistência de estilo** pode virar débito leve separado — ver #31-revisado abaixo |
| 32 | **Rate limit do Better Auth em `storage: "memory"`** | 🟡 hardening | **Validado via context7/Better Auth docs**: solução 1-linha — trocar para `storage: "database"` + `modelName: "rateLimit"` (Better Auth cria tabela automaticamente) OU `storage: "secondary-storage"` com Redis. Feature built-in, **zero código custom**. Migrar quando escalar horizontalmente ou se rate limit for crítico para SOC2 |
| 33 | **Macro `auth.resolve` chama `auth.api.getSession` em toda request autenticada** | 🟡 performance | Cookie cache de 5min já ajuda (`session.cookieCache`). Validar se está funcionando. Para API keys, `auth.api.verifyApiKey` é chamado todo request — validar cache |
| 34 | **`auth-plugin.ts` define `NoActiveOrganizationError`, `AdminRequiredError`, `SuperAdminRequiredError` inline** | 🟢 organização | Mover para `lib/errors/auth-errors.ts` para consistência com hierarquia AppError |
| 35 | **`validatePasswordComplexity` usa `APIError` do Better Auth, não `AppError` do projeto** | 🟢 organização | Better Auth prefere `APIError` dele nos hooks (correto). Mas manter `AppError` consistente fora desse contexto. Documentar a convenção |
| 36 | **API key sem log explícito de falha de auth** (UnauthorizedError thrown silently) | 🟡 segurança | Brute-force / credential stuffing difícil de detectar sem log. Adicionar log explícito em `UnauthorizedError` no macro `auth` (auth-plugin.ts:224) com IP + path — NÃO logar a chave |
| 37 | **Password complexity sem check contra common passwords** | 🟢 nice-to-have | Better Auth não tem plugin pronto para isso. `haveibeenpwned` API ou lista k-anonymity em `validatePasswordComplexity` — baixa prioridade |
| 38 | **`lib/auth.ts` com 24KB** concentra: config Better Auth + 9 helpers de audit + `getAdminEmails` + `validateUniqueRole` + tipos + hooks de DB + plugins | 🟡 qualidade/organização | Arquivo grande com múltiplos concerns dificulta manutenção. Quebrar em: `lib/auth/config.ts` (instância Better Auth), `lib/auth/audit-helpers.ts` (helpers de audit), `lib/auth/validators.ts` (validateUniqueRole, getAdminEmails), `lib/auth/hooks.ts` (databaseHooks + organizationHooks). Manter `lib/auth.ts` como re-export |
| 39 | **Inconsistência de estilo em hooks de audit** | 🟢 qualidade | `afterCreateOrganization` usa `.catch()` defensivo (redundante mas explícito); demais hooks usam `await` direto. Padronizar um estilo. Como `AuditService.log()` já tem silent catch, **remover os `.catch()` redundantes** é mais limpo |
| 40 | **Uso de `as any` em `auth-plugin.ts`** 3x e em vários arquivos | 🟡 qualidade | `auth.api as any` para acessar `hasPermission` e `verifyApiKey` (typing limitation do Better Auth). Documentar com comentário do motivo (já feito) mas avaliar extension de tipo (ambient .d.ts) |
| 41 | **Audit de qualidade geral**: vários arquivos usam `process.env.NODE_ENV` direto em vez de importar de `@/env` | 🟢 consistência | Centralizar via `env.ts` (ver débitos #14-19 sobre env.ts em si) |

#### Débitos de qualidade — revisão retroativa dos Blocos 1-3 (2026-04-21)

Dimensão "Qualidade da implementação" adicionada à metodologia após o Bloco 3. Esta tabela registra débitos de qualidade encontrados nos arquivos já auditados mas não destacados antes.

**Bloco 1 (Bootstrap + env):**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 42 | **`src/index.ts` encadeia 16 `.use()`** linearmente sem agrupamento semântico | 🟢 legibilidade | Comentários de bloco separando: plugins globais de infra (errorPlugin, loggerPlugin, healthPlugin), middleware HTTP (cors, rateLimit), auth (betterAuth), docs (openapi), jobs (cronPlugin), controllers. Ou extrair para função `registerControllers(app)` quando houver `src/routes/v1/` |
| 43 | **`src/index.ts:60-64`** — config `serve.maxRequestBodySize` hardcoded | 🟢 qualidade | Extrair constante nomeada (ex: `const MAX_BODY_SIZE_MB = 10`) ou puxar de env para configurabilidade |

**Bloco 2 (lib/):**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 44 | **`lib/errors/error-plugin.ts::formatErrorDetail`** é recursivo sem limite de profundidade | 🟡 robustez | Se `error.cause` for cíclico ou muito profundo, causa stack overflow ou logs enormes. Adicionar contador de profundidade com max (ex: 5) |
| 45 | **`lib/responses/response.types.ts`** tem 7 schemas de erro quase idênticos (unauthorized, forbidden, notFound, conflict, internal, badRequest, validation) | 🟢 qualidade/duplicação | Avocado-hp usa factory `errorSchema(code: string)` que elimina a duplicação. Migrar para factory pattern |
| 46 | **`lib/cron-plugin.ts`** hardcoda 7 jobs com `.use(cron({...}))` encadeado, cada um repetindo mesma estrutura (`async run() { ... logger.info(...) }`) | 🟢 duplicação | Array declarativo de configs + loop `.use(cron(config))` ou helper `createCronJob({ name, pattern, handler })` que já inclui logger pattern |
| 47 | **`lib/crypto/pii.ts`** — `encrypt` retorna `string` e `decrypt` espera `string` — tipo não diferencia plaintext de ciphertext | 🟢 type safety | Branded type `type EncryptedString = string & { __brand: 'encrypted' }` para forçar que apenas retorno de `encrypt` seja aceito em `decrypt`. Nice-to-have |
| 48 | **`lib/errors/error-plugin.ts`** — função `formatValidationErrors` usa cast inseguro `err as ElysiaValidationError` | 🟢 type safety | Usar type guard ou schema Zod para parse defensivo |

**Bloco 3 (Auth):**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 49 | **`lib/auth-plugin.ts` com 369 linhas** concentra: macro definition, resolvers, 7 funções helper de validação, OpenAPI enhancement (enhanceAuthProperties + addValidationsToComponents + addValidationsToPaths), exportação OpenAPI | 🟡 organização/qualidade | Dividir em: `lib/auth/plugin.ts` (só o Elysia macro), `lib/auth/validators.ts` (helpers de role/permission/subscription), `lib/auth/openapi-enhance.ts` (enhancements do OpenAPI do Better Auth). Pode ir junto com #38 no refactor de auth |
| 50 | **`lib/permissions.ts`** — duplicação massiva entre `orgRoles` (owner/manager/supervisor/viewer) — owner e manager têm 20+ linhas quase idênticas | 🟡 duplicação | Helper `inheritRole(baseRole, overrides)` que recebe um role base e sobrescreve só as diferenças. Ex: `manager: inheritRole(owner, { organization: ["read", "update"], member: ["create", "read"], ... })`. Reduz ~80 linhas |
| 51 | **`lib/auth.ts`** — 9 helpers `auditXxx` quase idênticos (auditUserCreate, auditLogin, auditOrganizationCreate, ..., auditInvitationAccept) | 🟡 duplicação | Generalizar em `buildAuditEntry(action, resource, resourceId, userId, organizationId?, changes?)` ou manter helpers mas extrair para `lib/auth/audit-helpers.ts` (alinhado com #38) |
| 52 | **`lib/auth.ts` — `afterCreateOrganization`** usa dynamic import para `OrganizationService` (linha 651-653) | 🟡 investigar | Mesmo padrão suspeito do cron-plugin (#28). Investigar se há dep circular `auth.ts ↔ OrganizationService` e resolver se possível |
| 53 | **`lib/auth-plugin.ts::resolveApiKeyOrgContext`** faz `auth.api.verifyApiKey` a cada request com API key | 🟡 performance | Sem cache — toda request com `x-api-key` verifica no DB (via Better Auth). Para cliente consumindo Power BI, isso pode ser muitos queries redundantes. Cache simples por TTL curto (30s) pode ajudar. Validar no Bloco 4 (api-keys) se há cache built-in |

#### Débitos descobertos no Bloco 4 da Fase 1 (2026-04-21) — Módulos críticos

**Webhook Pagar.me** (`modules/payments/webhook/`):

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 54 | **API keys não auditam operações admin** | 🔴 compliance | `api-key.service.ts` NÃO chama `AuditService.log()` em create/revoke/delete. Operações administrativas sensíveis (criar credencial, revogar, apagar) **sem audit trail**. Adicionar audit em todas 3 operações com `resource: "api_key"`, capturing createdBy/prefix (nunca a key). Risco LGPD + SOC2 |
| 55 | **Sem retention policy definida para audit logs** | 🟡 compliance | CLAUDE.md do audit não define quanto tempo logs são mantidos. LGPD pede retention justificada. Definir política (ex: 5 anos para eventos de segurança, 2 anos para CRUD operacional) e implementar jobs de pruning |
| 56 | **Webhook usa Basic Auth em vez de HMAC signature** | 🟡 segurança | **Validado via WebSearch**: HMAC-SHA256 é o padrão usado por Stripe, GitHub, CircleCI, Shopify, Okta em 2026. Basic Auth é inferior porque: (1) credential estática trafega a cada request; (2) não detecta tampering do body; (3) rotação requer coordenação. Implementação atual tem timing-safe compare correto (webhook.service.ts:139-172), mas o modelo é fraco. **Ação**: consultar docs oficiais do Pagar.me v5 (em docs.pagar.me) para confirmar se suporta HMAC — alguns provedores BR ainda ficaram em Basic Auth. Se sim, migrar; se não, manter + restringir por IP allowlist (defesa adicional) |
| 57 | **`_rawBody` em `WebhookService.process`** passed mas não usado para verificação | 🟢 código morto ou bug | `webhook.service.ts:76` — underscore indica intenção abandonada. Ou remover parâmetro, ou usar para verificação HMAC (#56). Provavelmente relacionado a HMAC incompleto |
| 58 | **Webhook silencia quando metadata ausente** | 🟡 robustez | `handleChargePaid`, `handleChargeFailed`, `handleSubscriptionCreated` retornam silently se `data.metadata?.organization_id` não existe. Webhook crítico deveria logar WARN com payload para investigação posterior. `handleSubscriptionCreated` faz isso ✅; os demais não |

**API Keys** (`modules/admin/api-keys/`):

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 59 | **Listagem sem paginação** | 🟡 performance/DoS | `ApiKeyService.list()` retorna TODAS as keys (sem limit/offset). Com 1 cliente hoje OK, mas com N clientes e M keys cada, vira DoS via query pesada. Better Auth `listApiKeys` não tem paginação nativa — implementar via filter ou fetch + slice |
| 60 | **Rate limit por key inconsistente entre service e plugin** | 🟢 documentação | `api-key.service.ts:34` diz `rateLimitMax: 100`; `lib/auth.ts:848` diz `maxRequests: 200`. CLAUDE.md do api-keys explica "200 para compensar dupla verificação". Documentar a intenção explicitamente ou unificar |
| 61 | **`isBetterAuthNotFound` helper repetido em cada método** | 🟢 duplicação | `api-key.service.ts` tem 3 métodos (getById, revoke, delete) com try/catch quase idêntico só para mapear 404 do Better Auth. Extrair wrapper genérico: `handleBetterAuthNotFound(keyId, fn)` |

**Public** (`modules/public/`):

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 62 | **Newsletter revela existência de email** | 🟡 privacidade/enumeration | CLAUDE.md: "Email duplicado ativo → ConflictError (409)". Isso permite enumerar emails inscritos (enumeration attack). Retornar **mesmo response** em ambos os casos (sucesso vs duplicado) — lado servidor faz a distinção silenciosamente |
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
| 70 | **Email hardcoded `"contato@synnerdata.com.br"`** em `sendContactEmail` | 🟡 qualidade | Destinatário de email de contato deveria estar em env var (`CONTACT_EMAIL`). Hoje hardcoded dificulta mudança sem deploy |
| 71 | **`sendAdminCancellationNoticeEmail` usa `env.SMTP_USER` como destinatário admin** | 🟡 qualidade | Admin notification vai para o usuário SMTP (se definido) — feature flag implícita. Deveria ter `ADMIN_NOTIFICATION_EMAIL` dedicado no env, independente de `SMTP_USER` |
| 72 | **`roleLabels` em `src/emails/constants.ts`** duplica nomes de roles | 🟢 duplicação | roles (owner, manager, supervisor, viewer) também estão em `lib/permissions.ts`. Criar `lib/permissions/role-labels.ts` (ou similar) e importar dos dois lugares |
| 73 | **Transporter condicional `env.SMTP_USER && env.SMTP_PASSWORD`** | 🟡 robustez | Em dev com MailHog (sem auth) funciona. Em prod, se alguém esquecer de setar as vars, o transporter inicializa sem auth → SMTP provavelmente rejeita → emails falham silenciosamente (já não propaga erro — ver débitos #74). Ligado a #15 (refine condicional em prod) |
| 74 | **Falhas de email não são propagadas** | 🟡 observabilidade | `lib/auth.ts:53-69` tem `handleWelcomeEmail` com try/catch que só loga. `sendEmail` em si não tem catch — erro propaga. Inconsistência: alguns callers capturam silently, outros deixam subir. Documentar política ("email é best-effort em X contextos, crítico em Y"). Related: #5.2 #5 (jobs assíncronos) |
| 75 | **Templates carregam React + React Email** — bundle size em produção | 🟢 performance | Com 19 templates + 5 components, o bundle tem React completo só para servir emails. Medir impacto após primeiro deploy de produção. Tree-shaking deve ajudar; não é prioridade |

#### Débitos descobertos no Bloco 6 da Fase 1 (2026-04-21) — CI/CD e Deploy

**CI workflows (.github/workflows/):**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 76 | **`bun pm audit` ausente** em todos os workflows e scripts do package.json | 🟡 supply chain | Adicionar `bun pm audit --audit-level=high` como step no lint.yml — bloqueia PR com CVE HIGH/CRITICAL. Atualizar README para refletir realidade (hoje afirma que existe) |
| 77 | **`SKIP_INTEGRATION_TESTS: "true"`** em test.yml | 🟡 cobertura | Validar semântica: o flag pula integration tests no CI? Se sim, integration não roda e cobertura é falsa. Documentar intenção ou remover flag. CLAUDE.md não menciona |
| 78 | **Playwright E2E não está em nenhum workflow** | 🟡 cobertura | `test:e2e` existe em `package.json` mas não é executado em CI. Adicionar workflow separado (ou step em test.yml) — ao menos no schedule diário. E2E é a camada que detecta regressões de UX/integração completas |
| 79 | **Build workflow não faz smoke test** | 🟡 qualidade | `build.yml:27-28` só verifica `test -f ./dist/index.js`. Um bundle pode existir mas falhar no startup. Adicionar step: `timeout 10 bun run dist/index.js || [ $? -eq 124 ]` (expect timeout, não erro) |
| 80 | **Sem cache de `bun install`** em todos workflows | 🟢 performance CI | Cada run baixa deps do zero. `setup-bun@v2` tem cache nativo — ativar com `cache: true` ou `actions/cache`. Reduz CI time |
| 81 | **`lint.yml` roda `bun install` sem `--frozen-lockfile`** | 🟡 reprodutibilidade | Se alguém alterar lockfile em PR sem notar, CI instala mas não pega. Adicionar flag para consistência com Dockerfile |
| 82 | **Trivy scaneia imagem, não filesystem** | 🟡 cobertura | `security.yml` só faz image scan. Fazer scan FS também com `trivy fs .` (secrets em histórico git, misconfigs em IaC, vulnerabilidades em deps não-Docker) |
| 83 | **Trivy severity `CRITICAL,HIGH` ignora MEDIUM** | 🟢 cobertura | Pode deixar MEDIUM real passar. Considerar incluir `MEDIUM` quando volume for gerenciável |
| 84 | **Sem scan de secrets em histórico git** (gitleaks/trufflehog) | 🟡 segurança | `secretlint` é local (pre-commit via husky). Se alguém commitou secret e depois removeu, continua no histórico. Adicionar `gitleaks` ou `trufflehog` ao security.yml |
| 85 | **Sem SBOM (Software Bill of Materials)** | 🟡 compliance | SOC2 e supply chain em 2026 esperam SBOM. Trivy pode gerar via `trivy sbom`. Adicionar como artifact do build |
| 86 | **Sem coverage reporting** | 🟢 qualidade | `bun test --coverage` existe (`test:coverage` no package.json) mas não roda no CI. Para code review, saber que 70% do código tem testes é informação crítica. Subir pro Codecov/coveralls |

**Dockerfile:**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 87 | **Base image `oven/bun:1-alpine` sem pin de SHA** | 🟡 supply chain | Tag `1-alpine` muda. Em scan reprodutível, pinar como `oven/bun:1-alpine@sha256:<digest>` e atualizar via Dependabot. Trade-off: mais manual, mais seguro |
| 88 | **HEALTHCHECK só chama `/health/live`** | 🟡 robustez | Liveness não detecta DB morto. Considerar trocar para `/health` (deep check) com `--retries=10` — se DB down, container marcado unhealthy, Coolify reinicia |

**Entrypoint e runtime:**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 89 | **Migrations rodam a cada startup sem wait-for-db** | 🟡 robustez | Se Postgres não está pronto quando container sobe, `bun run src/db/migrate.ts` falha e container morre. Adicionar `wait-for-it.sh` ou loop simples: `until pg_isready -h $DB_HOST; do sleep 1; done` antes do migrate |
| 90 | **Sem estratégia de migration em scale** | 🟢 escala | Múltiplas instâncias subindo simultaneamente podem ter race condition em migration. Drizzle é idempotente mas locks podem travar. Em escala: migration em job one-shot separado (Kubernetes Job ou script pré-deploy) |
| 91 | **Sem rollback de migration** | 🟢 robustez | Se migration tem bug, deploy fica preso. Documentar processo de rollback (reset de `__drizzle_migrations` + checkout de commit anterior + redeploy) em runbook |

**Deploy e observabilidade de produção:**

| # | Débito | Severidade | Ação |
|---|---|---|---|
| 92 | **Backup policy do Postgres gerenciado pelo Coolify não está documentada no repo** | 🟡 compliance | LGPD/SOC2 esperam retention documentada. Validar na UI do Coolify: frequência de backup, retention, teste de restore periódico. Documentar em runbook (`docs/runbooks/database-backup.md`) |
| 93 | **Sem runbook de oncall/incidente** | 🟢 maturidade | Onde procurar quando algo quebra 3h da manhã? Criar `docs/runbooks/` com: DB down, webhook Pagar.me falhando, SMTP caído, Sentry recebendo 5xx em massa |
| 94 | **Version do projeto em `package.json:3` (`1.0.50`) é manual** | 🟢 qualidade DX | Sem semantic-release ou similar — dev precisa bumpar manualmente. Para lib/app com release frequente, considerar automation. Não crítico agora |
| 95 | **Em `test.yml`, secrets Pagar.me/Auth expostos no `env` do job inteiro** | 🟡 segurança CI | Todos os steps enxergam `PAGARME_SECRET_KEY` etc. Deveria ser escopado só ao step de teste, ou usar `secrets` inherit em actions filhas. Baixo risco (GitHub já protege logs), mas princípio de menor privilégio |
| 96 | **Convenção inconsistente de `changes` em audit logs + reads sensíveis sem audit** | 🔴 compliance LGPD | Schema suporta `{ before, after }` mas apenas parte dos call-sites de mutation preenchem. Reads em dados sensíveis (Art. 11 LGPD — atestados médicos, CPF, salário, processos trabalhistas) não geram audit entry. Endereçar via CP-42 (convenção before/after + tratamento de PII) e CP-43 (audit de reads em GET handlers de recursos sensíveis) |

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

## 8. Changelog

Registro temporal das decisões e entregas desta iniciativa. **Toda atualização do documento deve adicionar uma entrada aqui** (data ISO + resumo).

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

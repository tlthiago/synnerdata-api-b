# Open Questions — a discutir depois

> Perguntas estratégicas surgidas durante code reviews que **não são** sobre qualidade de implementação, mas sobre decisões de produto/arquitetura que precisam de alinhamento antes de virar CP ou MP.
>
> **Regra**: qualquer pergunta aqui que tenha resposta vira (a) entry em `changelog.md` se for decisão registrada, OU (b) débito em `debts.md` se virar trabalho. **Não deixar apodrecer.**

---

## Índice (por status)

**📌 Rastreadas em GitHub issues** (decisão adiada com contexto preservado):
- OQ-1 → Issue #273 (PII strategy)
- OQ-4 → Issue #278 (Timeout.withTimeout scaffolding)
- OQ-9 → Issue #274 (CNPJ alfanumérico)
- OQ-10 → Issue #279 (retry jitter preventive)
- OQ-12/OQ-13 → Issue #275 (x-error-messages shape)

**✅ Resolvidas** (decisão tomada, ação registrada):
- OQ-2 (orgStatements dead resources) — keep, inventário documental
- OQ-3 (fire-and-forget em org effects) — try/catch await uniformizado + Sentry alerts (commit `b973dfd`)
- OQ-5 (apiKey.rateLimit magic number) — keep hardcoded, CLAUDE.md já documenta
- OQ-6 (super_admin vs admin idênticos) — intencional, distinção em allowlists + UI
- OQ-7 (RateLimitedError) — keep scaffolding (PR #271 decidido)
- OQ-8 (passwordComplexityRules export) — removed (commit `b4c5204`)
- OQ-11 (deleteUser custom endpoint) — keep self-reference, revisitar quando iniciativa "delete account robusto" for priorizada
- OQ-14 (política de erro em emails) — 2 classes via `sendBestEffort` (commit `42699a0`)
- OQ-15 (SMTP pool) — Hostinger pool configurado (commit `b4c5204`)

**🎉 Todas as 15 OQs endereçadas** — 5 em issues (revisitar depois), 10 resolvidas.

---

## 2026-04-23

### OQ-1 — Qual é nossa estratégia de proteção de PII em repouso?

**📌 Status**: Decisão adiada. Rastreada em **[issue #273](https://github.com/tlthiago/synnerdata-api-b/issues/273)**. Confirmado que `PII.encrypt/decrypt/mask` tem **zero consumers em produção** — nada está sendo criptografado hoje. Módulo fica dormant até sinal externo (auditoria LGPD, exigência de cliente, incidente).

**Origem**: review de `src/lib/pii.ts` (CP-53).

**Contexto factual**:
- `src/lib/pii.ts` existe, tem 155L de código + 186L de teste, implementação correta (AES-256-GCM + scrypt). Zero consumers em produção.
- `PII_ENCRYPTION_KEY` validada no env, mas nunca usada.
- DB schema `employees` armazena `cpf`, `rg`, `pisPasep`, `ctps`, `salary` em **cleartext**.
- `cpf` tem unique index — encriptar quebra uniqueness (precisaria blind-index pattern).
- Backup está cifrado em trânsito (R2 HTTPS) e em repouso pela Cloudflare (AES-256 automático no R2). DB em si no Coolify VPS: não confirmado se disco é encriptado.
- `modules/audit/pii-redaction.ts` redige PII fields nos audit logs para `<redacted>` (CP-42) — proteção de log, não de armazenamento.
- LGPD Art. 46 exige "medidas de segurança aptas" — não especifica criptografia obrigatória para PII em repouso, mas é uma das medidas reconhecidas.

**Opções**:
1. **Wire-up** `lib/pii.ts` em campos sensíveis — custo L (migration + blind-index para CPF + re-encrypt + performance tuning scrypt→HKDF)
2. **Deletar** `lib/pii.ts`, documentar que proteção é via backup encryption (R2) + access control (organizationId filter + RBAC) — custo S
3. **Manter dormant** (status quo) — custo 0, mas código sem owner rota

**O que precisamos decidir**: vai ter auditoria LGPD formal num horizonte próximo (12 meses)? Algum cliente exigiu contratualmente encryption at rest?

**Ação quando decidido**: virar CP-54 (A ou B). Opção C está explicitamente vetada pelo princípio "não deixar código sem owner".

---

### OQ-2 — `member`, `invitation`, `billingProfile` em `orgStatements` são documentação viva ou futura checagem?

**✅ Status**: Resolvida (2026-04-23). Decisão do dono: **manter como está**. Inventário documental das resources — se alguém expuser endpoint custom de member/invitation/billingProfile no futuro (em vez de depender do BA plugin interno), as declarações estarão prontas para uso via `permissions: {...}` no macro. Não é bug — autorização acontece (via BA internal access control para member/invitation, `requireAdmin` para billingProfile), só não passa pelo macro local.

**Origem**: review de `src/lib/auth/permissions.ts` (CP-53).

**Contexto factual**:
- `orgStatements` declara `member: ["create","read","update","delete"]`, `invitation: ["create","read","cancel"]`, `billingProfile: ["create","read","update"]`.
- Nenhum desses 3 resources é usado em `.macro auth({ permissions: { member: [...] } })` em `src/**` (grep confirmado).
- Better Auth `organization` plugin tem endpoints próprios de member/invitation com access control **interno** (não passa pelo macro `auth` do projeto).
- `billingProfile` vai pelo mesmo caminho (Better Auth billing hooks ou rotas custom em `modules/payments/billing/`).

**Opções**:
1. **Docs viva**: declarar no `orgStatements` mesmo sem uso do macro — serve como inventário central de recursos. Documentar intenção em CLAUDE.md.
2. **Remover**: deletar das statements + das 4 roles + reduzir superfície. Se BA mudar e quisermos migrar checagem para nosso macro, readicionar.

**O que precisamos decidir**: qual é o propósito de `orgStatements`? Inventário documental ou source-of-truth pra macro?

**Ação quando decidido**: fix em CP-55 (permissions cleanup, escopo S se opção 2 / XS se opção 1 + CLAUDE.md).

---

### OQ-3 — `triggerAfterCreateOrganizationEffects` fire-and-forget em side-effects é intencional?

**✅ Status**: Resolvida (2026-04-23, commit `b973dfd`). Decisão do dono: **Opção A + alerta Sentry**. Todos os 3 side-effects (createTrial, createMinimalProfile, auditOrganizationCreate) agora seguem mesmo pattern: `try/catch await + logger.error + ErrorReporter.capture`. Novo helper privado `reportOrgEffectFailure` em hooks.ts emite Sentry event com tags estruturadas (`type`, `organizationId`) para alerting. Usuário nunca trava — caminhos de recuperação manual documentados no JSDoc do helper. **Ação operacional pendente**: configurar alert rule no Sentry dashboard para `tag:type startsWith "organization:" OR "audit:organization"`.

**Origem**: review de `src/lib/auth/hooks.ts` (CP-53).

**Contexto factual**:
- Após criar organization, o hook dispara 3 side-effects:
  - `createTrial` — via `try/catch await` (bloqueia resposta)
  - `createMinimalProfile` — via `.catch()` fire-and-forget (não bloqueia, erro só loga)
  - `auditOrganizationCreate` — via `.catch()` fire-and-forget
- Inconsistência: trial é gating (usuário espera criar org), mas profile e audit são background. Se `createMinimalProfile` falhar, org fica sem profile — rota `GET /organizations/profile` retorna null silenciosamente. Se `auditOrganizationCreate` falhar, audit trail perdido.
- Nenhuma queue externa — se o processo morrer entre a resposta e a execução do `.catch`, órfão.

**Opções**:
1. **Uniformizar para `try/catch await`** — latência aceita, garantia de consistência.
2. **Uniformizar para `Promise.allSettled` após try** — paralelismo + logging por erro individual.
3. **Adicionar dead-letter queue** (Redis + BullMQ — MP-4) — infra maior.
4. **Status quo documentado** — aceitar trade-off, mas precisa docs explícitas + alert em Sentry se falhar.

**O que precisamos decidir**: consistência vs latência no signup flow. Qual é a SLA de audit trail?

**Ação quando decidido**: parte do CP-56 (auth/hooks.ts cleanup batch).

---

### OQ-4 — Algo em PR/branch não-merged usa `Timeout.withTimeout` antes de deletar?

**📌 Status**: Rastreada em **[issue #278](https://github.com/tlthiago/synnerdata-api-b/issues/278)** (2026-04-23). Decisão do dono: criar issue pra revisitar depois. Manter como scaffolding hoje. Issue lista triggers que devem trazer a decisão de volta ao radar.

**Origem**: review de `src/lib/utils/timeout.ts` (CP-53).

**Contexto factual**:
- `Timeout.withTimeout` tem zero consumers em código de produção (ripgrep confirmado em `main`, `preview`).
- 71L de código + 108L de testes órfãos.
- `PagarmeClient` usa `AbortSignal.timeout()` nativo com `PagarmeTimeoutError` próprio — não usa essa utility.
- Padrão moderno é `AbortSignal.timeout()` (Node 17+/Bun) que cancela a operação no timeout, enquanto o wrapper atual só rejeita o Promise.race (fn continua rodando — leak).

**Opções**:
1. **Deletar** arquivo + testes. Se voltar a precisar, reintroduzir com `AbortSignal`-first API.
2. **Manter** como scaffolding pra algum caso de uso previsto.

**O que precisamos decidir**: há feature branch/PR aberto que planeja usar? Algum requisito próximo (ex: timeout para webhook handlers) que justifique manter?

**Ação quando decidido**: parte do CP-55 (dead code sweep, escopo S).

---

### OQ-5 — `apiKey.rateLimit.maxRequests: 200/min` deveria ser documentado ou parametrizado por env?

**✅ Status**: Resolvida (2026-04-23). Decisão do dono: **manter hardcoded**. CLAUDE.md de api-keys já documenta o motivo (compensação por dupla verificação). Reavaliar se houver demanda por limit diferente por cliente/env.

**Origem**: review de `src/lib/auth.ts` (CP-53).

**Contexto factual**:
- `lib/auth.ts` tem `apiKey({ rateLimit: { maxRequests: 200 } })`.
- Rate limit global é 100 req/min (em `src/index.ts`).
- Better Auth rules pra endpoints de auth (sign-in, sign-up, forgot-password) são mais rigorosas (3-5 req/min).
- `api-key.service.ts:34` diz `rateLimitMax: 100` (metadata do key); `lib/auth.ts` plugin diz 200.
- CLAUDE.md de api-keys explica: "200 para compensar dupla verificação do rate limit quando requests passam pelo global AND pelo API key" — mas número mágico sem justificativa granular no código.

**Opções**:
1. **Documentar** no código (comment + CLAUDE.md já existe) — status quo.
2. **Parametrizar por env** (`API_KEY_RATE_LIMIT_PER_MINUTE=200`) — flexibilidade pra clientes diferentes.
3. **Parametrizar por key** (campo no DB) — granularidade máxima.

**O que precisamos decidir**: precisamos ajustar esse número por cliente/env? Ou 200 é razoável pra sempre?

**Ação quando decidido**: CP pequeno. Hoje é `S` para extrair constante, `M` se virar env, `L` se virar campo DB.

---

### OQ-6 — `super_admin` e `admin` em `systemRoles` são idênticos. Intencional?

**✅ Status**: Resolvida (2026-04-23). Decisão do dono: **intencional, manter**. Distinção vive em allowlists `SUPER_ADMIN_EMAILS` vs `ADMIN_EMAILS` + UI/rótulos, não em access control. Nenhuma mudança de código necessária.

**Origem**: review de `src/lib/auth/permissions.ts` (CP-53).

**Contexto factual**:
- `systemRoles.super_admin` e `systemRoles.admin` têm **exatamente** as mesmas permissões (`...adminAc.statements, plan: ["create","read","update","delete","sync"]`).
- Distinção existe em outro lugar: `adminRoles` const (allowlist de roles admin), lógica de UI, `getAdminEmails()` em `admin-helpers.ts` separa `SUPER_ADMIN_EMAILS` de `ADMIN_EMAILS`.
- Hoje, do ponto de vista de access control, `admin` pode fazer tudo que `super_admin` pode.

**Opções**:
1. **Intencional** — distinção é só organizacional (quem criou, quem é billable, etc.). Documentar em CLAUDE.md.
2. **Restringir `admin`** — ex: admin não pode criar/deletar plans, só ler.
3. **Consolidar em `admin` único** — se não há diferença prática, simplificar.

**O que precisamos decidir**: existe ação que `super_admin` pode mas `admin` não? Se sim, isso deveria estar no access control.

**Ação quando decidido**: CP pequeno (S — documentar) ou M (restringir permissões + auditar impact).

---

### OQ-7 — Quando rate-limiting for wired, `RateLimitedError` carrega `retryAfter` como `details` ou campo first-class?

**✅ Status**: Resolvida no PR #271 (2026-04-23). Decisão: manter `RateLimitedError` como scaffolding da hierarquia HTTP completa, independente de estar em uso. Shape de `retryAfter` será decidido quando rate-limit próprio for wired (não hoje).

**Origem**: review de `src/lib/errors/http-errors.ts` (CP-53).

**Contexto factual**:
- `RateLimitedError` existe em `http-errors.ts` mas tem **zero throws** no codebase.
- Rate limit atual é `elysia-rate-limit` plugin (responde 429 direto, não lança `RateLimitedError`) + rate limit interno do Better Auth (também responde sem passar por nossos errors).
- Convenção HTTP: resposta 429 deve incluir header `Retry-After`.

**Opções**:
1. **Deletar** `RateLimitedError` (dead code, YAGNI) e reintroduzir só quando wiring explícito do rate-limit pelo nosso error handling acontecer.
2. **Manter** como scaffolding e pré-definir shape com `details: { retryAfterSeconds: number }`.
3. **Manter** com `retryAfter` como campo first-class na classe.

**O que precisamos decidir**: rate-limiting próprio (fora de plugins) vai ser adicionado? Prazo?

**Ação quando decidido**: CP-55 (dead code sweep) se opção 1; postpone se 2/3.

---

### OQ-8 — `passwordComplexityRules` export é consumido por FE/OpenAPI?

**✅ Status**: Resolvida (2026-04-23, commit `b4c5204`). Decisão: **FE não deve depender de const interna do back**. Se futuramente FE precisar das regras dinamicamente, criar endpoint dedicado (ex: `GET /v1/auth/password-rules`). `export` removido — `passwordComplexityRules` agora é const privada.

**Origem**: review de `src/lib/auth/password-complexity.ts` (CP-53).

**Contexto factual**:
- `passwordComplexityRules` é exportado do arquivo.
- Nenhum consumer em `src/**` (ripgrep confirmado).
- Se exportado, poderia ser consumido por FE pra mostrar checklist de regras conforme usuário digita senha (UX).

**Opções**:
1. **Expor pro FE** via endpoint `GET /v1/auth/password-rules` → FE pode mostrar checklist dinâmico.
2. **Duplicar no FE** (hardcoded) — inconsistência risk mas sem coupling.
3. **Remover `export`** — reduzir superfície API.

**O que precisamos decidir**: FE quer reflectir regras dinamicamente ou mantém hardcoded?

**Ação quando decidido**: S (endpoint novo) ou S (remover export).

---

### OQ-9 — Cliente tem CNPJ alfanumérico pós-julho/2026 no horizonte?

**📌 Status**: Rastreada em **[issue #274](https://github.com/tlthiago/synnerdata-api-b/issues/274)** (2026-04-23). Decisão adiada até sinal concreto — cliente atual com CNPJ novo ou pipeline de clientes novos pós-jul/2026. Contexto preservado + plano de fix na issue.

**Origem**: review de `src/lib/document-validators.ts` (CP-53).

**Contexto factual**:
- Receita Federal (IN RFB 2229/2024) começa a emitir CNPJ alfanumérico (letras A-Z nos 12 primeiros chars) em **julho/2026**.
- Check digits permanecem numéricos; algoritmo pode ser estendido.
- Regex atual (`[^\d]` → `replace`) descarta letras silenciosamente; `length !== 14` rejeita CNPJs alfanuméricos.
- Impacto: quando chegar o primeiro CNPJ novo, cliente não consegue cadastrar a empresa.

**Opções**:
1. **Implementar suporte agora** — proativo, sem pressão de prazo. M.
2. **Tracking issue + implementar em Q2/2026** — quando o volume começar a aumentar.
3. **Esperar primeira falha** — reativo, risco de bloqueio no dia D.

**O que precisamos decidir**: cliente atual tem chance de ter CNPJ novo? Novos clientes no pipeline?

**Ação quando decidido**: CP-57 (candidato, M) com plano: regex `[^A-Z0-9]`, charCode - 48 estendido pra letras, dual-mode legacy + alphanumeric.

---

### OQ-10 — Jitter default=true em `retry.ts` quebra determinismo dos testes existentes?

**📌 Status**: Rastreada em **[issue #279](https://github.com/tlthiago/synnerdata-api-b/issues/279)** (2026-04-23). Decisão do dono: criar issue para entender melhor depois. Não adicionar agora — preventivo para problema não-observado. Issue lista triggers (crescimento de base, sinal Sentry de 429 cascata, migração BullMQ) que devem trazer a decisão de volta ao radar.

**Origem**: review de `src/lib/utils/retry.ts` (CP-53).

**Contexto factual**:
- `retry.test.ts` tem 253L com asserções de timing (`expect(elapsedMs).toBeGreaterThan(Nms)`, `toBeLessThan(Mms)`).
- Adicionar jitter (random delay dentro do intervalo computado) faz bounds ficarem mais largos e testes flaky-prone.
- 8 consumers internos de `Retry.withRetry` — todos usam config padrão.

**Opções**:
1. **Default `jitter: true`** (alinha com AWS/p-retry best practice) + atualizar tests pra aceitar bounds mais largos.
2. **Default `jitter: false`** (preserva tests) — dev ativa explicitamente quando precisa.
3. **Default `jitter: true`** + usar fake timers nos tests (bun:test suporta via mock).

**O que precisamos decidir**: tests timing-based é padrão aceitável ou vale migrar pra fake timers?

**Ação quando decidido**: parte do CP-58 (retry.ts enhancements, M).

---

### OQ-11 — `deleteUser` via BA (`auth.api.deleteOrganization` self-reference em `lib/auth.ts`) deveria mover pra endpoint custom em `modules/auth/`?

**✅ Status**: Resolvida (2026-04-23). Decisão do dono: **manter como está**. Refactor só faz sentido junto com iniciativa "delete account robusto" (memória do projeto) que envolve grace period, soft delete e tratamento de membros. Prematuro mexer isolado.

**Origem**: review de `src/lib/auth.ts` (CP-53).

**Contexto factual**:
- `lib/auth.ts::user.deleteUser.beforeDelete` chama `auth.api.deleteOrganization` — self-reference no mesmo módulo que define `auth`.
- Funciona por hoisting do `const auth`, mas é o único self-ref no arquivo.
- Alternativa: desabilitar `deleteUser.enabled` do BA, criar endpoint custom `DELETE /v1/users/me` em `modules/auth/` que chame `auth.api.deleteUser` + `auth.api.deleteOrganization` em sequência controlada.
- Memória do projeto: "delete account robusto" está pendente (ver `project_delete-account-robust.md`).

**Opções**:
1. **Manter** self-ref com comentário documentando (mais simples).
2. **Mover** para endpoint custom em `modules/auth/` (alinha com iniciativa "delete account robusto" + elimina self-ref).
3. **Esperar** iniciativa "delete account robusto" decidir.

**O que precisamos decidir**: iniciativa de delete account robusto vai redesenhar o fluxo? Prazo?

**Ação quando decidido**: parte da iniciativa maior (não CP isolado), ou S se mantiver.

---

### OQ-12 — FE espera `x-error-messages` com chaves semânticas ou Zod-internal?

**📌 Status**: Rastreada em **[issue #275](https://github.com/tlthiago/synnerdata-api-b/issues/275)** (2026-04-23). Confirmado que funciona hoje, CP-53 Fase 2 não alterou comportamento. Decisão adiada até pesquisa com FE sobre shape esperado.

**Origem**: review de `src/lib/openapi-helpers.ts` + `plugins/auth-guard/openapi-enhance.ts` (CP-53).

**Contexto factual**:
- `openapi-helpers.ts::extractErrorMessages` produz chaves **Zod-internal**: `"string_format:email"`, `"greater_than"`, `"min_length"`.
- `plugins/auth-guard/openapi-enhance.ts` (do Better Auth) produz chaves **semânticas**: `email`, `minLength`, `min`.
- OpenAPI spec consumida pelo FE recebe `x-error-messages` com shapes diferentes dependendo se a rota é do BA ou do projeto.
- Se FE trata esse campo (i18n dinâmico, error messages amigáveis), o bug é invisível até FE tentar parsear.

**Opções**:
1. **Padronizar em chaves semânticas** (`email`, `minLength`) — adotar convenção do BA nas nossas rotas.
2. **Padronizar em Zod-internal** (`string_format:email`) — adotar convenção local nas rotas do BA (precisa patch no enhance).
3. **Documentar ambos shapes** e FE trata dual.

**O que precisamos decidir**: qual shape FE de fato espera? Consulta ao time FE.

**Ação quando decidido**: CP-59 (M, candidato) pra unificar. Destrava OQ-13.

---

### OQ-13 — Vale migrar pra `.meta({ errorMessages })` explícito nos schemas, deprecando extração por reflection?

**📌 Status**: Consolidada em **[issue #275](https://github.com/tlthiago/synnerdata-api-b/issues/275)** junto com OQ-12 (2026-04-23). Opção B do fix de unificação. Decidir em conjunto quando OQ-12 for resolvida.

**Origem**: review de `src/lib/openapi-helpers.ts` (CP-53).

**Contexto factual**:
- Hoje `extractErrorMessages` walks Zod v4 internals (`zodDef.checks[]._zod.def`) — API privada, frágil em upgrades.
- Zod v4 tem `.meta({ ... })` público pra anotação customizada — `toJSONSchema` preserva como `x-*` fields.
- Migração: adicionar `.meta({ errorMessages: { email: "..." } })` em cada schema com mensagens customizadas, `extractErrorMessages` lê de `.meta()` em vez de reflection.
- Escopo: dezenas de schemas em `src/modules/**/*.model.ts` que usam `.email("mensagem")`, `.min(3, "mensagem")`, etc.

**Opções**:
1. **Migrar** — mais robusto, menos frágil em upgrade de Zod. Esforço L (muitos schemas).
2. **Status quo** — aceitar fragilidade, revisar em cada upgrade minor de Zod.
3. **Híbrido** — schemas novos usam `.meta()`, legados ficam na reflection.

**O que precisamos decidir**: upgrade de Zod é evento frequente? Vale o esforço L?

**Ação quando decidido**: CP-60 (candidato, L) se migração completa.

---

### OQ-14 — Política de erro em emails: throw em críticos (verification/passwordReset), log-e-engole em notificações (admin/cancel)?

**✅ Status**: Resolvida (2026-04-23, commit `42699a0`). Decisão do dono: aplicar política de 2 classes para consistência e UX. **Críticos** (user-initiated com feedback síncrono: verification, reset, 2FA, invitation, contact, admin checkout-link) continuam propagando erro. **Best-effort** (system/cron-initiated pós-operação: plan-change executado, provision checkout link, provision activation) ganham wrapper `sendBestEffort` que loga e não propaga. 4 call sites convertidos + fallback adicionado em `sendPasswordResetForProvisionOrDefault` para user nunca ficar sem email.

**Origem**: review de `src/lib/email.tsx` (CP-53).

**Contexto factual**:
- Hoje 19 senders fazem `await transporter.sendMail(...)` sem try/catch — falha SMTP propaga como 500 pro usuário.
- Call sites: `contact.service.ts`, `listeners.ts`, `lib/auth/hooks.ts` — todos aguardam e propagam.
- Em CP-2 (bloqueado por #269), vai ser criado `dispatchEmail({to, subject, component})` helper. Política de erro vai ser escolhida lá.

**Opções**:
1. **Throw em críticos** (verification, password-reset, 2FA OTP, invitation) — usuário precisa saber se email não foi enviado. **Log-e-engole** em notificações (admin-cancel, trial-expired, welcome) — best-effort.
2. **Log-e-engole em tudo** + alertar via ErrorReporter pro Sentry + retry via queue (MP-4).
3. **Throw em tudo** — status quo.

**O que precisamos decidir**: onde throw vs engole. Blue-green nas rotas que dependem de email.

**Ação quando decidido**: parte do CP-2 (emails consolidation, bloqueado por #269). Definir a política **antes** de iniciar CP-2.

---

### OQ-15 — Pool SMTP dimensioning depende do provedor de produção. Qual vamos usar?

**✅ Status**: Resolvida (2026-04-23, commit `b4c5204`). Provedor: **Hostinger Business Email** (mesmo provedor da VPS). Pool configurado: `maxConnections: 3`, `maxMessages: 100`, timeouts adequados (10s connection/greeting, 30s socket). Apenas em produção — dev (MailHog) mantém sem pool.

**Origem**: review de `src/lib/email.tsx` (CP-53).

**Contexto factual**:
- Hoje sem `pool: true` — abre/fecha conexão a cada envio.
- Nodemailer recomenda pool em produção (throughput + connection reuse).
- Dimensioning (`maxConnections`, `maxMessages`) depende do provedor:
  - **SES**: 14 msg/s default, pode pedir aumento
  - **SendGrid**: 600 msg/min no free tier
  - **Mailgun**, **Postmark**, etc — limites diferentes
- Em dev (MailHog) pool é irrelevante.

**Opções**:
1. **Definir provedor agora** + configurar pool com limits do provedor.
2. **Pool genérico** (`maxConnections: 5`) + ajustar depois quando tiver telemetria.
3. **Sem pool** até atingir volume que justifique.

**O que precisamos decidir**: qual provedor SMTP prod? Volume projetado mensal?

**Ação quando decidido**: parte do CP-2 (emails consolidation).

---


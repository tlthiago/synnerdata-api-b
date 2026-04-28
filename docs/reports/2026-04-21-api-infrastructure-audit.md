# Relatório de Auditoria de Infraestrutura da API

**Data:** 2026-04-21
**Escopo:** Fase 1 do fluxo definido em [`docs/improvements/`](../improvements/README.md) (matriz agnóstica em [principles.md](../improvements/principles.md), aplicação em [project.md](../improvements/project.md))
**Status:** ✅ Concluído (Blocos 1-6 + relatório)
**Próximo passo:** Fase 2 — consolidação do roadmap priorizado (ver [roadmap.md](../improvements/roadmap.md))

---

## Resumo executivo

Auditoria de **25 arquivos/pastas** em 6 blocos cobrindo bootstrap, infraestrutura, auth, módulos críticos, emails e CI/CD. Foram consultadas 4 fontes por item avaliado: código atual, docs oficiais via `context7` (Better Auth, Elysia), pesquisa web (OWASP, best practices 2026) e avocado-hp como benchmark pareado.

**Veredito geral**: o projeto está em estado **acima da média** para um MVP B2B multi-tenant. Investimento em segurança (crypto PII, Better Auth, Sentry, Trivy, Dependabot) e observabilidade básica é sólido. Débitos encontrados são majoritariamente **hardening leve** e **organização semântica** — não há comprometimento funcional, mas há riscos reais em produção pelo cliente ativo.

### Contagens consolidadas

**Núcleo universal** (35 itens agnósticos):

| Tabela | Total | ✅ | ⚠️ | ❌ | ? / N/A |
|---|---|---|---|---|---|
| 4.1 MVP universal | 19 | 13 | 4 | 2 | 0 |
| 4.2 Early-stage universal | 10 | 3 | 4 | 2 | 1 |
| 4.3 Scale universal | 6 | 0 | 0 | 6 | 0 |

**Context-dependent** (30 itens filtrados pelo contexto do projeto):

| Tabela | Total | ✅ | ⚠️ | ❌ | N/A |
|---|---|---|---|---|---|
| 5.1 MVP conforme contexto | 9 | 5 | 2 | 1 | 1 |
| 5.2 Early-stage conforme contexto | 9 | 1 | 2 | 1 | 5 (? e N/A) |
| 5.3 Scale conforme contexto | 12 | 0 | 0 | 10 | 2 |

**Débitos totais registrados**: **95** (seção 7.7 do checklist), categorizados:
- 🔴 crítico / urgente (impacto direto em produção): **3**
- 🟡 hardening / curto prazo: **~40**
- 🟢 qualidade / médio prazo: **~50**
- Reavaliados e revertidos: **2** (#22 e #31 — `AuditService.log` já tem silent catch intencional)

---

## Achados surpreendentes

### 🏆 Pontos em que synnerdata supera avocado-hp (referência pareada)

Nove áreas onde a implementação do synnerdata é **objetivamente superior** ao projeto-referência usado como benchmark:

1. **`lib/crypto/pii.ts`** — AES-256-GCM com scrypt KDF + salt per-encrypt + helpers de mask (CPF/email/phone/PIS/RG). Avocado-hp não tem nada equivalente. Ótima base para compliance LGPD com dados de saúde.
2. **Better Auth configurado de forma rica** — rate limit com 5 customRules (sign-in 5/min, forgot-password 3/5min), 2FA OTP encrypted, backup codes encrypted, admin plugin, organization plugin completo, apiKey plugin com rate limit próprio (200/min). Resolve vários débitos de MVP **sem código custom**.
3. **`lib/sentry.ts` com `beforeSend`** — remove `authorization` e `cookie` dos requests enviados ao GlitchTip (proteção contra vazamento de credenciais em error tracking).
4. **Correlation ID (`X-Request-ID`) injetado em sucesso E erro** — avocado-hp só injetava em sucesso.
5. **OpenAPI com `x-error-messages`** extraído dos checks do Zod v4 — frontend pode gerar validações ricas via Kubb.
6. **CORS robusto com `parseOrigins`** (múltiplas origins), `maxAge: 86400`, expose headers de RateLimit.
7. **Webhook Pagar.me com idempotência completa** — check `pagarmeEventId` + `processedAt`, timing-safe compare em Basic Auth, timestamp ordering em subscription updates.
8. **Dependabot com 3 ecosystems** (npm + docker + github-actions), groups, security patches como prioridade.
9. **CI Trivy + SARIF upload para GitHub Security tab** + affected tests via `scripts/affected-tests.sh` (diff-based).

### Achados negativos surpreendentes

Débitos encontrados que **não eram esperados** dado o estado geral do projeto:

1. **#16 `requestId` ausente no body do erro** (MVP faltante) — 1 linha de mudança, impacta suporte direto. Surpreendente que não esteja implementado dado o resto do logging robusto.
2. **#54 API keys não auditam operações admin** — `ApiKeyService.create/revoke/delete` não chamam `AuditService.log`. Gap de compliance em um módulo de alta criticidade (cliente em produção consumindo via Power BI).
3. **#76 `bun pm audit` ausente em todos os workflows** — README afirma que existe, mas não está nem no `package.json` nem nos workflows. Trivy cobre imagem mas não deps JS específicas (Dependabot é reativo, não bloqueia PR).
4. **`lib/email.tsx` com 476 linhas** concentrando transporter + 19 senders — mesmo padrão repetitivo. Refactor mapeado (débito #8/#9) é grande mas seguro (apenas 6 consumidores externos).
5. **`lib/auth.ts` com 24KB** misturando config Better Auth + 9 helpers de audit + validators + hooks — candidato óbvio para divisão.
6. **Plugins Elysia em `src/lib/`** (cron, audit, request-context, auth, logger) convivendo com utilitários puros — organização semântica dispersa.
7. **`src/lib/helpers/employee-status.ts`** com lógica de domínio — pertence a `modules/employees/`.
8. **Débitos #22 e #31 (audit sem try/catch) revertidos** — análise superficial levou a falso positivo. `AuditService.log` já tem silent catch intencional documentado no CLAUDE.md do módulo. Lembrete: ler CLAUDE.md antes de julgar.

---

## Riscos imediatos em produção

Cliente ativo consumindo a API via front web + API keys (Power BI). Os seguintes débitos representam **risco real hoje** e devem ser endereçados no bucket **🔴 Urgente** da Fase 2:

| # | Débito | Impacto potencial |
|---|---|---|
| 16 (MVP) | `requestId` ausente no body do erro | Suporte não correlaciona tickets com logs sem pedir header manualmente |
| 54 | API keys não auditam create/revoke/delete | Gap de compliance LGPD + rastreabilidade |
| 20 | Request timeout não configurado | Handler travado pode derrubar servidor |
| 76 | `bun pm audit` ausente | Supply chain scan parcial (Trivy cobre imagem, não deps JS) |
| 22/23/24 (audit plugin) | `auditPlugin` em `lib/audit/` (lugar errado) + exige contexto manual + tipos frouxos | Inconsistência com `modules/audit/` + propenso a erro humano |
| BOLA (5.1 #3) | Isolamento por `organizationId` depende de disciplina por-service | Validar com testes cruzados entre orgs em cada módulo |
| 56 | Webhook Pagar.me usa Basic Auth em vez de HMAC | Credential estática trafega a cada webhook (mitigado por TLS + timing-safe compare) |
| 77 | `SKIP_INTEGRATION_TESTS: "true"` no CI | Possível falsa sensação de cobertura — validar semântica |

### Mitigações já existentes

Antes de classificar como urgente absoluto, é importante reconhecer o que **já mitiga** parte desses riscos:

- GlitchTip captura 5xx mesmo sem requestId no body
- Audit via Better Auth hooks cobre user/session/org/members (API keys é gap isolado)
- `serve.maxRequestBodySize: 10MB` limita payload (sem timeout mas com limite de body)
- Trivy + Dependabot cobrem parte da cadeia de supply chain
- Rate limit do Better Auth em endpoints de auth (5 req/min em sign-in) protege brute-force
- `useSecureCookies` + `trustedOrigins` + CSRF via Better Auth em ambiente de browser

---

## Recomendação inicial de priorização para Fase 2

Proposta preliminar de buckets para o roadmap (a consolidar na Fase 2):

### 🔴 Urgente (antes de 30 dias, cliente ativo em prod)

**Supply chain e correlação:**
- #76 Adicionar `bun pm audit --audit-level=high` no lint.yml
- #16 Incluir `requestId` no body do erro (1 linha no errorPlugin)
- #54 Auditar create/revoke/delete de API keys

**Hardening básico:**
- #20 Configurar request timeout (`serve.idleTimeout`)
- #22-24 Corrigir débitos do auditPlugin (mover para `src/plugins/audit/`, remover contexto manual, fix tipos)
- #77 Validar/corrigir `SKIP_INTEGRATION_TESTS` no CI
- #92 Documentar backup policy do Postgres Coolify em runbook

**Validar BOLA em prod:**
- Auditar cada service de `modules/` para garantir filtro `organizationId` + adicionar testes cruzados entre orgs

### 🟡 Curto prazo (30-90 dias)

**Organização semântica (plano dedicado):**
- **PR #1:** Criar `src/plugins/` e migrar plugins de `lib/` (débito #1)
- **PR #2:** Consolidar emails em `src/lib/emails/{senders,templates,components,mailer}` (débitos #8, #9)
- **PR #3:** Criar `src/routes/v1/` e padronizar versionamento (débitos #10, #13)
- **PR #4:** Quebrar `lib/auth.ts` (24KB) e `lib/auth-plugin.ts` (369 linhas) em arquivos menores (débitos #38, #49)
- **PR #5:** Mover erros de domínio de `lib/errors/` para `modules/<domínio>/errors.ts` (débito #21)

**Env.ts hardening:**
- #14-19 Ajustar validações do Zod: min em BETTER_AUTH_SECRET, SMTP condicional, hex validation em PII_ENCRYPTION_KEY, NODE_ENV enum, etc.

**Segurança adicional:**
- #56 Migrar webhook Pagar.me para HMAC (após confirmar suporte em docs.pagar.me)
- #84 Adicionar gitleaks/trufflehog para scan de histórico
- #85 Gerar SBOM via Trivy
- #88 HEALTHCHECK deep (não só liveness)
- #89 wait-for-db no entrypoint

**Preparação Cloudflare Free Tier (decisão 7.3 #1):**
- Alinhar com cliente para apontar DNS registro.br → Cloudflare → Coolify
- Configurar WAF básico + rate limit + HSTS + compression no edge

**Observabilidade:**
- #2 Métricas básicas (OTel Metrics ou Prometheus)
- #9 Política de deprecation (headers `Deprecation`/`Sunset`)
- #82 Trivy filesystem scan (`trivy fs .`)
- #78 Playwright E2E em workflow CI

### 🟢 Médio prazo / sob demanda

- Paginação por cursor (quando alguma listagem exceder SLA)
- Cache layer Redis (quando queries repetidas dominarem)
- BullMQ + Redis (quando emails/jobs exigirem fila externa)
- Rate limit do Better Auth com `storage: "database"` (se escalar horizontalmente)
- SOC 2 / ISO 27001 (se cliente enterprise exigir)
- eSocial direto (quando roadmap comercial priorizar)
- Débitos de qualidade #42-75 em geral (oportunísticos)

---

## Referências usadas na auditoria

**Fontes externas consultadas (seção 7.4.2 metodologia):**

- [OWASP API Security Top 10 — 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [Better Auth — Rate Limit (context7)](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/concepts/rate-limit.mdx) — validou débito #32
- [Better Auth — Options (context7)](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/reference/options.mdx)
- [Webhook Security Fundamentals 2026](https://www.hooklistener.com/learn/webhook-security-fundamentals) — validou débito #56
- [HMAC Signature Validation (Didit)](https://didit.me/blog/webhook-security-hmac-signature-validation/)
- [SHA256 Webhook Signature Verification (Hookdeck)](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification)
- [Using Helmet in Node.js (LogRocket)](https://blog.logrocket.com/using-helmet-node-js-secure-application/) — validou priorização de CSP
- [Pagar.me Webhook Documentation](https://docs.pagar.me/reference/vis%C3%A3o-geral-sobre-webhooks)
- [ElysiaJS Documentation (context7)](https://elysiajs.com/)
- [Node.js Security Best Practices 2026](https://medium.com/@sparklewebhelp/node-js-security-best-practices-for-2026-3b27fb1e8160)

**Fontes internas:**
- [`docs/improvements/`](../improvements/README.md) — iniciativa de improvements (README + principles/project/roadmap/debts/changelog)
- `docs/code-standards/module-code-standards.md` — padrões do projeto
- CLAUDE.md por módulo (audit, payments/webhook, admin, admin/api-keys, public, logger)
- avocado-hp (`apps/server/src/`) — benchmark pareado

---

## Próximos passos concretos

1. **Publicar este relatório** em PR separado ou commit dedicado
2. **Atualizar seção 7.0** do checklist — Fase 1 ✅ concluída → Fase 2 🔄 próxima
3. **Atualizar Changelog** do checklist (seção 8)
4. **Aguardar aprovação** para iniciar Fase 2 (roadmap priorizado)
5. **Fase 3 (execução)** começa pelos itens do bucket 🔴 Urgente

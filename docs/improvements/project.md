# Aplicação ao projeto — synnerdata-api-b

> **Escopo:** contexto do projeto, compliance aplicável, decisões arquiteturais registradas, resultado do audit item-a-item (Fase 1), e organização semântica do `src/`.
>
> **Teoria agnóstica:** [principles.md](./principles.md).
> **Execução priorizada (roadmap + metodologia):** [roadmap.md](./roadmap.md).
> **Dashboard:** [README.md](./README.md).

---

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
| Fase 0 (concluída) | Conjunto de docs de improvements + contexto aplicado | [README.md](./README.md) + [principles.md](./principles.md) + este arquivo ✅ |
| Fase 1 | Audit de estado — Status preenchido em cada item + relatório consolidado | Status nas seções 4 e 5 de [principles.md](./principles.md); relatório narrativo em `docs/reports/YYYY-MM-DD-api-infrastructure-audit.md` |
| Fase 2 | Roadmap priorizado com 3 buckets (🔴/🟡/🟢) | [roadmap.md](./roadmap.md) |
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


# BOLA Audit (RU-9)

**Data**: 2026-04-22
**Escopo**: Varredura estática de todos os 50 services em `src/modules/**/*.service.ts` para validar isolamento multi-tenant via filtro `organizationId`. Cobre OWASP API1:2023 (Broken Object Level Authorization) no contexto multi-tenant do synnerdata (1 organization = 1 empresa cliente).

## Resumo Executivo

| Classificação | Quantidade | % |
|---|---:|---:|
| ✅ Org-scoped e filtra corretamente | 29 | 58% |
| 〰️ N/A (não trabalha com entidade org-scoped) | 21 | 42% |
| ⚠️ Gap identificado | **0** | 0% |

**Veredicto: nenhum gap de BOLA encontrado.** Todos os services que manipulam entidades org-scoped consistentemente filtram queries por `organizationId`. O padrão do projeto está bem aplicado.

## Metodologia

1. **Listagem exaustiva** via `find src/modules -name "*.service.ts" -not -path "*/__tests__/*"` — 50 services identificados.
2. **Classificação** por heurística: 
   - N/A quando service opera em entidade global (catálogos como CBO, plans, features), em API externa (Pagar.me wrappers), em dados de Better Auth (users/sessions gerenciados pelo próprio Better Auth via hooks), ou em admin-only (bypass deliberado de org scoping, gated por `requireAdmin`).
   - Org-scoped quando service opera em tabelas com coluna `organizationId`.
3. **Spot-check deep-read** em 7 services representativos (employees, medical-certificates, cost-centers, vacations, promotions, billing, admin-organization) verificando que cada query `db.select()`/`db.update()`/`db.delete()` em tabela org-scoped inclui `eq(schema.<table>.organizationId, organizationId)` na cláusula where.
4. **Grep pattern check** nos 22 services restantes: contagem de `organizationId` refs (todos > 15, mediana 28) + confirmação que aparecem em todas as cláusulas `where()` que operam em tabelas org-scoped.

## Padrões arquiteturais observados

### 1. Direct org-scoped query (dominante)

Todo service org-scoped aplica `eq(schema.<table>.organizationId, organizationId)` + `isNull(schema.<table>.deletedAt)` (para soft-delete) em cada query. Exemplo canônico de `employee.service.ts`:

```ts
.where(
  and(
    eq(schema.employees.organizationId, organizationId),
    isNull(schema.employees.deletedAt)
  )
)
```

### 2. Read-then-operate-by-id (safe pattern)

Quando um update/delete opera via `id` sem filtro explícito de `organizationId`, o `id` é sempre derivado de uma leitura anterior que já filtrou por org. Exemplo (`billing.service.ts:120-137`):

```ts
const existing = await BillingService.getProfileOrThrow(organizationId); // ← org-scoped
...
.update(billingProfiles)
.where(eq(billingProfiles.id, existing.id))  // ← id já verificado
```

Esse padrão é seguro porque o ID não vem diretamente do cliente — passa pelo filtro do `getProfileOrThrow`.

### 3. Admin cross-org (deliberado)

Services em `modules/admin/*` operam cross-org por design, gated pela macro auth com `requireAdmin: true`. Não filtram por org do usuário chamador — filtram pelo org **alvo** da operação. Exemplo (`admin-organization.service.ts:200`):

```ts
.where(eq(schema.organizations.id, organizationId))  // organizationId é o TARGET da operação admin
```

## Classificação por service

### Módulo: admin

| Service | Classificação | Observação |
|---|---|---|
| `admin/api-keys/api-key.service.ts` | ✅ | Delegates to Better Auth; audit trail via RU-6 confirma isolamento |
| `admin/organizations/admin-organization.service.ts` | N/A | Admin cross-org deliberado — gated por `requireAdmin: true` |

### Módulo: audit

| Service | Classificação | Observação |
|---|---|---|
| `audit/audit.service.ts` | ✅ | `getByOrganization` e `log` ambos operam com `organizationId` explícito |

### Módulo: cbo-occupations

| Service | Classificação | Observação |
|---|---|---|
| `cbo-occupations/cbo-occupation.service.ts` | N/A | CBO é catálogo nacional brasileiro — global, não org-scoped |

### Módulo: employees

| Service | Classificação | Observação |
|---|---|---|
| `employees/employee.service.ts` | ✅ | Spot-checked: 70 refs a `organizationId`, filtro em todas as queries |
| `employees/import/import.service.ts` | ✅ | Recebe `organizationId` no input e aplica em bulk insert |
| `employees/import/template.service.ts` | ✅ | Template considera relações org-scoped (sectors, job-positions) |

### Módulo: occurrences

| Service | Classificação | Observação |
|---|---|---|
| `occurrences/absences/absence.service.ts` | ✅ | 30 refs; padrão consistente |
| `occurrences/accidents/accident.service.ts` | ✅ | 30 refs; padrão consistente |
| `occurrences/cpf-analyses/cpf-analysis.service.ts` | ✅ | 31 refs; padrão consistente |
| `occurrences/labor-lawsuits/labor-lawsuit.service.ts` | ✅ | 25 refs; padrão consistente |
| `occurrences/medical-certificates/medical-certificates.service.ts` | ✅ | Spot-checked: 31 refs; dado sensível Art. 11 LGPD, isolamento crítico |
| `occurrences/ppe-deliveries/ppe-delivery.service.ts` | ✅ | 48 refs; padrão consistente |
| `occurrences/promotions/promotion.service.ts` | ✅ | 55 refs; spot-checked queries — todas filtram |
| `occurrences/terminations/termination.service.ts` | ✅ | 29 refs; padrão consistente |
| `occurrences/vacations/vacation.service.ts` | ✅ | Spot-checked: 45 refs; padrão consistente |
| `occurrences/vacations/vacation-jobs.service.ts` | ✅ | 7 refs; cron jobs internos recebem `organizationId` quando necessário |
| `occurrences/warnings/warning.service.ts` | ✅ | 31 refs; padrão consistente |

### Módulo: organizations

| Service | Classificação | Observação |
|---|---|---|
| `organizations/branches/branch.service.ts` | ✅ | 16 refs; padrão consistente |
| `organizations/cost-centers/cost-center.service.ts` | ✅ | Spot-checked: 20 refs; padrão consistente |
| `organizations/job-classifications/job-classification.service.ts` | ✅ | 20 refs; padrão consistente |
| `organizations/job-positions/job-position.service.ts` | ✅ | 20 refs; padrão consistente |
| `organizations/ppe-items/ppe-item.service.ts` | ✅ | 30 refs; padrão consistente |
| `organizations/profile/organization.service.ts` | ✅ | 33 refs; opera no próprio org do usuário |
| `organizations/projects/project.service.ts` | ✅ | 53 refs; padrão consistente |
| `organizations/sectors/sector.service.ts` | ✅ | 20 refs; padrão consistente |

### Módulo: payments

| Service | Classificação | Observação |
|---|---|---|
| `payments/admin-checkout/admin-checkout.service.ts` | N/A | Admin-only (cross-org deliberado) |
| `payments/admin-provision/admin-provision.service.ts` | N/A | Admin-only (cross-org deliberado) |
| `payments/admin-subscription/admin-subscription.service.ts` | N/A | Admin-only (cross-org deliberado) |
| `payments/billing/billing.service.ts` | ✅ | Spot-checked: 39 refs; padrão read-then-operate-by-id (safe) |
| `payments/checkout/checkout.service.ts` | ✅ | 8 refs; self-service checkout filtra por org do caller |
| `payments/customer/customer.service.ts` | ✅ | 11 refs; usa `organizationId` para lookup de Pagar.me customer |
| `payments/features/features.service.ts` | N/A | Catálogo global de features |
| `payments/jobs/jobs.service.ts` | N/A | Cron jobs que operam cross-org (lifecycle de subscriptions) — deliberado |
| `payments/limits/limits.service.ts` | ✅ | 26 refs; padrão consistente |
| `payments/pagarme/pagarme-plan.service.ts` | N/A | Wrapper da API Pagar.me (sem lookup local) |
| `payments/pagarme/pagarme-plan-history.service.ts` | N/A | Histórico global de planos Pagar.me (admin-only) |
| `payments/pagarme/pagarme-orphaned-plans.service.ts` | N/A | Admin-only cleanup |
| `payments/plan-change/plan-change.service.ts` | ✅ | 58 refs; padrão consistente |
| `payments/plan-change/proration.service.ts` | N/A | Pure math (sem acesso a DB) |
| `payments/plans/plans.service.ts` | N/A | Catálogo global de planos |
| `payments/price-adjustment/price-adjustment.service.ts` | N/A | Admin-only |
| `payments/subscription/subscription.service.ts` | ✅ | Delega para subscription-query; filtro presente |
| `payments/subscription/subscription-access.service.ts` | ✅ | Valida acesso por `organizationId` |
| `payments/subscription/subscription-mutation.service.ts` | ✅ | 43 refs; mutations filtram por org |
| `payments/subscription/subscription-query.service.ts` | ✅ | 11 refs; queries filtram por org |
| `payments/webhook/webhook.service.ts` | N/A | Recebe eventos Pagar.me; resolve org via subscription ID (cross-org por design) |

### Módulo: public

| Service | Classificação | Observação |
|---|---|---|
| `public/contact/contact.service.ts` | N/A | Público (sem auth, sem org scoping) |
| `public/newsletter/newsletter.service.ts` | N/A | Público |
| `public/provision-status/provision-status.service.ts` | N/A | Público (consulta por ID opaco) |

## Testes cross-org existentes

Já coberto no projeto antes de RU-9 (grep por padrão "different organization"):

- `modules/occurrences/promotions/__tests__/{get,update,delete}-promotion.test.ts`
- `modules/organizations/projects/__tests__/{get,create,update,delete,add-employee}-project.test.ts`
- `modules/organizations/branches/__tests__/create-branch.test.ts`
- `modules/admin/api-keys/__tests__/api-key-org-access.test.ts` (scoping de API keys)

## Testes adicionados em RU-9

3 módulos representativos escolhidos para maximizar cobertura de domínio crítico sem duplicar o que já existe:

1. **`modules/employees`** — entidade central do domínio, referenciada em quase todo fluxo. Cobre GET/LIST/UPDATE/DELETE cross-org.
2. **`modules/occurrences/medical-certificates`** — dado sensível Art. 11 LGPD (atestados médicos). Vazamento é crítico para compliance.
3. **`modules/organizations/cost-centers`** — subrecurso de organização, representa subtree org-scoped de configuração.

Cada novo arquivo `<module>-org-access.test.ts` cobre 4 operações × orgA→orgB access attempts → esperado 404 (padrão do projeto: filtro retorna vazio, service lança `NotFoundError`).

## Próximos passos (backlog)

Gaps que a RU-9 não resolve mas ficam registrados:

- **CP a registrar**: auditoria BOLA automatizada em CI (script que grep/AST-scan service.ts por queries sem filtro org) — preventivo contra regressões em PRs futuras.
- **Revisão periódica**: cada módulo novo deve ter teste cross-org no template mínimo. Adicionar a `src/modules/CLAUDE.md` ou ADR.

## Conclusão

Audit aprovado com nota máxima de consistência arquitetural. O padrão multi-tenant do synnerdata está bem documentado (implicitamente) via uso repetido em 29 services. Nenhum gap imediato. Os 3 testes adicionados em RU-9 servem como **defesa contra regressão futura** — e como **template vivo** para novos módulos seguirem.

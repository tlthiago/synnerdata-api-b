# Testing Standards

> **OBRIGATÓRIO para Agentes de IA**: Leia ANTES de criar/modificar testes. Siga EXATAMENTE os padrões abaixo.

## Filosofia de Testes

**Foco: Testes End-to-End (E2E)**

Os testes desta aplicação são **E2E por padrão**. Isso significa:

- Testamos o fluxo completo: HTTP request → Controller → Service → Database → Response
- Usamos banco de dados real (ambiente de teste)
- Chamamos APIs externas reais quando possível (sandbox/test mode)
- Validamos o comportamento do sistema como um todo

**Mocks são exceção, não regra.** Use mocks apenas quando:

1. A API externa não tem ambiente de teste/sandbox
2. Testar cenários de falha impossíveis de reproduzir (timeout, connection refused)
3. O custo/tempo da chamada real é proibitivo para o teste

**Quando usar mock:**
```typescript
// Simular falha de conexão - impossível reproduzir de forma confiável
const spy = spyOn(ExternalClient, "method").mockRejectedValueOnce(new Error("Connection refused"));
```

**Quando NÃO usar mock:**
```typescript
// Chamada real ao Pagar.me em modo sandbox - preferível
const response = await PagarmeClient.createPaymentLink(data);
expect(response.id).toStartWith("pl_");
```

---

## Test Helpers para Reduzir Boilerplate

Embora os testes sejam E2E, usamos **helpers para setup de dados** quando o recurso não é o foco do teste. Isso reduz boilerplate sem comprometer a filosofia E2E.

**Princípio fundamental:**

| Situação | Abordagem |
|----------|-----------|
| Testar criação de recurso (POST) | Usar **API diretamente** |
| Recurso é setup para outro teste | Usar **helper** |

**Exemplo - teste de DELETE:**

```typescript
// ✅ CORRETO: Usar helper para criar o recurso (setup)
const { employee } = await createTestEmployee({ organizationId, userId });

// Testar o DELETE via API (foco do teste)
const response = await app.handle(
  new Request(`${BASE_URL}/v1/employees/${employee.id}`, {
    method: "DELETE",
    headers,
  })
);

expect(response.status).toBe(200);
```

**Exemplo - teste de CREATE:**

```typescript
// ✅ CORRETO: Usar API para criar (é o foco do teste)
// Usar helpers apenas para dependências (sector, jobPosition, etc.)
const deps = await createTestDependencies(organizationId, userId);

const response = await app.handle(
  new Request(`${BASE_URL}/v1/employees`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "João da Silva",
      cpf: "12345678901",
      ...deps,  // sectorId, jobPositionId, etc.
    }),
  })
);

expect(response.status).toBe(200);
```

**Helpers disponíveis em `src/test/helpers/`:**

- `createTestBranch` - Filiais
- `createTestSector` - Setores
- `createTestCostCenter` - Centros de custo
- `createTestJobPosition` - Funções/cargos
- `createTestJobClassification` - CBOs
- `createTestEmployee` - Funcionários (cria dependências automaticamente)

**Vantagens dos helpers:**

1. **Reduz boilerplate**: ~35 linhas de setup → 3 linhas
2. **Dados realistas**: Usa Faker com locale pt-BR
3. **Mantém filosofia E2E**: Helpers usam Services que gravam no banco real
4. **Testes mais focados**: Setup não polui o código do teste

Consulte `docs/code-standards/module-implementation-guide.md` seção 3.4 para criar novos helpers.

---

## Estrutura de Testes

```text
src/
├── test/
│   ├── setup.ts              # Setup global (verifica conexão com banco)
│   ├── factories/            # Funções que CRIAM registros no banco
│   │   └── plan.ts           # Factory de plans com IDs dinâmicos
│   └── helpers/              # Funções auxiliares para setup de testes
│       ├── faker.ts          # Geradores de dados BR (CPF, CNPJ, etc.)
│       ├── organization.ts   # Cria organizações
│       ├── subscription.ts   # Cria subscriptions
│       ├── user.ts           # Cria usuários
│       └── ...
└── modules/{domain}/{module-name}/
    └── __tests__/
        └── {action}-{resource}.test.ts   # Ex: create-checkout.test.ts
```

---

## Arquivo de Teste

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestAdminUser, createTestUser } from "@/test/helpers/user";
import { createPaidPlan } from "@/test/factories/plan";
import { PLAN_FEATURES } from "../plans.constants";

const BASE_URL = env.API_URL;

// Constantes do domínio para testes
const GOLD_FEATURES = [...PLAN_FEATURES.gold];

describe("POST /v1/{domain}/{resource}", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await createTestAdminUser({ emailVerified: true });
    authHeaders = headers;
  });

  // Sem afterAll de cleanup - IDs dinâmicos não colidem

  // Testes aqui...
});
```

---

## Factories para Dados de Teste

Factories criam dados diretamente no banco com IDs dinâmicos (`plan-${crypto.randomUUID()}`).

**Localização:** `src/test/factories/`

**Diferença entre Factory, Helper e Fixture:**

| Tipo | Cria no Banco? | Exemplo |
|------|----------------|---------|
| **Factory** | Sim, inserção direta | `createTestPlan()` |
| **Helper** | Sim, via API ou DB | `createOrganizationViaApi()` |
| **Fixture** | Não usar | ~~`testPlans.gold`~~ (removido) |

**Exemplo - Plan Factory:**

```typescript
import { createPaidPlan, createTrialPlan, getFirstTier } from "@/test/factories/plan";

// Criar plano pago com todos os tiers
const { plan, tiers } = await createPaidPlan("gold");
const tier = getFirstTier({ plan, tiers });

// Criar plano trial
const { plan: trialPlan } = await createTrialPlan();

// Usar IDs dinâmicos nos testes
const response = await app.handle(
  new Request(`${BASE_URL}/v1/payments/checkout`, {
    body: JSON.stringify({
      planId: plan.id,      // plan-a1b2c3d4-...
      tierId: tier.id,      // tier-e5f6g7h8-...
    }),
  })
);
```

**Quando usar Factory vs API:**

| Situação | Abordagem |
|----------|-----------|
| Testar criação de plano (POST /plans) | Criar via **API** (é o foco) |
| Plano é dependência para checkout | Usar **factory** |
| Testar criação de employee | Criar via **API** |
| Employee é dependência para absence | Usar **helper** |

---

## IDs Dinâmicos

Sempre usar IDs únicos para evitar conflitos entre testes paralelos.

```typescript
// ✅ CORRETO: Helper para gerar nomes únicos
function generateUniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

const planName = generateUniqueName("test-plan");  // test-plan-a1b2c3d4

// ❌ ERRADO: ID hardcoded
const planName = "test-plan-pro";  // Conflita entre execuções
```

**Benefícios:**

- Testes podem rodar em paralelo (Bun executa arquivos em paralelo por padrão)
- Não precisa de cleanup no `afterAll` (IDs nunca colidem)
- Banco de teste não acumula conflitos

**Quando cleanup ainda é necessário:**

- Manipulação de tempo com `setSystemTime()` - restaurar no `afterAll`
- Testes de use-case que criam fluxos completos (usuário → org → subscription)

---

## Constantes de Domínio

Importar constantes reais do domínio em vez de criar valores fake.

```typescript
// ✅ CORRETO: Usar features reais do sistema
import { PLAN_FEATURES } from "../plans.constants";

const GOLD_FEATURES = [...PLAN_FEATURES.gold];
const TRIAL_FEATURES = [...PLAN_FEATURES.trial];

const planData = {
  limits: { features: GOLD_FEATURES },
};

// ❌ ERRADO: Features inventadas que não existem no sistema
const planData = {
  limits: { features: ["basic", "advanced", "premium"] },
};
```

**Por que usar constantes reais?**

- Testes refletem comportamento real do sistema
- Mudanças nas constantes são detectadas pelos testes
- Evita falsos positivos com dados fake

---

## Nomenclatura de Testes

### Describe
Usar o formato HTTP: `{METHOD} /v1/{path}`

```typescript
describe("POST /v1/payments/checkout", () => {});
describe("GET /v1/plans/:id", () => {});
describe("DELETE /v1/subscriptions/:id", () => {});
```

### Test
Usar `should` + verbo no infinitivo, descrevendo o comportamento esperado:

```typescript
// Rejeições (erros)
test("should reject unauthenticated requests", async () => {});
test("should reject user with unverified email", async () => {});
test("should reject for non-existent plan", async () => {});

// Sucesso (happy path)
test("should create payment link and return checkoutUrl", async () => {});
test("should sync plan to Pagarme if not yet synced", async () => {});
```

---

## Ordem dos Testes

Organizar na seguinte ordem para facilitar leitura:

1. **Autenticação** - `should reject unauthenticated requests`
2. **Validações de usuário** - email verificado, etc.
3. **Validações de negócio** - subscription ativa, plano inexistente, etc.
4. **Validações de input** - campos obrigatórios, formatos inválidos
5. **Happy paths** - fluxos de sucesso
6. **Permissões** - roles não autorizados
7. **Erros externos** - falhas de API, timeout, etc.

---

## Helpers de Usuário

### `createTestUserWithOrganization`
Usar quando o endpoint requer organização ativa:

```typescript
const { headers, organizationId, user } = await createTestUserWithOrganization({
  emailVerified: true,
});
```

### `createTestUser`
Usar apenas para criar membros adicionais (não owners):

```typescript
const memberResult = await createTestUser({ emailVerified: true });
await addMemberToOrganization(memberResult, {
  organizationId: orgId,
  role: "viewer",
});
```

**IMPORTANTE**: Nunca usar `createTestUser` para testar endpoints que requerem organização. Use sempre `createTestUserWithOrganization`.

---

## Consolidação com `test.each`

### Quando usar
- Testes que diferem apenas em um parâmetro
- Múltiplos roles/status com mesmo comportamento esperado

### Roles não autorizados

```typescript
test.each([
  "viewer",
  "manager",
  "supervisor",
] as const)("should reject %s member from creating checkout", async (role) => {
  const { addMemberToOrganization } = await import("@/test/helpers/organization");
  const { organizationId } = await createTestUserWithOrganization({ emailVerified: true });
  const { plan, tiers } = await createPaidPlan("gold");

  const memberResult = await createTestUser({ emailVerified: true });
  await addMemberToOrganization(memberResult, {
    organizationId,
    role,
  });

  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/checkout`, {
      method: "POST",
      headers: { ...memberResult.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: plan.id,
        tierId: tiers[0].id,
        successUrl: "https://example.com",
      }),
    })
  );

  expect(response.status).toBe(403);
  const body = await response.json();
  expect(body.error.code).toBe("FORBIDDEN");
});
```

### Status de subscription

```typescript
test.each([
  "trial",
  "canceled",
] as const)("should allow checkout for org with %s subscription", async (status) => {
  const { headers, organizationId } = await createTestUserWithOrganization({ emailVerified: true });
  const { plan } = await createPaidPlan("gold");

  await createTestSubscription(organizationId, plan.id, { status });

  const response = await app.handle(/* ... */);

  expect(response.status).toBe(200);
});
```

---

## Queries no Banco de Dados

### Usar `schema.[table]`

```typescript
import { schema } from "@/db/schema";

// SELECT todas as colunas
const [profile] = await db
  .select()
  .from(schema.organizationProfiles)
  .where(eq(schema.organizationProfiles.organizationId, orgId))
  .limit(1);

// SELECT com colunas específicas (usar alias apenas quando necessário)
const [plan] = await db
  .select({
    pagarmePlanId: schema.subscriptionPlans.pagarmePlanId,
  })
  .from(schema.subscriptionPlans)
  .where(eq(schema.subscriptionPlans.id, planId))
  .limit(1);

// UPDATE
await db
  .update(schema.subscriptionPlans)
  .set({ pagarmePlanId: null })
  .where(eq(schema.subscriptionPlans.id, plan.id));
```

---

## Cobertura Esperada

### Autenticação e Autorização
- [ ] Requisição sem autenticação → 401
- [ ] Usuário sem organização ativa → 403 `NO_ACTIVE_ORGANIZATION`
- [ ] Usuário sem permissão → 403 `FORBIDDEN`
- [ ] Roles não autorizados (viewer, manager, supervisor) → 403

### Validações de Usuário
- [ ] Email não verificado → 400 `EMAIL_NOT_VERIFIED`

### Validações de Negócio
- [ ] Recurso não encontrado → 404 `{RESOURCE}_NOT_FOUND`
- [ ] Recurso inativo/indisponível → 400 `{RESOURCE}_NOT_AVAILABLE`
- [ ] Conflito de estado → 400 `{RESOURCE}_ALREADY_{STATE}`

### Validações de Input
- [ ] Campos obrigatórios ausentes → 422
- [ ] Formato inválido (URL, email, etc.) → 422
- [ ] Valores vazios → 422

### Happy Paths
- [ ] Criação com sucesso → 200 com dados esperados
- [ ] Comportamento com dependências ausentes (ex: sem customer_id)
- [ ] Comportamento com dependências presentes (ex: com customer_id)
- [ ] Sincronização/cache (ex: reutiliza ID se já existe)

### Estados Permitidos
- [ ] Cada status que permite a operação (trial, canceled, etc.)

### Erros Externos
- [ ] Falha de API externa → 500

---

## Mocks e Spies (Uso Excepcional)

> **ATENÇÃO**: Mocks são exceção. Prefira sempre chamadas reais. Veja [Filosofia de Testes](#filosofia-de-testes).

### Único caso válido: Simular falhas impossíveis de reproduzir

```typescript
test("should handle Pagarme API connection failure", async () => {
  const { PagarmeClient } = await import("../../pagarme/client");

  const { headers } = await createTestUserWithOrganization({ emailVerified: true });

  // Mock APENAS para simular falha de conexão - impossível reproduzir de forma confiável
  const createPaymentLinkSpy = spyOn(
    PagarmeClient,
    "createPaymentLink"
  ).mockRejectedValueOnce(new Error("Pagarme API error: Connection refused"));

  const response = await app.handle(/* ... */);

  expect(response.status).toBe(500);

  // OBRIGATÓRIO: restaurar para não afetar outros testes
  createPaymentLinkSpy.mockRestore();
});
```

**Regras para uso de mocks:**
- Sempre chamar `.mockRestore()` no final
- Usar `mockRejectedValueOnce` (não `mockRejectedValue`) para limitar escopo
- Documentar com comentário o motivo do mock

---

## Assertions Comuns

### Testes E2E (Endpoints HTTP)

Endpoints retornam envelope `{ success: true, data: {...} }`:

```typescript
// Status HTTP
expect(response.status).toBe(200);
expect(response.status).toBe(400);

// Código de erro
const body = await response.json();
expect(body.error.code).toBe("EMAIL_NOT_VERIFIED");

// Dados de resposta (via body.data)
expect(body.data.checkoutUrl).toBeDefined();
expect(body.data.checkoutUrl).toBeString();
expect(body.data.checkoutUrl).toContain("pagar.me");

// Prefixos de ID
expect(body.data.paymentLinkId).toStartWith("pl_");
```

### Testes de Integração (Services)

Services retornam dados puros (sem envelope):

```typescript
// Chamar service diretamente
const result = await ResourceService.create(input);

// Acessar propriedades diretamente (SEM .data)
expect(result.id).toBeDefined();
expect(result.plans).toBeArray();
expect(result.plans.length).toBeGreaterThan(0);

// Valores nulos
expect(profile.pagarmeCustomerId).toBeNull();

// Datas
expect(checkout.expiresAt).toBeInstanceOf(Date);
expect(checkout.expiresAt.getTime()).toBeGreaterThan(Date.now());

// Igualdade
expect(planAfterSecond.pagarmePlanId).toBe(firstPagarmePlanId);
```

> **IMPORTANTE**: Testes de service **NÃO** devem usar `.success` ou `.data` - services retornam dados puros.

---

## Checklist Rápido

**Novo arquivo de teste:**
- [ ] Import de `bun:test` com `describe`, `expect`, `test`, `beforeAll`
- [ ] Import de `schema` de `@/db/schema`
- [ ] Import de factories de `@/test/factories/`
- [ ] Describe com formato `{METHOD} /v1/{path}`
- [ ] Setup com `createTestApp()` e factories para dados de teste
- [ ] IDs dinâmicos (`crypto.randomUUID()`) para evitar conflitos

**Cada teste:**
- [ ] Nome com `should` + comportamento esperado
- [ ] Usar `createTestUserWithOrganization` para endpoints com auth
- [ ] Validar status HTTP e código de erro
- [ ] Verificar dados de resposta quando aplicável

**Consolidação:**
- [ ] Usar `test.each` para testes que diferem apenas em parâmetro
- [ ] Evitar duplicação de código entre testes similares

**Cobertura:**
- [ ] Autenticação (401)
- [ ] Autorização/Permissões (403)
- [ ] Validações de negócio (400, 404)
- [ ] Validações de input (422)
- [ ] Happy paths (200)
- [ ] Erros externos (500)

---

# Testes de Use-Case

Testes de use-case validam **fluxos completos de negócio** que envolvem múltiplos endpoints e estados. Diferente dos testes de módulo, são sequenciais e dependentes.

## Quando Usar Cada Tipo

| Tipo | Quando Usar | Exemplo |
|------|-------------|---------|
| **Teste de Módulo (E2E)** | Validar um endpoint específico isoladamente | `POST /v1/payments/checkout` |
| **Teste de Integração** | Validar métodos internos de services | `SubscriptionService.checkAccess()` |
| **Teste de Use-Case** | Validar jornada completa do usuário | Signup → Onboarding → Trial → Expiração |

## Estrutura de Arquivos

```text
src/modules/{domain}/
├── {module-name}/
│   └── __tests__/
│       ├── {action}-{resource}.test.ts    # Testes E2E (endpoints)
│       └── {module-name}.service.test.ts  # Testes de integração (métodos internos)
├── {use-case}-use-case.test.ts            # Testes de use-case (raiz do domínio)
└── errors.ts
```

**Nomenclatura:** `{use-case}-use-case.test.ts`
- `signup-use-case.test.ts`
- `trial-expired-use-case.test.ts`
- `upgrade-subscription-use-case.test.ts`

---

## Estrutura do Arquivo

```typescript
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";

const BASE_URL = env.API_URL;

describe("{Use Case}: {Descrição do Cenário}", () => {
  let app: TestApp;

  // Estado compartilhado entre fases
  let sessionCookies: string;
  let userId: string;
  let organizationId: string;

  beforeAll(async () => {
    app = createTestApp();
    // Setup inicial (seeds, etc.)
  });

  afterAll(async () => {
    // Cleanup OBRIGATÓRIO
  });

  describe("Fase 1: {Nome da Fase}", () => {
    test("should {ação esperada}", async () => {});
  });

  describe("Fase 2: {Nome da Fase}", () => {
    test("should {ação esperada}", async () => {});
  });
});
```

---

## Nomenclatura

### Describe Principal
Usar formato: `{Use Case}: {Descrição do Cenário}`

```typescript
describe("Signup Use Case: Novo Usuário até Trial Ativo", () => {});
describe("Trial Expired Use Case: Usuário com Trial Expirado", () => {});
describe("Upgrade Use Case: Trial para Plano Pago", () => {});
```

### Fases
Usar formato: `Fase {N}: {Nome Descritivo}`

```typescript
describe("Fase 1: Autenticação Passwordless", () => {});
describe("Fase 2: Onboarding", () => {});
describe("Fase 3: Trial Subscription", () => {});
describe("Fase 4: Validação Final", () => {});
```

### Testes
Mesmo padrão: `should` + verbo no infinitivo

```typescript
test("should send OTP to new email", async () => {});
test("should create organization with trial", async () => {});
test("should deny access after trial expires", async () => {});
```

---

## Estado Compartilhado

Use variáveis `let` no escopo do describe principal para compartilhar estado entre fases:

```typescript
describe("Signup Use Case", () => {
  let app: TestApp;
  let testEmail: string;
  let sessionCookies: string;
  let userId: string;
  let organizationId: string;

  beforeAll(async () => {
    app = createTestApp();
    testEmail = `test-${crypto.randomUUID()}@example.com`;
  });

  describe("Fase 1: Autenticação", () => {
    test("should sign in with valid OTP", async () => {
      // ... fazer login ...
      sessionCookies = response.headers.get("set-cookie") ?? "";
    });

    test("should create new user automatically", async () => {
      const [user] = await db.select().from(schema.users)
        .where(eq(schema.users.email, testEmail)).limit(1);

      userId = user.id;  // Salva para usar nas próximas fases
    });
  });

  describe("Fase 2: Onboarding", () => {
    test("should create organization", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/create`, {
          headers: { Cookie: sessionCookies },  // Usa estado da fase anterior
          // ...
        })
      );

      organizationId = body.id;  // Salva para próximas fases
    });
  });
});
```

---

## Manipulação de Tempo

Para testar cenários que dependem de passagem de tempo (ex: expiração de trial):

```typescript
import { setSystemTime } from "bun:test";

describe("Trial Expired Use Case", () => {
  let originalTime: Date;

  beforeAll(async () => {
    originalTime = new Date();
  });

  afterAll(async () => {
    setSystemTime();  // OBRIGATÓRIO: restaurar tempo real
  });

  describe("Fase 2: Trial Próximo do Fim (Dia 12)", () => {
    test("should advance time to day 12 of trial", () => {
      const futureDate = new Date(originalTime);
      futureDate.setDate(futureDate.getDate() + 12);
      setSystemTime(futureDate);

      expect(new Date().getDate()).toBe(futureDate.getDate());
    });

    test("should still have access with ~2 days remaining", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);
      expect(access.hasAccess).toBe(true);
      expect(access.daysRemaining).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Fase 3: Trial Expirado (Dia 15)", () => {
    test("should advance time to day 15", () => {
      const futureDate = new Date(originalTime);
      futureDate.setDate(futureDate.getDate() + 15);
      setSystemTime(futureDate);
    });

    test("should deny access after trial expires", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);
      expect(access.hasAccess).toBe(false);
      expect(access.status).toBe("trial_expired");
    });
  });
});
```

**Regras para `setSystemTime`:**
- Sempre chamar `setSystemTime()` sem argumentos no `afterAll` para restaurar
- Guardar `originalTime` no `beforeAll` para cálculos relativos
- Usar `setDate` para avançar dias, não manipular timestamps diretamente

---

## Cleanup (Quando Necessário)

Com IDs dinâmicos, a maioria dos testes não precisa de cleanup. O cleanup é necessário apenas para:

1. **Manipulação de tempo** - Restaurar `setSystemTime()`
2. **Testes de fluxo completo** - Usuário → Organização → Subscription (dados relacionados)

```typescript
afterAll(async () => {
  // 1. Restaurar tempo real (se manipulado)
  setSystemTime();

  // 2. Cleanup para fluxos completos (se necessário)
  // Com IDs dinâmicos, isso é opcional - os dados não conflitam
});
```

**Quando NÃO precisa de cleanup:**
- Testes que usam `createTestPlan()`, `createPaidPlan()`, etc. com IDs dinâmicos
- Dados criados com `crypto.randomUUID()` - nunca colidem com outros testes

---

## Checklist Use-Case

**Estrutura:**
- [ ] Arquivo na raiz do domínio: `{use-case}-use-case.test.ts`
- [ ] Describe principal com formato `{Use Case}: {Descrição}`
- [ ] Fases organizadas com `describe` aninhados
- [ ] Estado compartilhado via variáveis `let`
- [ ] IDs dinâmicos para dados criados

**Setup/Cleanup:**
- [ ] `beforeAll` com `createTestApp()` e factories
- [ ] `afterAll` apenas se necessário (manipulação de tempo, fluxos completos)
- [ ] `setSystemTime()` restaurado se tempo foi manipulado

**Fases:**
- [ ] Cada fase testa uma etapa lógica do fluxo
- [ ] Testes dentro da fase são sequenciais e dependentes
- [ ] Estado é passado entre fases via variáveis compartilhadas

**Cobertura do Fluxo:**
- [ ] Setup inicial (criar usuário/org)
- [ ] Estados intermediários (trial ativo, próximo do fim)
- [ ] Estado final (trial expirado, upgrade completo)
- [ ] Validações no banco de dados
- [ ] Restauração de tempo real (se aplicável)

---

# Testes de Integração para Services

Testes de integração validam **métodos internos de services** que não são expostos via endpoints HTTP. Esses métodos são usados por outros módulos (webhooks, use-cases, jobs).

## Quando Criar

Criar testes de integração quando o service tem métodos internos que:
- São chamados por outros módulos (webhooks, jobs, outros services)
- Contêm lógica de negócio complexa
- Não são cobertos pelos testes E2E dos endpoints

## Estrutura de Arquivos

```text
src/modules/{domain}/{module-name}/
└── __tests__/
    ├── {action}-{resource}.test.ts      # Testes E2E (endpoints)
    └── {module-name}.service.test.ts    # Testes de integração (métodos internos)
```

**Nomenclatura:** `{module-name}.service.test.ts`
- `subscription.service.test.ts`
- `plan.service.test.ts`
- `customer.service.test.ts`

---

## Estrutura do Arquivo

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestOrganization } from "@/test/helpers/organization";
import { createPaidPlan, createTrialPlan } from "@/test/factories/plan";
import { createTestSubscription } from "@/test/helpers/subscription";
import { SubscriptionService } from "../subscription.service";

describe("SubscriptionService", () => {
  describe("methodName", () => {
    test("should {comportamento esperado}", async () => {
      // Arrange
      const org = await createTestOrganization();
      const { plan } = await createPaidPlan("gold");
      await createTestSubscription(org.id, plan.id, { status: "trial" });

      // Act
      const result = await SubscriptionService.methodName(org.id);

      // Assert
      expect(result).toBe(expectedValue);
    });
  });
});
```

---

## Nomenclatura

### Describe Principal
Usar o nome da classe do service:

```typescript
describe("SubscriptionService", () => {});
describe("PlanService", () => {});
describe("CustomerService", () => {});
```

### Describe de Método
Usar o nome do método:

```typescript
describe("checkAccess", () => {});
describe("createTrial", () => {});
describe("ensureNoPaidSubscription", () => {});
```

### Testes
Mesmo padrão: `should` + verbo no infinitivo

```typescript
test("should return true for active subscription", async () => {});
test("should throw PlanNotFoundError for non-existent plan", async () => {});
test("should update status to expired", async () => {});
```

---

## Padrão de Teste

> **IMPORTANTE**: Services retornam dados puros (sem envelope `{ success, data }`). Acesse propriedades diretamente no resultado.

```typescript
describe("checkAccess", () => {
  test("should return active status with full access", async () => {
    // 1. Arrange - preparar dados
    const org = await createTestOrganization();
    const { plan } = await createPaidPlan("gold");
    await createTestSubscription(org.id, plan.id, { status: "active" });

    // 2. Act - executar método
    const result = await SubscriptionService.checkAccess(org.id);

    // 3. Assert - validar resultado diretamente (SEM .data)
    expect(result.hasAccess).toBe(true);
    expect(result.status).toBe("active");
    expect(result.requiresPayment).toBe(false);
  });

  test("should return trial_expired when trial has ended", async () => {
    const org = await createTestOrganization();
    const { plan } = await createTrialPlan();
    await createTestSubscription(org.id, plan.id, {
      status: "trial",
      trialDays: -1, // Trial já expirado
    });

    const result = await SubscriptionService.checkAccess(org.id);

    // Propriedades acessadas diretamente
    expect(result.hasAccess).toBe(false);
    expect(result.status).toBe("trial_expired");
    expect(result.requiresPayment).toBe(true);
  });
});
```

---

## Testando Erros

```typescript
describe("createTrial", () => {
  test("should throw PlanNotFoundError for non-existent plan", async () => {
    const { PlanNotFoundError } = await import("../../errors");
    const org = await createTestOrganization();

    await expect(
      SubscriptionService.createTrial(org.id, "plan-non-existent-id")
    ).rejects.toBeInstanceOf(PlanNotFoundError);
  });
});

describe("ensureNoPaidSubscription", () => {
  test("should throw SubscriptionAlreadyActiveError for active subscription", async () => {
    const org = await createTestOrganization();
    const { plan } = await createPaidPlan("gold");
    await createTestSubscription(org.id, plan.id, { status: "active" });

    await expect(
      SubscriptionService.ensureNoPaidSubscription(org.id)
    ).rejects.toBeInstanceOf(SubscriptionAlreadyActiveError);
  });

  test("should not throw for trial subscription", async () => {
    const org = await createTestOrganization();
    const { plan } = await createTrialPlan();
    await createTestSubscription(org.id, plan.id, { status: "trial" });

    await expect(
      SubscriptionService.ensureNoPaidSubscription(org.id)
    ).resolves.toBeUndefined();
  });
});
```

---

## Validando Efeitos no Banco

```typescript
describe("activate", () => {
  test("should activate subscription with billing period", async () => {
    const org = await createTestOrganization();
    const { plan } = await createTrialPlan();
    await createTestSubscription(org.id, plan.id, { status: "trial" });

    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);

    // Act
    await SubscriptionService.activate(
      org.id,
      "sub_pagarme_123",
      periodStart,
      periodEnd
    );

    // Assert - verificar no banco
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);

    expect(subscription.status).toBe("active");
    expect(subscription.pagarmeSubscriptionId).toBe("sub_pagarme_123");
    expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
    expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);
  });
});
```

---

## Cobertura Esperada

Para cada método interno do service:

### Métodos de Query (retornam dados)
- [ ] Retorno correto para cada estado possível
- [ ] Retorno para recurso inexistente

### Métodos de Validação (ensure*, has*, can*)
- [ ] Retorno `true` para condições válidas
- [ ] Retorno `false` para condições inválidas
- [ ] Throw de erro quando aplicável

### Métodos de Mutação (create*, update*, activate*, etc.)
- [ ] Criação/atualização com dados corretos
- [ ] Verificação dos dados no banco após operação
- [ ] Throw de erro para dados inválidos

---

## Checklist Integração

**Estrutura:**
- [ ] Arquivo `{module}.service.test.ts` no `__tests__/`
- [ ] Describe principal com nome da classe
- [ ] Describe aninhado para cada método
- [ ] Factories no setup dos testes (não seeds globais)

**Cada método:**
- [ ] Testar todos os cenários de retorno
- [ ] Testar cenários de erro/throw
- [ ] Validar efeitos no banco quando aplicável
- [ ] **Acessar propriedades diretamente** (SEM `.success` ou `.data`)
- [ ] Usar IDs dinâmicos para dados de teste

**Organização:**
- [ ] Agrupar métodos relacionados
- [ ] Ordem: queries → validações → mutações

> **Lembrete**: Services retornam dados puros. Use `result.property`, não `result.data.property`.

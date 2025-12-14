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

## Estrutura de Testes

```text
src/modules/{domain}/{module-name}/
└── __tests__/
    └── {action}-{resource}.test.ts   # Ex: create-checkout.test.ts
```

---

## Arquivo de Teste

```typescript
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { proPlan, testPlans } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/{domain}/{resource}", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  afterAll(async () => {
    // Cleanup se necessário
  });

  // Testes aqui...
});
```

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

  const memberResult = await createTestUser({ emailVerified: true });
  await addMemberToOrganization(memberResult, {
    organizationId,
    role,
  });

  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/checkout`, {
      method: "POST",
      headers: { ...memberResult.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "test-plan-pro", successUrl: "https://example.com" }),
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

  await createTestSubscription(organizationId, "test-plan-starter", status);

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
- [ ] Usuário sem organização ativa → 400 `NO_ACTIVE_ORGANIZATION`
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

```typescript
// Status HTTP
expect(response.status).toBe(200);
expect(response.status).toBe(400);

// Código de erro
const body = await response.json();
expect(body.error.code).toBe("EMAIL_NOT_VERIFIED");

// Dados de resposta
expect(body.data.checkoutUrl).toBeDefined();
expect(body.data.checkoutUrl).toBeString();
expect(body.data.checkoutUrl).toContain("pagar.me");

// Prefixos de ID
expect(body.data.paymentLinkId).toStartWith("pl_");

// Valores nulos
expect(profile.pagarmeCustomerId).toBeNull();

// Datas
expect(checkout.expiresAt).toBeInstanceOf(Date);
expect(checkout.expiresAt.getTime()).toBeGreaterThan(Date.now());

// Igualdade
expect(planAfterSecond.pagarmePlanId).toBe(firstPagarmePlanId);
```

---

## Checklist Rápido

**Novo arquivo de teste:**
- [ ] Import de `bun:test` com `describe`, `expect`, `test`, `beforeAll`, `afterAll`
- [ ] Import de `schema` de `@/db/schema`
- [ ] Describe com formato `{METHOD} /v1/{path}`
- [ ] Setup com `createTestApp()` e seeds necessários
- [ ] Cleanup no `afterAll` se necessário

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
        new Request(`${BASE_URL}/auth/api/organization/create`, {
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

## Cleanup Obrigatório

Testes de use-case criam dados reais que devem ser limpos:

```typescript
afterAll(async () => {
  // 1. Restaurar tempo real (se manipulado)
  setSystemTime();

  // 2. Limpar na ordem correta (respeitar foreign keys)
  if (organizationId) {
    await db.delete(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));
    await db.delete(schema.members)
      .where(eq(schema.members.organizationId, organizationId));
    await db.delete(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
  }

  // 3. Limpar usuário e sessões
  const [user] = await db.select().from(schema.users)
    .where(eq(schema.users.email, testEmail)).limit(1);

  if (user) {
    await db.delete(schema.sessions)
      .where(eq(schema.sessions.userId, user.id));
    await db.delete(schema.users)
      .where(eq(schema.users.id, user.id));
  }

  // 4. Limpar verificações (OTP, etc.)
  const identifier = `sign-in-otp-${testEmail}`;
  await db.delete(schema.verifications)
    .where(eq(schema.verifications.identifier, identifier));
});
```

---

## Checklist Use-Case

**Estrutura:**
- [ ] Arquivo na raiz do domínio: `{use-case}-use-case.test.ts`
- [ ] Describe principal com formato `{Use Case}: {Descrição}`
- [ ] Fases organizadas com `describe` aninhados
- [ ] Estado compartilhado via variáveis `let`

**Setup/Cleanup:**
- [ ] `beforeAll` com `createTestApp()` e seeds
- [ ] `afterAll` com cleanup completo (ordem correta de deletes)
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
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import { SubscriptionService } from "../subscription.service";

describe("SubscriptionService", () => {
  beforeAll(async () => {
    await seedPlans();
  });

  describe("methodName", () => {
    test("should {comportamento esperado}", async () => {
      // Arrange
      const org = await createTestOrganization();
      await createTestSubscription(org.id, "test-plan-pro", "trial");

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

```typescript
describe("checkAccess", () => {
  test("should return active status with full access", async () => {
    // 1. Arrange - preparar dados
    const org = await createTestOrganization();
    await createActiveSubscription(org.id, "test-plan-pro");

    // 2. Act - executar método
    const result = await SubscriptionService.checkAccess(org.id);

    // 3. Assert - validar resultado
    expect(result.hasAccess).toBe(true);
    expect(result.status).toBe("active");
    expect(result.requiresPayment).toBe(false);
  });

  test("should return trial_expired when trial has ended", async () => {
    const org = await createTestOrganization();
    await createTestSubscription(org.id, "test-plan-pro", {
      status: "trial",
      trialDays: -1, // Trial já expirado
    });

    const result = await SubscriptionService.checkAccess(org.id);

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
      SubscriptionService.createTrial(org.id, "non-existent-plan")
    ).rejects.toBeInstanceOf(PlanNotFoundError);
  });
});

describe("ensureNoPaidSubscription", () => {
  test("should throw SubscriptionAlreadyActiveError for active subscription", async () => {
    const org = await createTestOrganization();
    await createActiveSubscription(org.id, "test-plan-pro");

    await expect(
      SubscriptionService.ensureNoPaidSubscription(org.id)
    ).rejects.toBeInstanceOf(SubscriptionAlreadyActiveError);
  });

  test("should not throw for trial subscription", async () => {
    const org = await createTestOrganization();
    await createTestSubscription(org.id, "test-plan-pro", "trial");

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
    await createTestSubscription(org.id, "test-plan-pro", "trial");

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
- [ ] Seeds no `beforeAll`

**Cada método:**
- [ ] Testar todos os cenários de retorno
- [ ] Testar cenários de erro/throw
- [ ] Validar efeitos no banco quando aplicável

**Organização:**
- [ ] Agrupar métodos relacionados
- [ ] Ordem: queries → validações → mutações

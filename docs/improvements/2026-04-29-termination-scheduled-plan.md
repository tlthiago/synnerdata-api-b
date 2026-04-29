# Termination Scheduled Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cadastro de rescisões com `terminationDate` futura, mantendo o registro em status `scheduled` e o funcionário em `TERMINATION_SCHEDULED`, com cron diário promovendo para `completed`/`TERMINATED` quando a data chega.

**Architecture:** Espelha o pattern de `vacations` (status enum no DB + cron job + sync de status do funcionário). Adapta para o caso de evento pontual (sem `in_progress` intermediário). Antecipa migração futura "remover `deletedAt`/`deletedBy`" introduzindo status `canceled` que será setado em soft-delete.

**Tech Stack:** Bun + Elysia + Drizzle + PostgreSQL (backend) | Next.js + React Hook Form + Zod v4 + kubb (frontend) | `@elysiajs/cron` para jobs.

**Cross-repo:** Tasks 1-13 são no repo `synnerdata-api-b` (backend). Tasks 14-19 são no repo `synnerdata-web-n` (frontend). PR do backend deve ser mergeado primeiro para regenerar o cliente kubb.

---

## File Structure

### Backend (`synnerdata-api-b`)

| File | Action | Responsibility |
|---|---|---|
| `src/db/schema/terminations.ts` | Modify | Adicionar `terminationStatusEnum` e coluna `status` |
| `src/db/schema/employees.ts` | Modify | Adicionar `TERMINATION_SCHEDULED` ao `employeeStatusEnum` |
| `src/db/migrations/0042_*.sql` | Create | Migration gerada por drizzle-kit (revisada manualmente) |
| `src/modules/occurrences/terminations/termination.model.ts` | Modify | Remover refines de future-date, adicionar `status` ao response schema |
| `src/modules/occurrences/terminations/termination.service.ts` | Modify | Branching por data no `create`/`update`/`delete`, helper `syncEmployeeStatusForTermination` |
| `src/modules/occurrences/terminations/termination-jobs.service.ts` | Create | Job `processScheduledTerminations` (scheduled → completed) |
| `src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts` | Create | Cobre criação agendada, transição via cron, cancelamento |
| `src/modules/occurrences/terminations/__tests__/create-termination.test.ts` | Modify | Remover assertions de "future date error", adicionar caso `today = completed` |
| `src/modules/occurrences/terminations/__tests__/update-termination.test.ts` | Modify | Adicionar casos de status flip ao mover data |
| `src/modules/occurrences/terminations/__tests__/delete-termination.test.ts` | Modify | Adicionar assertion de `status = canceled` |
| `src/modules/occurrences/terminations/__tests__/termination-jobs.test.ts` | Create | Cobre o cron job isoladamente |
| `src/plugins/cron/cron-plugin.ts` | Modify | Registrar `process-scheduled-terminations` |
| `src/plugins/cron/CLAUDE.md` | Modify | Documentar o novo job |
| `src/modules/occurrences/terminations/CLAUDE.md` | Modify | Atualizar lifecycle, regras, errors |
| `src/modules/occurrences/CLAUDE.md` | Modify | Adicionar `terminationDate` à lista de exceções de "future-date OK" |

### Frontend (`synnerdata-web-n`)

| File | Action | Responsibility |
|---|---|---|
| `src/lib/api/generated/**` | Regenerate | `bun run api:generate` após backend mergeado |
| `src/app/(client)/ocorrencias/rescisoes/_components/termination-form.tsx` | Modify | Permitir datas futuras + hint visual quando `terminationDate > hoje` |
| `src/app/(client)/ocorrencias/rescisoes/_components/data-table/columns.tsx` | Modify | Coluna `status` com badge |
| `src/app/(client)/funcionarios/_components/data-table/columns.tsx` | Modify | Adicionar `TERMINATION_SCHEDULED` ao `STATUS_LABELS` |
| `src/app/(client)/funcionarios/[employeeId]/page.tsx` | Modify | Adicionar `TERMINATION_SCHEDULED` ao mapa de status (se houver) |

---

## Phase 1 — Backend (synnerdata-api-b)

### Task 1: Adicionar TERMINATION_SCHEDULED ao employee status enum

**Files:**
- Modify: `src/db/schema/employees.ts:56-62`
- Modify: `src/modules/employees/employee.model.ts:32-38` (Zod `employeeStatusValues` const é hardcoded; precisa ficar em sync com o pgEnum)

- [ ] **Step 1: Atualizar o pgEnum**

```ts
export const employeeStatusEnum = pgEnum("employee_status", [
  "ACTIVE",
  "TERMINATED",
  "ON_LEAVE",
  "ON_VACATION",
  "VACATION_SCHEDULED",
  "TERMINATION_SCHEDULED",
]);
```

- [ ] **Step 2: Atualizar o Zod `employeeStatusValues`**

```ts
const employeeStatusValues = [
  "ACTIVE",
  "TERMINATED",
  "ON_LEAVE",
  "ON_VACATION",
  "VACATION_SCHEDULED",
  "TERMINATION_SCHEDULED",
] as const;
```

- [ ] **Step 3: Verificar typecheck**

Run: `bun run lint:types`
Expected: PASS — typecheck completo do projeto sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/employees.ts
git commit -m "chore(employees): add TERMINATION_SCHEDULED to employee_status enum"
```

---

### Task 2: Adicionar terminationStatusEnum e coluna status

**Files:**
- Modify: `src/db/schema/terminations.ts`

- [ ] **Step 1: Adicionar enum e coluna `status`**

Adicionar após linha 21 (após `terminationTypeEnum`):

```ts
export const terminationStatusEnum = pgEnum("termination_status", [
  "scheduled",
  "completed",
  "canceled",
]);
```

E na definição da tabela `terminations`, após o campo `notes` e antes de `// Audit`:

```ts
    status: terminationStatusEnum("status").default("completed").notNull(),
```

Adicionar índice ao final do array de constraints:

```ts
    index("terminations_status_idx").on(table.status),
```

- [ ] **Step 2: Verificar typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/terminations.ts
git commit -m "chore(terminations): add status enum and column with default 'completed'"
```

---

### Task 3: Gerar e revisar migration

**Files:**
- Create: `src/db/migrations/0042_<auto-generated>.sql`

- [ ] **Step 1: Gerar a migration**

Run: `bun run db:generate`
Expected: arquivo `src/db/migrations/0042_*.sql` criado.

- [ ] **Step 2: Inspecionar a SQL gerada**

A migration deve conter (em ordem):

```sql
CREATE TYPE "public"."termination_status" AS ENUM('scheduled', 'completed', 'canceled');
ALTER TYPE "public"."employee_status" ADD VALUE 'TERMINATION_SCHEDULED';
ALTER TABLE "terminations" ADD COLUMN "status" "termination_status" DEFAULT 'completed' NOT NULL;
CREATE INDEX "terminations_status_idx" ON "terminations" USING btree ("status");
```

**Atenção:** PostgreSQL exige que `ALTER TYPE ADD VALUE` rode fora de uma transaction block. Drizzle-kit normalmente gera arquivos `.sql` separados quando detecta isso. Se houver dois arquivos `.sql` gerados, mantenha ambos. Se não, valide manualmente que o ALTER TYPE está antes do uso da nova coluna em outras migrations subsequentes.

- [ ] **Step 3: Adicionar backfill manual para registros soft-deleted**

Adicionar ao final do arquivo `0042_*.sql`:

```sql
--> statement-breakpoint
UPDATE "terminations" SET "status" = 'canceled' WHERE "deleted_at" IS NOT NULL;
```

Justificativa: registros já soft-deletados devem refletir o novo status `canceled`, antecipando a migração futura que removerá `deletedAt`/`deletedBy`.

- [ ] **Step 4: Aplicar migration localmente**

Run: `bun run db:migrate`
Expected: sem erros, migration aplicada.

- [ ] **Step 5: Verificar via psql/studio**

Run: `bun run db:studio`
Verificar:
- Coluna `terminations.status` existe, tipo `termination_status`, default `completed`.
- Registros existentes com `deleted_at IS NULL` têm `status = 'completed'`.
- Registros existentes com `deleted_at IS NOT NULL` têm `status = 'canceled'`.

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/0042_*.sql src/db/migrations/meta/
git commit -m "chore(db): add termination status migration with canceled backfill"
```

---

### Task 4: Atualizar Zod model — remover future-date, adicionar status

**Files:**
- Modify: `src/modules/occurrences/terminations/termination.model.ts`

- [ ] **Step 1: Remover refines de `isFutureDate`**

Em `terminationFieldsSchema` (linhas 11-50), remover os `.refine(...)` blocks de `terminationDate` e `lastWorkingDay`. Resultado:

```ts
  terminationDate: z
    .string()
    .date("Data de demissão deve ser uma data válida")
    .describe("Data de demissão"),
  // ...
  lastWorkingDay: z
    .string()
    .date("Último dia trabalhado deve ser uma data válida")
    .describe("Último dia trabalhado"),
```

Remover também o import de `isFutureDate` se não for mais usado.

- [ ] **Step 2: Adicionar `status` ao `terminationDataSchema`**

Após o campo `notes` em `terminationDataSchema` (linha 124):

```ts
  status: z
    .enum(["scheduled", "completed", "canceled"])
    .describe("Status da rescisão"),
```

- [ ] **Step 3: Verificar typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/occurrences/terminations/termination.model.ts
git commit -m "feat(terminations): allow future dates and expose status in response"
```

---

### Task 5: Helper `syncEmployeeStatusForTermination`

**Files:**
- Modify: `src/modules/occurrences/terminations/termination.service.ts`

- [ ] **Step 1: Adicionar helper privado no service**

Antes do `static async create` (linha 158), adicionar:

```ts
  private static async syncEmployeeStatusForTermination(
    employeeId: string,
    organizationId: string,
    userId: string,
    tx?: typeof db
  ): Promise<{ before: string | null; after: string }> {
    const executor = tx ?? db;

    const [activeTermination] = await executor
      .select({ status: schema.terminations.status })
      .from(schema.terminations)
      .where(
        and(
          eq(schema.terminations.employeeId, employeeId),
          eq(schema.terminations.organizationId, organizationId),
          isNull(schema.terminations.deletedAt)
        )
      )
      .limit(1);

    let nextStatus: "ACTIVE" | "TERMINATED" | "TERMINATION_SCHEDULED" = "ACTIVE";
    if (activeTermination?.status === "completed") {
      nextStatus = "TERMINATED";
    } else if (activeTermination?.status === "scheduled") {
      nextStatus = "TERMINATION_SCHEDULED";
    }

    const [employeeBefore] = await executor
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    if (employeeBefore?.status === nextStatus) {
      return { before: employeeBefore.status, after: nextStatus };
    }

    await executor
      .update(schema.employees)
      .set({ status: nextStatus, updatedBy: userId })
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId)
        )
      );

    return { before: employeeBefore?.status ?? null, after: nextStatus };
  }
```

- [ ] **Step 2: Verificar typecheck**

Run: `bun run typecheck`
Expected: PASS

(Helper ainda não usado; será integrado nas próximas tasks.)

- [ ] **Step 3: Commit**

```bash
git add src/modules/occurrences/terminations/termination.service.ts
git commit -m "feat(terminations): add syncEmployeeStatusForTermination helper"
```

---

### Task 6: Service.create — branching por data (TDD)

**Files:**
- Test: `src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts`
- Modify: `src/modules/occurrences/terminations/termination.service.ts`

- [ ] **Step 1: Criar test file (failing tests)**

```ts
import { describe, expect, test } from "bun:test";
import { createTestApp } from "@/test/support/app";
import { EmployeeFactory } from "@/test/factories/employee.factory";
import { authenticatedSession } from "@/test/factories/session.factory";

describe("POST /v1/terminations — scheduled flow", () => {
  test("creates termination with status=scheduled when terminationDate > today", async () => {
    const { app, organization } = await createTestApp();
    const session = await authenticatedSession({ organization });
    const employee = await EmployeeFactory.create({
      organizationId: organization.id,
      status: "ACTIVE",
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request("http://localhost/v1/terminations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session.cookie,
        },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: futureDateStr,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: futureDateStr,
          noticePeriodWorked: false,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("scheduled");

    const refreshed = await app.handle(
      new Request(`http://localhost/v1/employees/${employee.id}`, {
        headers: { Cookie: session.cookie },
      })
    );
    const empBody = await refreshed.json();
    expect(empBody.data.status).toBe("TERMINATION_SCHEDULED");
  });

  test("creates termination with status=completed when terminationDate is today", async () => {
    const { app, organization } = await createTestApp();
    const session = await authenticatedSession({ organization });
    const employee = await EmployeeFactory.create({
      organizationId: organization.id,
      status: "ACTIVE",
    });

    const today = new Date().toISOString().split("T")[0];

    const response = await app.handle(
      new Request("http://localhost/v1/terminations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session.cookie,
        },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: today,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: today,
          noticePeriodWorked: false,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("completed");

    const refreshed = await app.handle(
      new Request(`http://localhost/v1/employees/${employee.id}`, {
        headers: { Cookie: session.cookie },
      })
    );
    const empBody = await refreshed.json();
    expect(empBody.data.status).toBe("TERMINATED");
  });

  test("creates termination with status=completed when terminationDate is past", async () => {
    const { app, organization } = await createTestApp();
    const session = await authenticatedSession({ organization });
    const employee = await EmployeeFactory.create({
      organizationId: organization.id,
      status: "ACTIVE",
    });

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    const pastDateStr = pastDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request("http://localhost/v1/terminations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session.cookie,
        },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: pastDateStr,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: pastDateStr,
          noticePeriodWorked: false,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("completed");
  });
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts`
Expected: FAIL — body.data.status undefined ou employee.status TERMINATED em vez de TERMINATION_SCHEDULED.

- [ ] **Step 3: Implementar branching no service.create**

Substituir o método `create` em `termination.service.ts` (linhas 158-247) por:

```ts
  static async create(input: CreateTerminationInput): Promise<TerminationData> {
    const { organizationId, userId, employeeId, ...data } = input;

    const employee = await TerminationService.getEmployeeReference(
      employeeId,
      organizationId
    );

    await TerminationService.ensureNoActiveTermination(
      organizationId,
      employeeId
    );

    const today = new Date().toISOString().split("T")[0];
    const isScheduled = data.terminationDate > today;
    const status: "scheduled" | "completed" = isScheduled
      ? "scheduled"
      : "completed";

    const terminationId = `termination-${crypto.randomUUID()}`;

    const [termination] = await db
      .insert(schema.terminations)
      .values({
        id: terminationId,
        organizationId,
        employeeId,
        terminationDate: data.terminationDate,
        type: data.type,
        reason: data.reason ?? null,
        noticePeriodDays: data.noticePeriodDays ?? null,
        noticePeriodWorked: data.noticePeriodWorked,
        lastWorkingDay: data.lastWorkingDay,
        notes: data.notes ?? null,
        status,
        createdBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "termination",
      resourceId: termination.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, termination, {
        ignoredFields: TERMINATION_IGNORED_FIELDS,
      }),
    });

    const sync = await TerminationService.syncEmployeeStatusForTermination(
      employeeId,
      organizationId,
      userId
    );

    if (sync.before !== sync.after) {
      await AuditService.log({
        action: "update",
        resource: "employee",
        resourceId: employeeId,
        userId,
        organizationId,
        changes: buildAuditChanges(
          { status: sync.before },
          { status: sync.after }
        ),
      });
    }

    return {
      id: termination.id,
      organizationId: termination.organizationId,
      employee,
      terminationDate: termination.terminationDate,
      type: termination.type,
      reason: termination.reason,
      noticePeriodDays: termination.noticePeriodDays,
      noticePeriodWorked: termination.noticePeriodWorked,
      lastWorkingDay: termination.lastWorkingDay,
      notes: termination.notes,
      status: termination.status,
      createdAt: termination.createdAt,
      updatedAt: termination.updatedAt,
    } as TerminationData;
  }
```

Atualizar também os métodos `findById`, `findByIdIncludingDeleted` e `findAll` (linhas 29-66, 68-109, 249-282) para incluir o campo `status: schema.terminations.status` no `select`.

- [ ] **Step 4: Rodar testes — devem passar**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/occurrences/terminations/termination.service.ts src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts
git commit -m "feat(terminations): branch create by date — scheduled vs completed"
```

---

### Task 7: Service.update — flip imediato ao mudar terminationDate (TDD)

**Files:**
- Modify: `src/modules/occurrences/terminations/termination.service.ts`
- Modify: `src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts`

- [ ] **Step 1: Adicionar testes**

Adicionar ao `scheduled-termination.test.ts`:

```ts
describe("PUT /v1/terminations/:id — status flip on date change", () => {
  test("flips scheduled→completed when terminationDate moves to past", async () => {
    const { app, organization } = await createTestApp();
    const session = await authenticatedSession({ organization });
    const employee = await EmployeeFactory.create({
      organizationId: organization.id,
      status: "ACTIVE",
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const createRes = await app.handle(
      new Request("http://localhost/v1/terminations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: session.cookie },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: futureDateStr,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: futureDateStr,
          noticePeriodWorked: false,
        }),
      })
    );
    const created = (await createRes.json()).data;

    const today = new Date().toISOString().split("T")[0];
    const updateRes = await app.handle(
      new Request(`http://localhost/v1/terminations/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: session.cookie },
        body: JSON.stringify({
          terminationDate: today,
          lastWorkingDay: today,
        }),
      })
    );

    expect(updateRes.status).toBe(200);
    const body = await updateRes.json();
    expect(body.data.status).toBe("completed");

    const empRes = await app.handle(
      new Request(`http://localhost/v1/employees/${employee.id}`, {
        headers: { Cookie: session.cookie },
      })
    );
    expect((await empRes.json()).data.status).toBe("TERMINATED");
  });

  test("flips completed→scheduled when terminationDate moves to future", async () => {
    const { app, organization } = await createTestApp();
    const session = await authenticatedSession({ organization });
    const employee = await EmployeeFactory.create({
      organizationId: organization.id,
      status: "ACTIVE",
    });

    const today = new Date().toISOString().split("T")[0];

    const createRes = await app.handle(
      new Request("http://localhost/v1/terminations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: session.cookie },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: today,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: today,
          noticePeriodWorked: false,
        }),
      })
    );
    const created = (await createRes.json()).data;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 15);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const updateRes = await app.handle(
      new Request(`http://localhost/v1/terminations/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: session.cookie },
        body: JSON.stringify({
          terminationDate: futureDateStr,
          lastWorkingDay: futureDateStr,
        }),
      })
    );

    expect(updateRes.status).toBe(200);
    expect((await updateRes.json()).data.status).toBe("scheduled");

    const empRes = await app.handle(
      new Request(`http://localhost/v1/employees/${employee.id}`, {
        headers: { Cookie: session.cookie },
      })
    );
    expect((await empRes.json()).data.status).toBe("TERMINATION_SCHEDULED");
  });
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts`
Expected: FAIL — status não muda no update.

- [ ] **Step 3: Modificar service.update**

Substituir o método `update` em `termination.service.ts` (linhas 295-333) por:

```ts
  static async update(
    id: string,
    organizationId: string,
    input: UpdateTerminationInput
  ): Promise<TerminationData> {
    const { userId, ...data } = input;

    const existing = await TerminationService.findById(id, organizationId);
    if (!existing) {
      throw new TerminationNotFoundError(id);
    }

    const today = new Date().toISOString().split("T")[0];
    const nextTerminationDate = data.terminationDate ?? existing.terminationDate;
    const nextStatus: "scheduled" | "completed" =
      nextTerminationDate > today ? "scheduled" : "completed";

    const [updated] = await db
      .update(schema.terminations)
      .set({
        ...data,
        status: nextStatus,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.terminations.id, id),
          eq(schema.terminations.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "termination",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated, {
        ignoredFields: TERMINATION_IGNORED_FIELDS,
      }),
    });

    const sync = await TerminationService.syncEmployeeStatusForTermination(
      existing.employee.id,
      organizationId,
      userId
    );

    if (sync.before !== sync.after) {
      await AuditService.log({
        action: "update",
        resource: "employee",
        resourceId: existing.employee.id,
        userId,
        organizationId,
        changes: buildAuditChanges(
          { status: sync.before },
          { status: sync.after }
        ),
      });
    }

    return TerminationService.findByIdOrThrow(id, organizationId);
  }
```

- [ ] **Step 4: Rodar testes**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/occurrences/terminations/termination.service.ts src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts
git commit -m "feat(terminations): flip status on terminationDate change in update"
```

---

### Task 8: Service.delete — status canceled e employee revert (TDD)

**Files:**
- Modify: `src/modules/occurrences/terminations/termination.service.ts`
- Modify: `src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts`

- [ ] **Step 1: Adicionar testes**

Adicionar ao `scheduled-termination.test.ts`:

```ts
describe("DELETE /v1/terminations/:id — soft delete with canceled status", () => {
  test("sets status=canceled and reverts employee to ACTIVE when deleting scheduled", async () => {
    const { app, organization } = await createTestApp();
    const session = await authenticatedSession({ organization });
    const employee = await EmployeeFactory.create({
      organizationId: organization.id,
      status: "ACTIVE",
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const createRes = await app.handle(
      new Request("http://localhost/v1/terminations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: session.cookie },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: futureDateStr,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: futureDateStr,
          noticePeriodWorked: false,
        }),
      })
    );
    const created = (await createRes.json()).data;

    const deleteRes = await app.handle(
      new Request(`http://localhost/v1/terminations/${created.id}`, {
        method: "DELETE",
        headers: { Cookie: session.cookie },
      })
    );

    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json();
    expect(body.data.status).toBe("canceled");
    expect(body.data.deletedAt).toBeTruthy();

    const empRes = await app.handle(
      new Request(`http://localhost/v1/employees/${employee.id}`, {
        headers: { Cookie: session.cookie },
      })
    );
    expect((await empRes.json()).data.status).toBe("ACTIVE");
  });

  test("sets status=canceled and reverts employee from TERMINATED when deleting completed", async () => {
    const { app, organization } = await createTestApp();
    const session = await authenticatedSession({ organization });
    const employee = await EmployeeFactory.create({
      organizationId: organization.id,
      status: "ACTIVE",
    });

    const today = new Date().toISOString().split("T")[0];

    const createRes = await app.handle(
      new Request("http://localhost/v1/terminations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: session.cookie },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: today,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: today,
          noticePeriodWorked: false,
        }),
      })
    );
    const created = (await createRes.json()).data;

    const deleteRes = await app.handle(
      new Request(`http://localhost/v1/terminations/${created.id}`, {
        method: "DELETE",
        headers: { Cookie: session.cookie },
      })
    );

    expect(deleteRes.status).toBe(200);
    expect((await deleteRes.json()).data.status).toBe("canceled");

    const empRes = await app.handle(
      new Request(`http://localhost/v1/employees/${employee.id}`, {
        headers: { Cookie: session.cookie },
      })
    );
    expect((await empRes.json()).data.status).toBe("ACTIVE");
  });
});
```

- [ ] **Step 2: Rodar — devem falhar**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts`
Expected: FAIL — status ainda não está sendo setado para canceled.

- [ ] **Step 3: Modificar service.delete**

Substituir o método `delete` em `termination.service.ts` (linhas 335-417) por:

```ts
  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedTerminationData> {
    const existing = await TerminationService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new TerminationNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new TerminationAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.terminations)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
        status: "canceled",
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.terminations.id, id),
          eq(schema.terminations.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "termination",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        existing,
        {},
        { ignoredFields: TERMINATION_IGNORED_FIELDS }
      ),
    });

    const sync = await TerminationService.syncEmployeeStatusForTermination(
      existing.employee.id,
      organizationId,
      userId
    );

    if (sync.before !== sync.after) {
      await AuditService.log({
        action: "update",
        resource: "employee",
        resourceId: existing.employee.id,
        userId,
        organizationId,
        changes: buildAuditChanges(
          { status: sync.before },
          { status: sync.after }
        ),
      });
    }

    return {
      ...existing,
      status: "canceled",
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedTerminationData;
  }
```

Atualizar também `findByIdIncludingDeleted` para incluir `status` no select (linhas 75-94).

- [ ] **Step 4: Rodar — devem passar**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts`
Expected: PASS

- [ ] **Step 5: Atualizar `deletedTerminationDataSchema` no model**

Em `termination.model.ts:129-132`, garantir que o schema do response de delete também inclua `status`. Como `terminationDataSchema` já foi estendido com `status` na Task 4, e `deletedTerminationDataSchema = terminationDataSchema.extend(...)`, deve estar OK. Confirmar.

- [ ] **Step 6: Commit**

```bash
git add src/modules/occurrences/terminations/termination.service.ts src/modules/occurrences/terminations/__tests__/scheduled-termination.test.ts
git commit -m "feat(terminations): set status=canceled on delete and sync employee status"
```

---

### Task 9: Cron job — processScheduledTerminations (TDD)

**Files:**
- Create: `src/modules/occurrences/terminations/termination-jobs.service.ts`
- Test: `src/modules/occurrences/terminations/__tests__/termination-jobs.test.ts`

- [ ] **Step 1: Criar test file (failing)**

```ts
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { TerminationService } from "@/modules/occurrences/terminations/termination.service";
import { TerminationJobsService } from "@/modules/occurrences/terminations/termination-jobs.service";
import { createTestApp } from "@/test/support/app";
import { EmployeeFactory } from "@/test/factories/employee.factory";

describe("TerminationJobsService.processScheduledTerminations", () => {
  test("flips scheduled to completed when terminationDate <= today", async () => {
    const { organization, user } = await createTestApp();
    const employee = await EmployeeFactory.create({
      organizationId: organization.id,
      status: "ACTIVE",
    });

    // Create scheduled termination directly via service with future date
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureStr = future.toISOString().split("T")[0];

    const created = await TerminationService.create({
      employeeId: employee.id,
      terminationDate: futureStr,
      type: "DISMISSAL_WITHOUT_CAUSE",
      lastWorkingDay: futureStr,
      noticePeriodWorked: false,
      organizationId: organization.id,
      userId: user.id,
    });

    expect(created.status).toBe("scheduled");

    // Backdate the termination so the job picks it up
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await db
      .update(schema.terminations)
      .set({ terminationDate: yesterday.toISOString().split("T")[0] })
      .where(eq(schema.terminations.id, created.id));

    const result = await TerminationJobsService.processScheduledTerminations();
    expect(result.updated).toContain(created.id);

    const [refreshed] = await db
      .select({ status: schema.terminations.status })
      .from(schema.terminations)
      .where(eq(schema.terminations.id, created.id));
    expect(refreshed.status).toBe("completed");

    const [emp] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id));
    expect(emp.status).toBe("TERMINATED");
  });

  test("ignores soft-deleted terminations", async () => {
    const { organization, user } = await createTestApp();
    const employee = await EmployeeFactory.create({
      organizationId: organization.id,
      status: "ACTIVE",
    });

    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureStr = future.toISOString().split("T")[0];
    const created = await TerminationService.create({
      employeeId: employee.id,
      terminationDate: futureStr,
      type: "DISMISSAL_WITHOUT_CAUSE",
      lastWorkingDay: futureStr,
      noticePeriodWorked: false,
      organizationId: organization.id,
      userId: user.id,
    });

    await TerminationService.delete(created.id, organization.id, user.id);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await db
      .update(schema.terminations)
      .set({ terminationDate: yesterday.toISOString().split("T")[0] })
      .where(eq(schema.terminations.id, created.id));

    const result = await TerminationJobsService.processScheduledTerminations();
    expect(result.updated).not.toContain(created.id);
  });

  test("is idempotent (does not re-process completed)", async () => {
    const r1 = await TerminationJobsService.processScheduledTerminations();
    const r2 = await TerminationJobsService.processScheduledTerminations();
    expect(r2.processed).toBeLessThanOrEqual(r1.processed);
  });
});
```

- [ ] **Step 2: Rodar — devem falhar (módulo não existe)**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/termination-jobs.test.ts`
Expected: FAIL — `Cannot find module './termination-jobs.service'`

- [ ] **Step 3: Implementar o job**

Criar `src/modules/occurrences/terminations/termination-jobs.service.ts`:

```ts
import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { logger } from "@/lib/logger";
import { AuditService } from "@/modules/audit/audit.service";
import { buildAuditChanges } from "@/modules/audit/pii-redaction";

type TerminationJobResult = {
  processed: number;
  updated: string[];
};

export abstract class TerminationJobsService {
  static async processScheduledTerminations(): Promise<TerminationJobResult> {
    const today = new Date().toISOString().split("T")[0];

    const toComplete = await db
      .select({
        id: schema.terminations.id,
        employeeId: schema.terminations.employeeId,
        organizationId: schema.terminations.organizationId,
      })
      .from(schema.terminations)
      .where(
        and(
          eq(schema.terminations.status, "scheduled"),
          lte(schema.terminations.terminationDate, today),
          isNull(schema.terminations.deletedAt)
        )
      );

    const updated: string[] = [];

    for (const termination of toComplete) {
      try {
        await db
          .update(schema.terminations)
          .set({ status: "completed" })
          .where(eq(schema.terminations.id, termination.id));

        const [employeeBefore] = await db
          .select({ status: schema.employees.status })
          .from(schema.employees)
          .where(eq(schema.employees.id, termination.employeeId));

        await db
          .update(schema.employees)
          .set({ status: "TERMINATED" })
          .where(eq(schema.employees.id, termination.employeeId));

        if (employeeBefore?.status !== "TERMINATED") {
          await AuditService.log({
            action: "update",
            resource: "employee",
            resourceId: termination.employeeId,
            userId: null,
            organizationId: termination.organizationId,
            changes: buildAuditChanges(
              { status: employeeBefore?.status ?? null },
              { status: "TERMINATED" }
            ),
          });
        }

        updated.push(termination.id);
      } catch (error) {
        logger.error({
          type: "job:process-scheduled-termination:failed",
          terminationId: termination.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info({
      type: "job:process-scheduled-terminations:complete",
      processed: toComplete.length,
      updated: updated.length,
    });

    return { processed: toComplete.length, updated };
  }
}
```

**Nota:** Se `AuditService.log` exigir `userId: string` (não nullable), use um sentinel como `"system"` ou crie um helper `buildSystemAuditEntry`. Verifique a assinatura em `src/modules/audit/audit.service.ts` antes de finalizar.

- [ ] **Step 4: Rodar — devem passar**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/termination-jobs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/occurrences/terminations/termination-jobs.service.ts src/modules/occurrences/terminations/__tests__/termination-jobs.test.ts
git commit -m "feat(terminations): add scheduled termination cron job"
```

---

### Task 10: Registrar cron no plugin

**Files:**
- Modify: `src/plugins/cron/cron-plugin.ts`
- Modify: `src/plugins/cron/CLAUDE.md`

- [ ] **Step 1: Importar e registrar o job**

Em `cron-plugin.ts`, adicionar import:

```ts
import { TerminationJobsService } from "@/modules/occurrences/terminations/termination-jobs.service";
```

E adicionar `.use(...)` ao final do plugin:

```ts
  .use(
    createCronJob({
      name: "process-scheduled-terminations",
      pattern: "0 3 * * *",
      run: () => TerminationJobsService.processScheduledTerminations(),
      log: (r) => ({ updated: r.updated.length }),
    })
  );
```

- [ ] **Step 2: Atualizar CLAUDE.md do plugin**

Em `src/plugins/cron/CLAUDE.md`, adicionar linha à tabela "Jobs registrados":

```
| `process-scheduled-terminations` | `0 3 * * *` | `TerminationJobsService.processScheduledTerminations` |
```

- [ ] **Step 3: Rodar typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugins/cron/cron-plugin.ts src/plugins/cron/CLAUDE.md
git commit -m "feat(cron): register process-scheduled-terminations job"
```

---

### Task 11: Atualizar testes existentes (remover future-date errors)

**Files:**
- Modify: `src/modules/occurrences/terminations/__tests__/create-termination.test.ts`
- Modify: `src/modules/occurrences/terminations/__tests__/update-termination.test.ts`
- Modify: `src/modules/occurrences/terminations/__tests__/delete-termination.test.ts`

- [ ] **Step 1: Localizar assertions que rejeitam future date**

Run: `grep -rn "futuro\|isFutureDate\|FUTURE" src/modules/occurrences/terminations/__tests__/`
Listar cada ocorrência para revisão.

- [ ] **Step 2: Remover/inverter assertions**

Para cada teste do tipo "deve rejeitar terminationDate no futuro": converter para "deve aceitar e criar como scheduled". Se já há cobertura equivalente em `scheduled-termination.test.ts`, deletar o teste obsoleto.

- [ ] **Step 3: Atualizar response shape em `delete-termination.test.ts`**

Adicionar `expect(body.data.status).toBe("canceled")` aos testes de delete existentes.

- [ ] **Step 4: Rodar todos os testes do módulo**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/`
Expected: PASS — todos passam.

- [ ] **Step 5: Commit**

```bash
git add src/modules/occurrences/terminations/__tests__/
git commit -m "test(terminations): update existing tests for status field and future dates"
```

---

### Task 12: Atualizar CLAUDE.md do módulo

**Files:**
- Modify: `src/modules/occurrences/terminations/CLAUDE.md`
- Modify: `src/modules/occurrences/CLAUDE.md`

- [ ] **Step 1: Reescrever `terminations/CLAUDE.md`**

Substituir conteúdo por:

```markdown
# Terminations (Desligamentos)

Registro de desligamentos de funcionários com suporte a agendamento futuro.

## Business Rules

- `terminationDate` pode ser **passada, hoje ou futura**:
  - Se `terminationDate > hoje` → registro criado com `status = scheduled`, employee fica `TERMINATION_SCHEDULED`.
  - Se `terminationDate <= hoje` → registro criado com `status = completed`, employee vai para `TERMINATED`.
- `lastWorkingDay <= terminationDate` (independente de scheduled ou completed).
- `noticePeriodDays` (inteiro ≥ 0, opcional) + `noticePeriodWorked` (boolean, default false).
- `reason` (max 1000), `notes` (max 2000) — opcionais.
- Um employee só pode ter um desligamento ativo (não deletado) — `TerminationAlreadyExistsError` (409).
- Update que altera `terminationDate` flipa o `status` imediatamente (sem esperar cron).
- Soft delete seta `status = canceled` (antecipa migração futura que removerá `deletedAt`/`deletedBy`).
- Sem verificação de status do employee no create — TERMINATION_SCHEDULED não bloqueia outras ocorrências.

## Status Lifecycle

- `scheduled` — `terminationDate` no futuro. Employee em `TERMINATION_SCHEDULED`.
- `completed` — `terminationDate <= hoje`. Employee em `TERMINATED`.
- `canceled` — soft-deleted. Employee revertido (ACTIVE se não houver outras terminations ativas).

Transições:
- `scheduled` → `completed`: cron `process-scheduled-terminations` (03:00 UTC / 00:00 BRT) ou update direto da data.
- `scheduled` ↔ `completed`: update da `terminationDate` move entre os estados.
- `*` → `canceled`: DELETE soft.

## Employee Status Sync

Helper `syncEmployeeStatusForTermination` consulta a única termination ativa do employee e calcula:

| Termination status | Employee status |
|---|---|
| `completed` | `TERMINATED` |
| `scheduled` | `TERMINATION_SCHEDULED` |
| `canceled` ou nenhuma ativa | `ACTIVE` |

Aplicado em create, update e delete. Sync no-op (mesmo status) não emite audit log.

## Audit logging

- Plugin: `auditPlugin` registered in controller.
- Resource key: `termination`.
- Mutations logged: create, update, delete.
- Ignored fields: `employee`, `employeeId`.
- Side effects on `employees.status` ARE audited as `resource: "employee"`.
- Cron job `process-scheduled-terminations` audita a transição employee status (scheduled→completed flip).
- **Read audit enabled** on `GET /:id` (LGPD-sensitive).

## Enums

- type: `RESIGNATION` | `DISMISSAL_WITH_CAUSE` | `DISMISSAL_WITHOUT_CAUSE` | `MUTUAL_AGREEMENT` | `CONTRACT_END`
- status: `scheduled` | `completed` | `canceled` (default `completed`)

## Errors

- `TerminationNotFoundError` (404)
- `TerminationAlreadyDeletedError` (404)
- `TerminationInvalidEmployeeError` (422)
- `TerminationAlreadyExistsError` (409) — one active termination per employee

## Scheduled Jobs

| Job | Action |
|---|---|
| `process-scheduled-terminations` | `scheduled` → `completed` quando `terminationDate <= hoje`; flipa employee para `TERMINATED` |

Registrado em `src/plugins/cron/cron-plugin.ts` em `0 3 * * *` (03:00 UTC / 00:00 BRT).
```

- [ ] **Step 2: Atualizar `occurrences/CLAUDE.md`**

Localizar a linha "Campos de data não aceitam datas no futuro (exceções: férias `startDate`/`endDate`...)" e adicionar `terminations` à lista:

> Campos de data não aceitam datas no futuro (exceções: férias `startDate`/`endDate` podem ser futuras; medical-certificates `endDate` pode ser futuro; terminations `terminationDate`/`lastWorkingDay` podem ser futuras — agendamento).

E na seção "Employee Status Validation on Create", adicionar nota:
> Ocorrências aceitam `TERMINATION_SCHEDULED` (employee com rescisão agendada ainda está ativo até a data efetiva).

- [ ] **Step 3: Commit**

```bash
git add src/modules/occurrences/terminations/CLAUDE.md src/modules/occurrences/CLAUDE.md
git commit -m "docs(terminations): document scheduled lifecycle and employee status sync"
```

---

### Task 13: Rodar todos os testes do módulo + lint + abrir PR

**Files:** N/A

- [ ] **Step 1: Rodar testes do módulo**

Run: `NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/terminations/__tests__/`
Expected: PASS — todos os testes (incluindo audit-coverage, feature-gate, etc.) passam.

- [ ] **Step 2: Rodar testes de módulos transversais**

Possíveis impactos: vacations sync (employee status), audit. Rodar:

```bash
NODE_ENV=test bun test --env-file .env.test \
  src/modules/occurrences/vacations/__tests__/ \
  src/modules/audit/__tests__/
```

Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npx ultracite check src/modules/occurrences/terminations src/plugins/cron src/db/schema/terminations.ts src/db/schema/employees.ts`
Expected: clean.

- [ ] **Step 4: Push e abrir PR para `preview`**

```bash
git push origin <branch>
gh pr create --base preview --title "feat(terminations): allow scheduled future terminations" --body "$(cat <<'EOF'
## Summary
- Adiciona suporte a `terminationDate` futura: registro fica `scheduled` e employee em `TERMINATION_SCHEDULED` até o cron flipar para `completed`/`TERMINATED`.
- Novo enum `termination_status` (`scheduled`, `completed`, `canceled`) com default `completed`.
- Novo employee status `TERMINATION_SCHEDULED`.
- Novo cron `process-scheduled-terminations` em `0 3 * * *`.
- Soft delete agora seta `status = canceled` (antecipa migração futura sem `deletedAt`).
- Update de `terminationDate` flipa status imediatamente.

## Test plan
- [ ] `bun test src/modules/occurrences/terminations/__tests__/` passa local
- [ ] CI verde
- [ ] Migration aplicada em staging com backfill correto (`canceled` para soft-deleted, `completed` para os demais)
- [ ] Cron job verificado em staging (rodar manualmente `TerminationJobsService.processScheduledTerminations()` se possível)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 2 — Frontend (synnerdata-web-n)

**Pré-requisito:** PR do backend mergeado em `preview` e cliente kubb regenerado.

### Task 14: Regenerar cliente API

**Files:**
- Regenerate: `src/lib/api/generated/**`

- [ ] **Step 1: Garantir que backend está atualizado**

```bash
cd /home/thiago-alves/Documentos/synnerdata/synnerdata-api-b
git checkout preview && git pull
```

- [ ] **Step 2: Subir backend localmente para gerar OpenAPI atualizado**

Confirmar que `bun run dev` está expondo `/swagger` ou `/openapi.json` com o novo enum.

- [ ] **Step 3: Regenerar tipos no frontend**

```bash
cd /home/thiago-alves/Documentos/synnerdata/synnerdata-web-n
git checkout preview && git pull
git checkout -b feat/scheduled-termination
bun install
bun run api:generate
```

- [ ] **Step 4: Verificar que `status` aparece nos types regenerados**

Run: `grep -rn "scheduled\|completed\|canceled" src/lib/api/generated/types/occurrences-terminations/`
Expected: novo enum aparece em `GetV1Terminations*`, `PostV1Terminations*`, etc.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/generated/
git commit -m "chore(api): regenerate kubb artifacts for termination status"
```

---

### Task 15: Form aceita datas futuras + hint visual

**Files:**
- Modify: `src/app/(client)/ocorrencias/rescisoes/_components/termination-form.tsx`

- [ ] **Step 1: Verificar se há bloqueio cliente para future-date**

Inspecionar `terminationFormSchema` (linhas 42-86). Não há `refine` de future-date no schema atual — bom. DatePicker não bloqueia futuro por default — confirmar visualmente.

- [ ] **Step 2: Adicionar hint condicional**

Após o bloco do `Controller name="terminationDate"` (linha ~244), adicionar:

```tsx
{(() => {
  const terminationDate = form.watch("terminationDate");
  const today = new Date().toISOString().split("T")[0];
  if (terminationDate && terminationDate > today) {
    return (
      <p className="col-span-full -mt-2 text-muted-foreground text-sm">
        Esta rescisão será agendada. O funcionário ficará com status{" "}
        <strong>Rescisão agendada</strong> até {new Date(terminationDate).toLocaleDateString("pt-BR")}.
      </p>
    );
  }
  return null;
})()}
```

- [ ] **Step 3: Verificar typecheck**

Run: `bun run typecheck` (ou equivalente — verificar `package.json`)
Expected: PASS.

- [ ] **Step 4: Smoke test no browser**

Run: `bun run dev`
- Acessar `/ocorrencias/rescisoes/cadastrar`.
- Selecionar funcionário, escolher tipo, marcar `terminationDate` para 30 dias no futuro.
- Verificar que aparece a hint "Esta rescisão será agendada".
- Submeter. Esperar redirecionamento para listagem.
- Listar funcionários — o funcionário deve aparecer com status "Rescisão agendada" (após Task 17).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(client\)/ocorrencias/rescisoes/_components/termination-form.tsx
git commit -m "feat(rescisoes): add scheduled hint for future terminationDate"
```

---

### Task 16: Coluna status na tabela de rescisões

**Files:**
- Modify: `src/app/(client)/ocorrencias/rescisoes/_components/data-table/columns.tsx`

- [ ] **Step 1: Adicionar status label map**

No topo do arquivo (após imports, antes de `export const columns`):

```tsx
const STATUS_LABELS: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  scheduled: { label: "Agendada", variant: "outline" },
  completed: { label: "Concluída", variant: "default" },
  canceled: { label: "Cancelada", variant: "secondary" },
};
```

- [ ] **Step 2: Adicionar coluna**

Adicionar antes da coluna de actions (ou na posição que fizer sentido visualmente):

```tsx
{
  accessorKey: "status",
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Status" />
  ),
  cell: ({ row }) => {
    const status = row.getValue("status") as string;
    const info = STATUS_LABELS[status] ?? { label: status, variant: "outline" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  },
},
```

Garantir que `Badge` está importado:

```tsx
import { Badge } from "@/components/ui/badge";
```

- [ ] **Step 3: Smoke test**

Run: `bun run dev`
- Acessar `/ocorrencias/rescisoes`.
- Verificar que a tabela exibe a coluna Status com badges corretos.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(client\)/ocorrencias/rescisoes/_components/data-table/columns.tsx
git commit -m "feat(rescisoes): add status column with badge to data table"
```

---

### Task 17: Adicionar TERMINATION_SCHEDULED ao employee status map

**Files:**
- Modify: `src/app/(client)/funcionarios/_components/data-table/columns.tsx`
- Modify: `src/app/(client)/funcionarios/[employeeId]/page.tsx` (se houver mapa similar)

- [ ] **Step 1: Atualizar STATUS_LABELS em columns.tsx**

Em `src/app/(client)/funcionarios/_components/data-table/columns.tsx:16-28`, adicionar:

```tsx
  TERMINATION_SCHEDULED: { label: "Rescisão agendada", variant: "outline" },
```

- [ ] **Step 2: Procurar outros mapas de employee status**

Run: `grep -rn "ON_VACATION\|VACATION_SCHEDULED" src/ --include="*.tsx" --include="*.ts" -l`

Para cada arquivo encontrado (excluindo `src/lib/api/generated/`), verificar se há um `STATUS_LABELS` ou enum mapping local que precisa adicionar `TERMINATION_SCHEDULED`. Atualizar cada um.

Pontos prováveis (verificar):
- `src/app/(client)/funcionarios/[employeeId]/page.tsx` — exibição do status no detalhe.
- Filtros de listagem.
- `EmployeeSelect` component — verificar se aceita TERMINATION_SCHEDULED no `statusFilter` opcional.

- [ ] **Step 3: Smoke test**

Run: `bun run dev`
- Criar uma rescisão agendada via Task 15.
- Acessar `/funcionarios` — verificar que o funcionário aparece com badge "Rescisão agendada".
- Acessar `/funcionarios/<id>` — verificar status no header.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(client\)/funcionarios/
git commit -m "feat(funcionarios): add TERMINATION_SCHEDULED label across status maps"
```

---

### Task 18: Verificar EmployeeSelect e filtros de funcionário

**Files:**
- Inspect: `src/components/employee-select.tsx`

- [ ] **Step 1: Verificar comportamento atual**

O `EmployeeSelect` em `termination-form.tsx:175-186` já filtra por `["ACTIVE", "ON_LEAVE", "ON_VACATION", "VACATION_SCHEDULED"]`. Não precisa adicionar TERMINATION_SCHEDULED — esse employee já tem termination ativa, e `ensureNoActiveTermination` no backend bloqueia segundo cadastro.

Em outros forms (vacations, absences, etc.), avaliar caso a caso:
- Vacations form: se aceitar TERMINATION_SCHEDULED, ok (employee ainda pode tirar férias antes da rescisão).
- Absences/promotions/medical-certificates: idem.

Run: `grep -rn "statusFilter" src/app/\(client\)/ocorrencias/ src/app/\(client\)/funcionarios/`

Para cada `statusFilter={["ACTIVE", ...]}` encontrado, decidir:
- Se o form é para criar uma ocorrência válida durante o aviso prévio → adicionar `"TERMINATION_SCHEDULED"`.
- Se o form é para criar uma nova rescisão → manter como está.

- [ ] **Step 2: Atualizar conforme decisão**

Adicionar `"TERMINATION_SCHEDULED"` aos filtros relevantes (forms de absences, vacations, medical-certificates, ppe-deliveries, accidents, warnings, promotions).

- [ ] **Step 3: Smoke test**

Run: `bun run dev`
- Criar funcionário, criar rescisão agendada para 30 dias no futuro.
- Acessar `/ocorrencias/faltas/cadastrar` — verificar que o funcionário ainda aparece selecionável.
- Repetir para férias, atestados, etc.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(client\)/ocorrencias/
git commit -m "feat(ocorrencias): allow TERMINATION_SCHEDULED employees in occurrence forms"
```

---

### Task 19: Lint, smoke tests, abrir PR

**Files:** N/A

- [ ] **Step 1: Lint**

Run: `bun run lint` (ou equivalente do projeto)
Expected: clean.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: clean.

- [ ] **Step 3: Smoke test end-to-end**

Run: `bun run dev`
Cenários:
1. Criar rescisão agendada (data > hoje) — verificar status "Agendada" + employee "Rescisão agendada".
2. Editar a rescisão e mover data para hoje — verificar status "Concluída" + employee "Desligado".
3. Cancelar (delete) uma rescisão agendada — verificar status "Cancelada" + employee volta para "Ativo".
4. Criar nova rescisão para mesmo funcionário (após cancelar) — deve permitir.

- [ ] **Step 4: Push e abrir PR**

```bash
git push origin feat/scheduled-termination
gh pr create --base preview --title "feat(rescisoes): UI for scheduled future terminations" --body "$(cat <<'EOF'
## Summary
- Frontend mirror do PR backend "feat(terminations): allow scheduled future terminations".
- Form aceita datas futuras com hint visual indicando agendamento.
- Coluna `status` na tabela de rescisões com badges (Agendada / Concluída / Cancelada).
- `TERMINATION_SCHEDULED` adicionado aos mapas de employee status.
- `EmployeeSelect` em outros forms de ocorrências aceita employees com `TERMINATION_SCHEDULED` (continuam podendo tirar férias, faltar, etc. durante o aviso prévio).

## Test plan
- [ ] CI verde
- [ ] Smoke test: criar rescisão agendada, editar para data passada, cancelar, recriar
- [ ] Tabela de rescisões mostra coluna Status corretamente
- [ ] Tabela de funcionários mostra "Rescisão agendada"

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Todas as 6 decisões confirmadas pelo usuário estão cobertas:
  1. Status `["scheduled", "completed", "canceled"]` (com `canceled` para forward-compat) — Task 2
  2. Update flipa imediatamente — Task 7
  3. Today/passado = completed — Task 6
  4. TERMINATION_SCHEDULED aceito por outras ocorrências — Task 18 + nota em CLAUDE.md (Task 12)
  5. Migration backfill `status='completed'` por default + `canceled` para soft-deleted — Task 3
  6. Plano completo escrito em `docs/improvements/` (este arquivo)

- [x] **Placeholder scan:** Sem TBDs ou "implementar adequadamente". Todos os blocos de código estão completos.

- [x] **Type consistency:** Os nomes do helper (`syncEmployeeStatusForTermination`), do enum (`termination_status`), dos status (`scheduled`/`completed`/`canceled`) e do employee status (`TERMINATION_SCHEDULED`) são consistentes ao longo de todas as tasks.

- [x] **Cross-repo handoff:** Phase 1 (backend) ⇒ merge em `preview` ⇒ regen kubb ⇒ Phase 2 (frontend) — bloqueio explícito documentado na Task 14.

---

## Riscos e Considerações

1. **Race condition no cron:** se um update mudar `terminationDate` para "hoje" enquanto o cron está rodando, ambos podem tentar flipar para `completed`. O update é idempotente (set status = computed), e o cron filtra por `status = scheduled` antes de atualizar — sem dano real, mas pode gerar dois audit entries do mesmo flip. Aceitável.

2. **Timezone:** `new Date().toISOString().split("T")[0]` usa UTC. O cron roda às 03:00 UTC = 00:00 BRT. Para `terminationDate = 2026-05-01`, o cron de **2026-05-01 03:00 UTC** (00:00 BRT) flipa o registro — comportamento correto para o usuário no Brasil.

3. **Auditoria do cron sem userId:** `processScheduledTerminations` não tem `userId` (é jobs do sistema). A nota na Task 9 instrui a verificar `AuditService.log` — se exigir userId não-null, criar sentinel `"system"` ou usar variante `logSystemEvent`.

4. **`ensureNoActiveTermination`:** continua filtrando por `deletedAt IS NULL`. Quando a migração futura remover `deletedAt`, esse filtro precisará ser substituído por `status != 'canceled'`. Não escopo deste plano — adicionar ao backlog da migração futura.

5. **Datas extremas:** sem upper bound em `terminationDate`. Usuário poderia agendar rescisão para 2050. Não bloqueamos — produto pode adicionar limite depois se virar problema.

6. **CPF unique index:** o índice parcial `WHERE deleted_at IS NULL AND status != 'TERMINATED'` continua bloqueando o CPF até o flip. Funcionário em `TERMINATION_SCHEDULED` ainda bloqueia recontratação até a data efetiva. Comportamento correto.

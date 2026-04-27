# Audit Coverage Expansion — Implementation Plan (PRD #1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up audit logging on all 14 in-scope domain modules that currently lack `auditPlugin` integration, so `audit_logs` becomes the authoritative deletion attribution source ahead of dropping `deletedBy` in PRD #3 of the user-attribution roadmap.

**Architecture:** Each in-scope module (a) registers `auditPlugin` in its controller after `betterAuthPlugin`, (b) calls `AuditService.log` from inside the service for every `create`/`update`/`delete` operation using `buildAuditChanges` for PII-safe minimal diffs (per CP-42), and (c) optionally adds `audit({ action: "read" })` on `GET /:id` if the module exposes Art. 11/18 LGPD-sensitive data. The `AuditResource` Zod enum is expanded with new keys per module so audit entries carry semantic resource names. Pattern mirrors what is already in production for `medical-certificates`, `employees`, `cpf-analyses`, `labor-lawsuits`, `payments/subscription`, `admin/api-keys`, and `organizations/profile`.

**Tech Stack:** Bun + Elysia + Drizzle + PostgreSQL. Audit module at `src/modules/audit/`. Audit plugin at `src/plugins/audit/audit-plugin.ts`. PII redaction at `src/modules/audit/pii-redaction.ts`.

---

## Reference: canonical pattern

Read this section once before starting any module task — every per-module task replicates it.

### Controller wiring (`<module>/index.ts`)

Add `.use(auditPlugin)` immediately after `.use(betterAuthPlugin)` so `audit` is available in handlers:

```ts
import { auditPlugin } from "@/plugins/audit/audit-plugin";

export const xController = new Elysia({ /* ... */ })
  .use(betterAuthPlugin)
  .use(auditPlugin)
  // ...routes
```

For sensitive resources (LGPD Art. 11/18 — health data, financial, identifying PII beyond name), add `audit({ action: "read", resource, resourceId })` at the end of `GET /:id` handlers, after the service resolves successfully:

```ts
.get("/:id", async ({ session, params, audit }) => {
  const data = await XService.findByIdOrThrow(params.id, session.activeOrganizationId as string);
  await audit({
    action: "read",
    resource: "<resource_key>",
    resourceId: params.id,
  });
  return wrapSuccess(data);
}, { /* ...auth + response ... */ });
```

Read audit applies only to: medical-certificates (already done), employees (already done), cpf-analyses (already done), labor-lawsuits (already done). For modules in this plan, **no read audit** unless explicitly noted in the module-specific task.

### Service wiring (`<module>/x.service.ts`)

Import `AuditService` (lazily or eagerly) and `buildAuditChanges`:

```ts
import { AuditService } from "@/modules/audit/audit.service";
import { buildAuditChanges } from "@/modules/audit/pii-redaction";
```

After every `db.insert`, `db.update`, or soft-delete `db.update` that changes a domain row, call `AuditService.log` outside the transaction (audit is best-effort, never rolls back the user's action):

```ts
// CREATE — diff has fields only in `after`
await AuditService.log({
  action: "create",
  resource: "<resource_key>",
  resourceId: newRow.id,
  userId,
  organizationId,
  changes: buildAuditChanges({}, newRow),
});

// UPDATE — minimal diff between existing and updated
await AuditService.log({
  action: "update",
  resource: "<resource_key>",
  resourceId: id,
  userId,
  organizationId,
  changes: buildAuditChanges(existing, updated),
});

// DELETE (soft) — diff has fields only in `before`
await AuditService.log({
  action: "delete",
  resource: "<resource_key>",
  resourceId: id,
  userId,
  organizationId,
  changes: buildAuditChanges(deletedRow, {}),
});
```

`buildAuditChanges` automatically (a) keeps only fields that changed, (b) ignores metadata fields (`createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `deletedBy`), and (c) replaces PII fields with the literal `"<redacted>"`. PII set is at `src/modules/audit/pii-redaction.ts:PII_FIELDS`. If the module has PII outside that default set, pass a custom set via `buildAuditChanges(before, after, { piiFields: new Set([...PII_FIELDS, "extraField"]) })`.

### Test pattern (`<module>/__tests__/*.test.ts` or new `audit-coverage.test.ts`)

Verify that each mutation creates an `audit_logs` row with the right shape:

```ts
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestApp } from "@/test/support/app";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const app = createTestApp();

describe("audit coverage — <module>", () => {
  test("create emits audit_logs entry", async () => {
    const { headers, organizationId, user } = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(new Request(`${process.env.APP_URL}/v1/<route>`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ /* ...valid payload... */ }),
    }));
    const body = await response.json();

    const [auditEntry] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.resourceId, body.data.id));

    expect(auditEntry).toBeDefined();
    expect(auditEntry.action).toBe("create");
    expect(auditEntry.resource).toBe("<resource_key>");
    expect(auditEntry.userId).toBe(user.id);
    expect(auditEntry.organizationId).toBe(organizationId);
    expect(auditEntry.changes?.after).toBeDefined();
  });

  // analogous tests for update and delete
});
```

### Order of operations in service mutations

Pre-existing services already do the mutation + return. The audit call is **added after** the mutation succeeds and before returning. Failure of audit logging must NOT throw (it's caught inside `AuditService.log`); existing tests should continue to pass.

---

## File structure — files this plan creates or modifies

### Created
- `src/modules/<module>/__tests__/audit-coverage.test.ts` — new test file per module (14 files)

### Modified
- `src/modules/audit/audit.model.ts` — `AuditResource` Zod enum gains 14 new resource keys
- `src/modules/<module>/index.ts` — controller adds `.use(auditPlugin)` (14 files)
- `src/modules/<module>/<module>.service.ts` — service adds `AuditService.log` calls (14 files)
- `src/modules/<module>/CLAUDE.md` — module CLAUDE adds an "Audit logging" section (14 files)

### Resource keys to be added to the enum

| Module | Existing permission key | New `AuditResource` key |
|---|---|---|
| organizations/cost-centers | `costCenter` | `cost_center` |
| organizations/branches | `branch` | `branch` |
| organizations/sectors | `sector` | `sector` |
| organizations/job-positions | `jobPosition` | `job_position` |
| organizations/job-classifications | `jobClassification` | `job_classification` |
| organizations/projects | `project` | `project` |
| organizations/ppe-items | `ppeItem` | `ppe_item` |
| occurrences/absences | `absence` | `absence` |
| occurrences/accidents | `accident` | `accident` |
| occurrences/vacations | `vacation` | `vacation` |
| occurrences/promotions | `promotion` | `promotion` |
| occurrences/terminations | `termination` | `termination` |
| occurrences/warnings | `warning` | `warning` |
| occurrences/ppe-deliveries | `ppeDelivery` | `ppe_delivery` |

---

## Tasks

### Task 1: Expand `AuditResource` enum

**Files:**
- Modify: `src/modules/audit/audit.model.ts`
- Modify: `src/modules/audit/CLAUDE.md` (the Enums section list)

- [ ] **Step 1: Write the failing test**

Append to `src/modules/audit/__tests__/audit.service.test.ts`:

```ts
import { auditResourceSchema } from "../audit.model";

describe("auditResourceSchema — expanded coverage", () => {
  test.each([
    "cost_center",
    "branch",
    "sector",
    "job_position",
    "job_classification",
    "project",
    "ppe_item",
    "absence",
    "accident",
    "vacation",
    "promotion",
    "termination",
    "warning",
    "ppe_delivery",
  ])("accepts new resource key '%s'", (resource) => {
    expect(() => auditResourceSchema.parse(resource)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
NODE_ENV=test bun test --env-file .env.test src/modules/audit/__tests__/audit.service.test.ts
```
Expected: FAIL with "Invalid enum value" for the 14 new keys.

- [ ] **Step 3: Add the keys to the enum**

Open `src/modules/audit/audit.model.ts` and replace the `auditResourceSchema` definition with:

```ts
export const auditResourceSchema = z.enum([
  "user",
  "session",
  "organization",
  "member",
  "employee",
  "document",
  "medical_certificate",
  "labor_lawsuit",
  "cpf_analysis",
  "subscription",
  "export",
  "api_key",
  "invitation",
  "cost_center",
  "branch",
  "sector",
  "job_position",
  "job_classification",
  "project",
  "ppe_item",
  "absence",
  "accident",
  "vacation",
  "promotion",
  "termination",
  "warning",
  "ppe_delivery",
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
NODE_ENV=test bun test --env-file .env.test src/modules/audit/__tests__/audit.service.test.ts
```
Expected: PASS.

- [ ] **Step 5: Update audit module CLAUDE.md**

In `src/modules/audit/CLAUDE.md`, find the "## Enums" section and replace its `resource:` line with:

```
- resource: `user` | `session` | `organization` | `member` | `employee` | `document` | `medical_certificate` | `labor_lawsuit` | `cpf_analysis` | `subscription` | `export` | `api_key` | `invitation` | `cost_center` | `branch` | `sector` | `job_position` | `job_classification` | `project` | `ppe_item` | `absence` | `accident` | `vacation` | `promotion` | `termination` | `warning` | `ppe_delivery`
```

- [ ] **Step 6: Type-check and commit**

Run:
```bash
bun x tsc --noEmit 2>&1 | tail -20
```
Expected: zero errors.

```bash
git add src/modules/audit/audit.model.ts src/modules/audit/CLAUDE.md src/modules/audit/__tests__/audit.service.test.ts
git commit -m "feat(audit): expand AuditResource enum with 14 domain resource keys"
```

---

### Task 2: Wire audit on `organizations/cost-centers`

**Files:**
- Modify: `src/modules/organizations/cost-centers/index.ts`
- Modify: `src/modules/organizations/cost-centers/cost-center.service.ts`
- Create: `src/modules/organizations/cost-centers/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/organizations/cost-centers/CLAUDE.md`

Resource key: `cost_center`. No read audit (data is not LGPD Art. 11/18 sensitive — name only).

- [ ] **Step 1: Write the failing test**

Create `src/modules/organizations/cost-centers/__tests__/audit-coverage.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.APP_URL;
let app: TestApp;

beforeAll(() => {
  app = createTestApp();
});

afterEach(async () => {
  await db.delete(schema.auditLogs);
});

describe("audit coverage — cost-centers", () => {
  test("POST /v1/cost-centers emits audit_logs create entry", async () => {
    const { headers, organizationId, user } = await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(new Request(`${BASE_URL}/v1/cost-centers`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Centro Audit Test" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);

    const [entry] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.resourceId, body.data.id));
    expect(entry).toBeDefined();
    expect(entry.action).toBe("create");
    expect(entry.resource).toBe("cost_center");
    expect(entry.userId).toBe(user.id);
    expect(entry.organizationId).toBe(organizationId);
    expect(entry.changes?.after).toMatchObject({ name: "Centro Audit Test" });
  });

  test("PUT /v1/cost-centers/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, user } = await createTestUserWithOrganization({ emailVerified: true });

    const createResp = await app.handle(new Request(`${BASE_URL}/v1/cost-centers`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Antes" }),
    }));
    const created = (await createResp.json()).data;
    await db.delete(schema.auditLogs);

    const updateResp = await app.handle(new Request(`${BASE_URL}/v1/cost-centers/${created.id}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Depois" }),
    }));
    expect(updateResp.status).toBe(200);

    const [entry] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.resourceId, created.id));
    expect(entry.action).toBe("update");
    expect(entry.resource).toBe("cost_center");
    expect(entry.userId).toBe(user.id);
    expect(entry.organizationId).toBe(organizationId);
    expect(entry.changes?.before).toMatchObject({ name: "Antes" });
    expect(entry.changes?.after).toMatchObject({ name: "Depois" });
  });

  test("DELETE /v1/cost-centers/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, user } = await createTestUserWithOrganization({ emailVerified: true });

    const createResp = await app.handle(new Request(`${BASE_URL}/v1/cost-centers`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ParaDeletar" }),
    }));
    const created = (await createResp.json()).data;
    await db.delete(schema.auditLogs);

    const deleteResp = await app.handle(new Request(`${BASE_URL}/v1/cost-centers/${created.id}`, {
      method: "DELETE",
      headers,
    }));
    expect(deleteResp.status).toBe(200);

    const [entry] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.resourceId, created.id));
    expect(entry.action).toBe("delete");
    expect(entry.resource).toBe("cost_center");
    expect(entry.userId).toBe(user.id);
    expect(entry.organizationId).toBe(organizationId);
    expect(entry.changes?.before).toMatchObject({ name: "ParaDeletar" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/cost-centers/__tests__/audit-coverage.test.ts
```
Expected: FAIL — `entry` is undefined because no audit logs are emitted.

- [ ] **Step 3: Wire `auditPlugin` in the controller**

In `src/modules/organizations/cost-centers/index.ts`, add the import and the `.use()`:

```ts
import { auditPlugin } from "@/plugins/audit/audit-plugin";
```

Then in the Elysia chain, after `.use(betterAuthPlugin)`, add:

```ts
.use(auditPlugin)
```

(No read audit on GET /:id for this module — data is not LGPD-sensitive.)

- [ ] **Step 4: Add `AuditService.log` calls in service mutations**

In `src/modules/organizations/cost-centers/cost-center.service.ts`, add at the top:

```ts
import { AuditService } from "@/modules/audit/audit.service";
import { buildAuditChanges } from "@/modules/audit/pii-redaction";
```

In the `create` method, after the existing `.returning()` resolves and before the return statement, append:

```ts
await AuditService.log({
  action: "create",
  resource: "cost_center",
  resourceId: costCenter.id,
  userId,
  organizationId,
  changes: buildAuditChanges({}, costCenter),
});
```

In the `update` method, **capture the existing row before updating** (the existing `findById` already returns it; bind it to a local variable named `existing` if not already), then after the `.returning()`, append:

```ts
await AuditService.log({
  action: "update",
  resource: "cost_center",
  resourceId: id,
  userId,
  organizationId,
  changes: buildAuditChanges(existing, updated),
});
```

In the `delete` method, after the `.returning()`, append (using the soft-deleted row as `before` and `{}` as `after`):

```ts
await AuditService.log({
  action: "delete",
  resource: "cost_center",
  resourceId: id,
  userId,
  organizationId,
  changes: buildAuditChanges(existing, {}),
});
```

Where `existing` is the row fetched by `findByIdIncludingDeleted` (or equivalent) at the start of the delete method.

- [ ] **Step 5: Run audit-coverage tests to verify they pass**

Run:
```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/cost-centers/__tests__/audit-coverage.test.ts
```
Expected: PASS — all three tests green.

- [ ] **Step 6: Run the existing cost-centers test suite to verify no regression**

Run:
```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/cost-centers/__tests__/
```
Expected: PASS — pre-existing `create-cost-center.test.ts`, `list-cost-centers.test.ts`, `get-cost-center.test.ts`, `update-cost-center.test.ts`, `delete-cost-center.test.ts` plus the new `audit-coverage.test.ts` all green.

- [ ] **Step 7: Update module CLAUDE.md**

In `src/modules/organizations/cost-centers/CLAUDE.md`, add a new section before the "Permissions" section:

```markdown
## Audit logging

- Plugin: `auditPlugin` registered in controller
- Resource key: `cost_center`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Read audit: not enabled (data is not LGPD Art. 11/18 sensitive)
```

- [ ] **Step 8: Commit**

Run:
```bash
git add src/modules/organizations/cost-centers/
git commit -m "feat(audit): cover create/update/delete on cost-centers with audit_logs"
```

---

### Task 3: Wire audit on `organizations/branches`

**Files:**
- Modify: `src/modules/organizations/branches/index.ts`
- Modify: `src/modules/organizations/branches/branch.service.ts`
- Create: `src/modules/organizations/branches/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/organizations/branches/CLAUDE.md`

Resource key: `branch`. No read audit.

- [ ] **Step 1: Write the failing test**

Create `src/modules/organizations/branches/__tests__/audit-coverage.test.ts` mirroring Task 2's test structure but adapted to branches: use the route `/v1/branches`, payload required by the existing branches `create` schema (look in `branch.model.ts` for required fields — typically `name`, `cnpj`, etc.), assert `resource: "branch"`. Reuse `createTestUserWithOrganization`. Three test cases (create, update, delete).

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/branches/__tests__/audit-coverage.test.ts
```
Expected: FAIL — no audit logs emitted yet.

- [ ] **Step 3: Wire `auditPlugin` in the controller**

In `src/modules/organizations/branches/index.ts`, import `auditPlugin` and add `.use(auditPlugin)` after `.use(betterAuthPlugin)`.

- [ ] **Step 4: Add `AuditService.log` calls in service mutations**

In `src/modules/organizations/branches/branch.service.ts`, add the standard imports and append `AuditService.log` calls in `create`, `update`, `delete` using `resource: "branch"` and `buildAuditChanges` per the canonical pattern. Note: branches may have PII fields (CNPJ, address) — review `PII_FIELDS` and pass extra keys via `{ piiFields: new Set([...PII_FIELDS, "cnpj"]) }` if CNPJ is not already in the default set.

- [ ] **Step 5: Run audit-coverage tests**

Run:
```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/branches/__tests__/audit-coverage.test.ts
```
Expected: PASS.

- [ ] **Step 6: Run existing branches suite**

Run:
```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/branches/__tests__/
```
Expected: PASS, no regression.

- [ ] **Step 7: Update module CLAUDE.md**

In `src/modules/organizations/branches/CLAUDE.md`, add a new "## Audit logging" section before the "Permissions" section with content:

```markdown
## Audit logging

- Plugin: `auditPlugin` registered in controller
- Resource key: `branch`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Read audit: not enabled
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/organizations/branches/
git commit -m "feat(audit): cover create/update/delete on branches with audit_logs"
```

---

### Task 4: Wire audit on `organizations/sectors`

**Files:**
- Modify: `src/modules/organizations/sectors/index.ts`
- Modify: `src/modules/organizations/sectors/sector.service.ts`
- Create: `src/modules/organizations/sectors/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/organizations/sectors/CLAUDE.md`

Resource key: `sector`. No read audit.

- [ ] **Step 1: Write the failing test**

Create `src/modules/organizations/sectors/__tests__/audit-coverage.test.ts` with the three test cases (create, update, delete) following the canonical pattern. Route `/v1/sectors`, resource `"sector"`, valid payload per `sector.model.ts` (typically `name`).

- [ ] **Step 2: Run tests to verify they fail**

```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/sectors/__tests__/audit-coverage.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Wire `auditPlugin` in the controller**

In `src/modules/organizations/sectors/index.ts`, add the import and `.use(auditPlugin)`.

- [ ] **Step 4: Add `AuditService.log` calls in service mutations**

Append the three calls in `create`, `update`, `delete` of `sector.service.ts` with `resource: "sector"`.

- [ ] **Step 5: Run audit-coverage tests**

```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/sectors/__tests__/audit-coverage.test.ts
```
Expected: PASS.

- [ ] **Step 6: Run existing sectors suite**

```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/sectors/__tests__/
```
Expected: PASS.

- [ ] **Step 7: Update module CLAUDE.md** with `Resource key: sector` Audit logging section.

- [ ] **Step 8: Commit**

```bash
git add src/modules/organizations/sectors/
git commit -m "feat(audit): cover create/update/delete on sectors with audit_logs"
```

---

### Task 5: Wire audit on `organizations/job-positions`

**Files:**
- Modify: `src/modules/organizations/job-positions/index.ts`
- Modify: `src/modules/organizations/job-positions/job-position.service.ts`
- Create: `src/modules/organizations/job-positions/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/organizations/job-positions/CLAUDE.md`

Resource key: `job_position`. No read audit.

All 8 steps follow the canonical pattern at the top of this plan with `resource: "job_position"`, route `/v1/job-positions`, and valid payload per `src/modules/organizations/job-positions/job-position.model.ts:createSchema`.

- [ ] **Step 1: Write the failing test** apply the canonical test pattern from the "Reference" section at the top of this document, substituting route `/v1/job-positions`, resource key `"job_position"`, and a valid payload per `src/modules/organizations/job-positions/job-position.model.ts:createSchema`
- [ ] **Step 2: Run tests to verify they fail**

```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/job-positions/__tests__/audit-coverage.test.ts
```

- [ ] **Step 3: Wire `auditPlugin`** (`src/modules/organizations/job-positions/index.ts`)
- [ ] **Step 4: Add `AuditService.log` calls** (`job-position.service.ts`)
- [ ] **Step 5: Run audit-coverage tests** — Expected: PASS
- [ ] **Step 6: Run existing job-positions suite** — Expected: PASS
- [ ] **Step 7: Update CLAUDE.md** with `Resource key: job_position`
- [ ] **Step 8: Commit**

```bash
git add src/modules/organizations/job-positions/
git commit -m "feat(audit): cover create/update/delete on job-positions with audit_logs"
```

---

### Task 6: Wire audit on `organizations/job-classifications`

**Files:**
- Modify: `src/modules/organizations/job-classifications/index.ts`
- Modify: `src/modules/organizations/job-classifications/job-classification.service.ts`
- Create: `src/modules/organizations/job-classifications/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/organizations/job-classifications/CLAUDE.md`

Resource key: `job_classification`. No read audit. Route `/v1/job-classifications`.

- [ ] **Step 1: Write failing test** (canonical pattern, three cases)
- [ ] **Step 2: Run, expect FAIL**

```bash
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/job-classifications/__tests__/audit-coverage.test.ts
```

- [ ] **Step 3: Wire `auditPlugin` in controller**
- [ ] **Step 4: Add `AuditService.log` in service** (`resource: "job_classification"`)
- [ ] **Step 5: Run audit tests, expect PASS**
- [ ] **Step 6: Run existing job-classifications suite, expect PASS**
- [ ] **Step 7: Update CLAUDE.md**
- [ ] **Step 8: Commit**

```bash
git add src/modules/organizations/job-classifications/
git commit -m "feat(audit): cover create/update/delete on job-classifications with audit_logs"
```

---

### Task 7: Wire audit on `organizations/projects`

**Files:**
- Modify: `src/modules/organizations/projects/index.ts`
- Modify: `src/modules/organizations/projects/project.service.ts`
- Create: `src/modules/organizations/projects/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/organizations/projects/CLAUDE.md`

Resource key: `project`. No read audit. Route `/v1/projects`. Note: projects has M2M with employees via `project_employees`. The audit covers the project entity itself (create/update/delete of project rows), not the M2M associations — those are separate operations and out of scope for this task. If `project.service.ts` exposes `addEmployee`/`removeEmployee` as separate service methods, they may need their own audit coverage in a follow-up; flag in the task's commit message.

All 8 steps below follow the canonical pattern from the "Reference" section at the top. Use `resource: "project"`, route `/v1/projects`, and a valid payload per `src/modules/organizations/projects/project.model.ts:createSchema` (typically `name`, `startDate`, plus other required fields).

- [ ] **Step 1**: Write failing audit-coverage tests (3 cases — create, update, delete) following the canonical test pattern at the top of this document.
- [ ] **Step 2**: Run tests, expect FAIL
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/organizations/projects/__tests__/audit-coverage.test.ts
  ```
- [ ] **Step 3**: Wire `auditPlugin` in `src/modules/organizations/projects/index.ts` after `betterAuthPlugin` per the canonical controller pattern.
- [ ] **Step 4**: Add `AuditService.log` calls in `project.service.ts` for `create`, `update`, `delete` per the canonical service pattern with `resource: "project"`.
- [ ] **Step 5**: Run audit-coverage tests, expect PASS
- [ ] **Step 6**: Run pre-existing projects suite, expect PASS
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/organizations/projects/__tests__/
  ```
- [ ] **Step 7**: Add Audit logging section to `src/modules/organizations/projects/CLAUDE.md` with `Resource key: project`, no read audit.
- [ ] **Step 8**: Commit

```bash
git add src/modules/organizations/projects/
git commit -m "feat(audit): cover create/update/delete on projects with audit_logs"
```

---

### Task 8: Wire audit on `organizations/ppe-items`

**Files:**
- Modify: `src/modules/organizations/ppe-items/index.ts`
- Modify: `src/modules/organizations/ppe-items/ppe-item.service.ts`
- Create: `src/modules/organizations/ppe-items/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/organizations/ppe-items/CLAUDE.md`

Resource key: `ppe_item`. No read audit. Route `/v1/ppe-items`. Like projects, ppe-items has M2M with job-positions — audit covers the item entity only (M2M associations are out of scope for this task).

All 8 steps follow the canonical pattern at the top of this document. Substitutions: route `/v1/ppe-items`, resource `"ppe_item"`, payload per `src/modules/organizations/ppe-items/ppe-item.model.ts:createSchema`.

- [ ] **Step 1**: Write 3 failing audit-coverage tests (create/update/delete)
- [ ] **Step 2**: Run, expect FAIL
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/organizations/ppe-items/__tests__/audit-coverage.test.ts
  ```
- [ ] **Step 3**: Wire `auditPlugin` in `src/modules/organizations/ppe-items/index.ts`
- [ ] **Step 4**: Add `AuditService.log` calls in `ppe-item.service.ts` (create/update/delete) with `resource: "ppe_item"`
- [ ] **Step 5**: Run audit-coverage tests, expect PASS
- [ ] **Step 6**: Run pre-existing ppe-items suite, expect PASS
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/organizations/ppe-items/__tests__/
  ```
- [ ] **Step 7**: Add Audit logging section to `src/modules/organizations/ppe-items/CLAUDE.md`
- [ ] **Step 8**: Commit

```bash
git add src/modules/organizations/ppe-items/
git commit -m "feat(audit): cover create/update/delete on ppe-items with audit_logs"
```

---

### Task 9: Wire audit on `occurrences/absences`

**Files:**
- Modify: `src/modules/occurrences/absences/index.ts`
- Modify: `src/modules/occurrences/absences/absence.service.ts`
- Create: `src/modules/occurrences/absences/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/occurrences/absences/CLAUDE.md`

Resource key: `absence`. No read audit (no LGPD Art. 11/18 PII on the absence record itself; data sensitivity sits with the employee). Route `/v1/absences`. Valid create payload requires `employeeId`, `startDate`, `endDate`, `type` per `absence.model.ts`. Test must first create an employee via `createTestEmployee` from helpers before creating the absence.

All 8 steps follow the canonical pattern at the top. Substitutions: route `/v1/absences`, resource `"absence"`, payload per `src/modules/occurrences/absences/absence.model.ts:createAbsenceSchema`. **Test setup difference from Task 2**: each test must first create an employee via `createTestEmployee({ organizationId, userId })` (helper in `src/test/helpers/employee.ts` or equivalent) before posting an absence — the `employeeId` field is required.

- [ ] **Step 1**: Write 3 failing audit-coverage tests (create/update/delete) with employee setup
- [ ] **Step 2**: Run, expect FAIL
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/absences/__tests__/audit-coverage.test.ts
  ```
- [ ] **Step 3**: Wire `auditPlugin` in `src/modules/occurrences/absences/index.ts`
- [ ] **Step 4**: Add `AuditService.log` calls in `absence.service.ts` (create/update/delete) with `resource: "absence"`
- [ ] **Step 5**: Run audit-coverage tests, expect PASS
- [ ] **Step 6**: Run pre-existing absences suite, expect PASS
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/absences/__tests__/
  ```
- [ ] **Step 7**: Add Audit logging section to `src/modules/occurrences/absences/CLAUDE.md`
- [ ] **Step 8**: Commit

```bash
git add src/modules/occurrences/absences/
git commit -m "feat(audit): cover create/update/delete on absences with audit_logs"
```

---

### Task 10: Wire audit on `occurrences/accidents`

**Files:**
- Modify: `src/modules/occurrences/accidents/index.ts`
- Modify: `src/modules/occurrences/accidents/accident.service.ts`
- Create: `src/modules/occurrences/accidents/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/occurrences/accidents/CLAUDE.md`

Resource key: `accident`. **Read audit applies** — accident records may include sensitive medical/incident detail (CAT, body parts injured). Add `audit({ action: "read", resource: "accident", resourceId })` in GET `/:id` handler. Route `/v1/accidents`.

- [ ] **Step 1: Write failing tests**

Tests must cover (a) create/update/delete emit audit, AND (b) GET `/:id` emits a read audit.

Add a fourth test to the audit-coverage test file:

```ts
test("GET /v1/accidents/:id emits audit_logs read entry", async () => {
  const { headers, organizationId, user } = await createTestUserWithOrganization({ emailVerified: true });
  // ... create accident first ...
  await db.delete(schema.auditLogs);

  const response = await app.handle(new Request(`${BASE_URL}/v1/accidents/${created.id}`, {
    method: "GET",
    headers,
  }));
  expect(response.status).toBe(200);

  const [entry] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.resourceId, created.id));
  expect(entry.action).toBe("read");
  expect(entry.resource).toBe("accident");
  expect(entry.userId).toBe(user.id);
  expect(entry.organizationId).toBe(organizationId);
  expect(entry.changes).toBeNull();
});
```

- [ ] **Steps 2-3**: run tests (FAIL), wire `auditPlugin`
- [ ] **Step 4**: in the GET `/:id` handler in `index.ts`, after the service resolves, call `await audit({ action: "read", resource: "accident", resourceId: params.id })` per the canonical pattern
- [ ] **Step 5**: add `AuditService.log` calls in `accident.service.ts` `create/update/delete` with `resource: "accident"`
- [ ] **Step 6**: run audit tests, expect PASS
- [ ] **Step 7**: run existing accidents suite, expect PASS
- [ ] **Step 8**: update CLAUDE.md (note read audit enabled)
- [ ] **Step 9**: Commit

```bash
git add src/modules/occurrences/accidents/
git commit -m "feat(audit): cover create/update/delete + read on accidents with audit_logs"
```

---

### Task 11: Wire audit on `occurrences/vacations`

**Files:**
- Modify: `src/modules/occurrences/vacations/index.ts`
- Modify: `src/modules/occurrences/vacations/vacation.service.ts`
- Create: `src/modules/occurrences/vacations/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/occurrences/vacations/CLAUDE.md`

Resource key: `vacation`. No read audit. Route `/v1/vacations`. Note: `vacation.service.ts` may have additional state-transition methods (e.g., `cancel`); audit only the four core CRUD operations in this task. Test setup needs `createTestEmployee`.

All 8 steps follow the canonical pattern at the top. Substitutions: route `/v1/vacations`, resource `"vacation"`, payload per `vacation.model.ts:createSchema`. Test setup needs `createTestEmployee` to satisfy `employeeId`.

- [ ] **Step 1**: Write 3 failing audit-coverage tests (create/update/delete)
- [ ] **Step 2**: Run, expect FAIL
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/vacations/__tests__/audit-coverage.test.ts
  ```
- [ ] **Step 3**: Wire `auditPlugin` in `src/modules/occurrences/vacations/index.ts`
- [ ] **Step 4**: Add `AuditService.log` calls in `vacation.service.ts` (create/update/delete) with `resource: "vacation"`
- [ ] **Step 5**: Run audit-coverage tests, expect PASS
- [ ] **Step 6**: Run pre-existing vacations suite, expect PASS
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/vacations/__tests__/
  ```
- [ ] **Step 7**: Add Audit logging section to `src/modules/occurrences/vacations/CLAUDE.md`
- [ ] **Step 8**: Commit

```bash
git add src/modules/occurrences/vacations/
git commit -m "feat(audit): cover create/update/delete on vacations with audit_logs"
```

---

### Task 12: Wire audit on `occurrences/promotions`

**Files:**
- Modify: `src/modules/occurrences/promotions/index.ts`
- Modify: `src/modules/occurrences/promotions/promotion.service.ts`
- Create: `src/modules/occurrences/promotions/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/occurrences/promotions/CLAUDE.md`

Resource key: `promotion`. **Read audit applies** — promotion records include salary fields (PII per the existing `PII_FIELDS` set). Add read audit on GET `/:id`.

All 9 steps follow the canonical pattern at the top with `resource: "promotion"`, route `/v1/promotions`, and valid payload per `src/modules/occurrences/promotions/promotion.model.ts:createSchema`. Test setup needs `createTestEmployee`. The four test cases mirror those in Task 10 (accidents) — three mutation cases plus one read case asserting `entry.action === "read"` and `entry.changes === null`.

- [ ] **Step 1**: Write 4 failing tests (3 mutations + 1 read)
- [ ] **Step 2**: Run, expect FAIL
- [ ] **Step 3**: Wire `auditPlugin` in `src/modules/occurrences/promotions/index.ts`
- [ ] **Step 4**: Add `await audit({ action: "read", resource: "promotion", resourceId: params.id })` at end of GET `/:id` handler, after the service resolves
- [ ] **Step 5**: Add `AuditService.log` calls in `promotion.service.ts` (create/update/delete) with `resource: "promotion"`
- [ ] **Step 6**: Run audit-coverage tests, expect PASS
- [ ] **Step 7**: Run pre-existing promotions suite, expect PASS
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/promotions/__tests__/
  ```
- [ ] **Step 8**: Add Audit logging section to `src/modules/occurrences/promotions/CLAUDE.md` (note read audit enabled)
- [ ] **Step 9**: Commit

```bash
git add src/modules/occurrences/promotions/
git commit -m "feat(audit): cover create/update/delete + read on promotions with audit_logs"
```

---

### Task 13: Wire audit on `occurrences/terminations`

**Files:**
- Modify: `src/modules/occurrences/terminations/index.ts`
- Modify: `src/modules/occurrences/terminations/termination.service.ts`
- Create: `src/modules/occurrences/terminations/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/occurrences/terminations/CLAUDE.md`

Resource key: `termination`. **Read audit applies** — termination records include rescission values, hire/firing dates, reason (LGPD-relevant). Route `/v1/terminations`. Test setup needs `createTestEmployee`.

All 9 steps follow the canonical pattern at the top. Substitutions per module are listed in this task's header. The four test cases (3 mutations + 1 read) and the GET `/:id` handler change are exactly as shown in Task 10 (accidents). Run command per step uses this module's `__tests__/audit-coverage.test.ts` path.

- [ ] **Step 1**: Write failing tests — 3 mutation cases + 1 read case (4 total)
- [ ] **Step 2**: Run, expect FAIL
- [ ] **Step 3**: Wire `auditPlugin` in this module's `index.ts`
- [ ] **Step 4**: Add `audit({ action: "read", resource, resourceId })` in GET `/:id` handler
- [ ] **Step 5**: Add `AuditService.log` calls in service (create/update/delete)
- [ ] **Step 6**: Run audit-coverage tests, expect PASS
- [ ] **Step 7**: Run pre-existing module suite, expect PASS
- [ ] **Step 8**: Add Audit logging section to module CLAUDE.md (note read audit enabled)
- [ ] **Step 9**: Commit

```bash
git add src/modules/occurrences/terminations/
git commit -m "feat(audit): cover create/update/delete + read on terminations with audit_logs"
```

---

### Task 14: Wire audit on `occurrences/warnings`

**Files:**
- Modify: `src/modules/occurrences/warnings/index.ts`
- Modify: `src/modules/occurrences/warnings/warning.service.ts`
- Create: `src/modules/occurrences/warnings/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/occurrences/warnings/CLAUDE.md`

Resource key: `warning`. **Read audit applies** — disciplinary records are LGPD-sensitive (could affect employment record/reputation). Route `/v1/warnings`.

All 9 steps follow the canonical pattern at the top. Substitutions per module are listed in this task's header. The four test cases (3 mutations + 1 read) and the GET `/:id` handler change are exactly as shown in Task 10 (accidents). Run command per step uses this module's `__tests__/audit-coverage.test.ts` path.

- [ ] **Step 1**: Write failing tests — 3 mutation cases + 1 read case (4 total)
- [ ] **Step 2**: Run, expect FAIL
- [ ] **Step 3**: Wire `auditPlugin` in this module's `index.ts`
- [ ] **Step 4**: Add `audit({ action: "read", resource, resourceId })` in GET `/:id` handler
- [ ] **Step 5**: Add `AuditService.log` calls in service (create/update/delete)
- [ ] **Step 6**: Run audit-coverage tests, expect PASS
- [ ] **Step 7**: Run pre-existing module suite, expect PASS
- [ ] **Step 8**: Add Audit logging section to module CLAUDE.md (note read audit enabled)
- [ ] **Step 9**: Commit

```bash
git add src/modules/occurrences/warnings/
git commit -m "feat(audit): cover create/update/delete + read on warnings with audit_logs"
```

---

### Task 15: Wire audit on `occurrences/ppe-deliveries`

**Files:**
- Modify: `src/modules/occurrences/ppe-deliveries/index.ts`
- Modify: `src/modules/occurrences/ppe-deliveries/ppe-delivery.service.ts`
- Create: `src/modules/occurrences/ppe-deliveries/__tests__/audit-coverage.test.ts`
- Modify: `src/modules/occurrences/ppe-deliveries/CLAUDE.md`

Resource key: `ppe_delivery`. No read audit (no PII on the delivery record itself). Route `/v1/ppe-deliveries`. Test setup needs `createTestEmployee` and at least one `createTestPpeItem`.

All 8 steps follow the canonical pattern at the top. Substitutions: route `/v1/ppe-deliveries`, resource `"ppe_delivery"`, payload per `ppe-delivery.model.ts:createSchema`. Test setup needs `createTestEmployee` plus at least one `createTestPpeItem` so the delivery's `ppeItemId` resolves.

- [ ] **Step 1**: Write 3 failing audit-coverage tests (create/update/delete) with employee + ppe_item setup
- [ ] **Step 2**: Run, expect FAIL
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/ppe-deliveries/__tests__/audit-coverage.test.ts
  ```
- [ ] **Step 3**: Wire `auditPlugin` in `src/modules/occurrences/ppe-deliveries/index.ts`
- [ ] **Step 4**: Add `AuditService.log` calls in `ppe-delivery.service.ts` (create/update/delete) with `resource: "ppe_delivery"`
- [ ] **Step 5**: Run audit-coverage tests, expect PASS
- [ ] **Step 6**: Run pre-existing ppe-deliveries suite, expect PASS
  ```bash
  NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/ppe-deliveries/__tests__/
  ```
- [ ] **Step 7**: Add Audit logging section to `src/modules/occurrences/ppe-deliveries/CLAUDE.md`
- [ ] **Step 8**: Commit

```bash
git add src/modules/occurrences/ppe-deliveries/
git commit -m "feat(audit): cover create/update/delete on ppe-deliveries with audit_logs"
```

---

### Task 16: End-to-end verification

**Files:** none modified (verification only).

- [ ] **Step 1: Run all audit-coverage test files in one batch**

```bash
NODE_ENV=test bun test --env-file .env.test \
  src/modules/audit/__tests__/ \
  src/modules/organizations/cost-centers/__tests__/audit-coverage.test.ts \
  src/modules/organizations/branches/__tests__/audit-coverage.test.ts \
  src/modules/organizations/sectors/__tests__/audit-coverage.test.ts \
  src/modules/organizations/job-positions/__tests__/audit-coverage.test.ts \
  src/modules/organizations/job-classifications/__tests__/audit-coverage.test.ts \
  src/modules/organizations/projects/__tests__/audit-coverage.test.ts \
  src/modules/organizations/ppe-items/__tests__/audit-coverage.test.ts \
  src/modules/occurrences/absences/__tests__/audit-coverage.test.ts \
  src/modules/occurrences/accidents/__tests__/audit-coverage.test.ts \
  src/modules/occurrences/vacations/__tests__/audit-coverage.test.ts \
  src/modules/occurrences/promotions/__tests__/audit-coverage.test.ts \
  src/modules/occurrences/terminations/__tests__/audit-coverage.test.ts \
  src/modules/occurrences/warnings/__tests__/audit-coverage.test.ts \
  src/modules/occurrences/ppe-deliveries/__tests__/audit-coverage.test.ts
```

Expected: all green; total ~50 tests (3 mutation tests × 14 modules + 4 read tests for accidents/promotions/terminations/warnings + the enum tests).

- [ ] **Step 2: Run pre-existing module suites to confirm no regression**

Run the full module suites (one batch per module area):

```bash
# Organizations
NODE_ENV=test bun test --env-file .env.test src/modules/organizations/

# Occurrences
NODE_ENV=test bun test --env-file .env.test src/modules/occurrences/

# Audit module
NODE_ENV=test bun test --env-file .env.test src/modules/audit/
```

Expected: all green.

- [ ] **Step 3: Type-check**

```bash
bun x tsc --noEmit 2>&1 | tail -20
```

Expected: zero errors.

- [ ] **Step 4: Lint**

```bash
npx ultracite check
```

Expected: clean.

- [ ] **Step 5: Smoke verify in dev DB**

Run a minimal smoke: start dev server, create a cost-center via the API, query audit_logs to confirm an entry appeared with `resource: "cost_center"`, `action: "create"`. This validates the wire-up beyond unit tests.

```bash
psql "$DATABASE_URL" -c "SELECT resource, action, resource_id, user_id FROM audit_logs WHERE resource IN ('cost_center','branch','sector','job_position','job_classification','project','ppe_item','absence','accident','vacation','promotion','termination','warning','ppe_delivery') ORDER BY created_at DESC LIMIT 30;"
```

Expected: rows present matching the actions performed during the smoke session.

- [ ] **Step 6: Final commit and push**

If any verification revealed needed fixes, commit them with a separate `chore(audit)` commit. Otherwise no commit needed.

```bash
git push origin <branch>
```

---

## Out of scope (explicit)

- Modifying the `audit_logs` schema itself (already covered by historical CP-42/CP-43 work)
- Adding audit to `payments/*` modules other than what is already covered (`payments/subscription` already has it; expansion to checkout/billing/etc. is a separate future PRD)
- Adding audit to `admin/organizations` or `cbo-occupations` (different scope; not in the 26 in-scope tables)
- Backfilling historical audit_logs for past actions (audit only goes forward from the wire-up)
- Adding read audit to modules where it is not specified above (cost-centers, branches, sectors, job-positions, job-classifications, projects, ppe-items, absences, vacations, ppe-deliveries)

## Notes for the executor (subagent)

- Each per-module task is **independent**. A subagent can pick any task and complete it without coordination with subagents on other tasks. Task 1 (enum expansion) is a strict prerequisite — must merge first.
- After Task 1 lands, Tasks 2–15 can run in parallel via `superpowers:subagent-driven-development`.
- Task 16 is the final gate — run only after Tasks 1–15 are merged.
- Each module commit is atomic — a single failing module does not block other modules from merging.
- If a module's existing service does NOT have a clearly bound `existing` variable in the `update` method (e.g., uses raw SQL or skips the pre-fetch), modify the service to fetch existing first, mirroring the pattern in `cost-centers/cost-center.service.ts:findById`. Document the deviation in the commit message.
- If a module has additional state-transition operations beyond `create`/`update`/`delete` (e.g., `vacation.cancel`, `termination.restore`), call `AuditService.log` with the corresponding action mapped to one of `create`/`update`/`delete` (use `update` for state transitions; use `create` only for actual row inserts; use `delete` only for soft-delete or row removal). Document this mapping in the commit message.

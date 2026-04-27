import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { expectAuditEntry } from "@/test/helpers/audit";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;
let app: TestApp;

beforeAll(() => {
  app = createTestApp();
});

afterEach(async () => {
  await db.delete(schema.auditLogs);
});

type PromotionPayloadOverrides = Partial<{
  promotionDate: string;
  previousSalary: number;
  newSalary: number;
  reason: string;
  notes: string;
}>;

function buildPromotionPayload(
  employeeId: string,
  prevPosId: string,
  newPosId: string,
  overrides: PromotionPayloadOverrides = {}
) {
  return {
    employeeId,
    promotionDate: overrides.promotionDate ?? "2024-06-01",
    previousJobPositionId: prevPosId,
    newJobPositionId: newPosId,
    previousSalary: overrides.previousSalary ?? 5000,
    newSalary: overrides.newSalary ?? 7000,
    reason: overrides.reason ?? "Audit test",
    ...(overrides.notes !== undefined ? { notes: overrides.notes } : {}),
  };
}

async function createPromotionContext() {
  const ctx = await createTestUserWithOrganization({ emailVerified: true });
  const { employee } = await createTestEmployee({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  const prevPos = await createTestJobPosition({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    name: "Analista Junior",
  });
  const newPos = await createTestJobPosition({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    name: "Analista Pleno",
  });
  return { ...ctx, employee, prevPos, newPos };
}

describe("audit coverage — promotions", () => {
  test("POST /v1/promotions emits audit_logs create entry", async () => {
    const { headers, organizationId, user, employee, prevPos, newPos } =
      await createPromotionContext();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPromotionPayload(employee.id, prevPos.id, newPos.id)
        ),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const entry = await expectAuditEntry({
      resourceId: body.data.id,
      action: "create",
      resource: "promotion",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      promotionDate: "2024-06-01",
      previousSalary: "<redacted>",
      newSalary: "<redacted>",
    });
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
    expect(entry.changes?.after).not.toHaveProperty("previousJobPosition");
    expect(entry.changes?.after).not.toHaveProperty("previousJobPositionId");
    expect(entry.changes?.after).not.toHaveProperty("newJobPosition");
    expect(entry.changes?.after).not.toHaveProperty("newJobPositionId");
  });

  test("PUT /v1/promotions/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, user, employee, prevPos, newPos } =
      await createPromotionContext();

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPromotionPayload(employee.id, prevPos.id, newPos.id, {
            reason: "Antes",
          })
        ),
      })
    );
    expect(createResp.status).toBe(200);
    const created = (await createResp.json()).data;

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Depois" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "update",
      resource: "promotion",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ reason: "Antes" });
    expect(entry.changes?.after).toMatchObject({ reason: "Depois" });
    expect(entry.changes?.before).not.toHaveProperty("previousSalary");
    expect(entry.changes?.before).not.toHaveProperty("newSalary");
    expect(entry.changes?.after).not.toHaveProperty("previousSalary");
    expect(entry.changes?.after).not.toHaveProperty("newSalary");
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
    expect(entry.changes?.before).not.toHaveProperty("previousJobPosition");
    expect(entry.changes?.before).not.toHaveProperty("previousJobPositionId");
    expect(entry.changes?.before).not.toHaveProperty("newJobPosition");
    expect(entry.changes?.before).not.toHaveProperty("newJobPositionId");
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
    expect(entry.changes?.after).not.toHaveProperty("previousJobPosition");
    expect(entry.changes?.after).not.toHaveProperty("previousJobPositionId");
    expect(entry.changes?.after).not.toHaveProperty("newJobPosition");
    expect(entry.changes?.after).not.toHaveProperty("newJobPositionId");
  });

  test("DELETE /v1/promotions/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, user, employee, prevPos, newPos } =
      await createPromotionContext();

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPromotionPayload(employee.id, prevPos.id, newPos.id, {
            reason: "ParaDeletar",
          })
        ),
      })
    );
    expect(createResp.status).toBe(200);
    const created = (await createResp.json()).data;

    const deleteResp = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "delete",
      resource: "promotion",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({
      reason: "ParaDeletar",
      previousSalary: "<redacted>",
      newSalary: "<redacted>",
    });
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
    expect(entry.changes?.before).not.toHaveProperty("previousJobPosition");
    expect(entry.changes?.before).not.toHaveProperty("previousJobPositionId");
    expect(entry.changes?.before).not.toHaveProperty("newJobPosition");
    expect(entry.changes?.before).not.toHaveProperty("newJobPositionId");
  });

  test("GET /v1/promotions/:id emits audit_logs read entry", async () => {
    const { headers, organizationId, user, employee, prevPos, newPos } =
      await createPromotionContext();

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPromotionPayload(employee.id, prevPos.id, newPos.id)
        ),
      })
    );
    expect(createResp.status).toBe(200);
    const created = (await createResp.json()).data;
    await db.delete(schema.auditLogs);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/${created.id}`, {
        method: "GET",
        headers,
      })
    );
    expect(response.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "read",
      resource: "promotion",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes).toBeNull();
  });
});

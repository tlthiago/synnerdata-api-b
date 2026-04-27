import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { expectAuditEntry } from "@/test/helpers/audit";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;
let app: TestApp;

beforeAll(() => {
  app = createTestApp();
});

afterEach(async () => {
  await db.delete(schema.auditLogs);
});

function buildVacationPayload(
  employeeId: string,
  overrides: Partial<{
    notes: string;
    startDate: string;
    endDate: string;
    daysEntitled: number;
  }> = {}
) {
  return {
    employeeId,
    startDate: overrides.startDate ?? "2027-01-05",
    endDate: overrides.endDate ?? "2027-01-14",
    daysEntitled: overrides.daysEntitled ?? 10,
    daysUsed: 10,
    status: "scheduled" as const,
    notes: overrides.notes ?? "Audit test",
  };
}

describe("audit coverage — vacations", () => {
  test("POST /v1/vacations emits audit_logs create entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({
      organizationId,
      userId,
      hireDate: "2020-01-01",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildVacationPayload(employee.id)),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const entry = await expectAuditEntry({
      resourceId: body.data.id,
      action: "create",
      resource: "vacation",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      daysEntitled: 10,
      status: "scheduled",
    });
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
  });

  test("PUT /v1/vacations/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({
      organizationId,
      userId,
      hireDate: "2020-01-01",
    });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildVacationPayload(employee.id, { notes: "Antes" })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Depois" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "update",
      resource: "vacation",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ notes: "Antes" });
    expect(entry.changes?.after).toMatchObject({ notes: "Depois" });
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
  });

  test("DELETE /v1/vacations/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({
      organizationId,
      userId,
      hireDate: "2020-01-01",
    });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildVacationPayload(employee.id, { notes: "ParaDeletar" })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const deleteResp = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "delete",
      resource: "vacation",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ notes: "ParaDeletar" });
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
  });
});

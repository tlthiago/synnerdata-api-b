import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
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

describe("audit coverage — vacation side effects on employee status", () => {
  test("POST /v1/vacations emits audit_logs update entry for employee status (ACTIVE → VACATION_SCHEDULED)", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({
      organizationId,
      userId,
      hireDate: "2020-01-01",
    });
    await db.delete(schema.auditLogs);

    const resp = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2027-01-05",
          endDate: "2027-01-14",
          daysEntitled: 10,
          daysUsed: 10,
          status: "scheduled",
        }),
      })
    );
    expect(resp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: employee.id,
      action: "update",
      resource: "employee",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ status: "ACTIVE" });
    expect(entry.changes?.after).toMatchObject({
      status: "VACATION_SCHEDULED",
    });
  });

  test("DELETE /v1/vacations/:id emits audit_logs update entry for employee status reverting to ACTIVE", async () => {
    const { headers, organizationId, user, userId } =
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
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2027-02-01",
          endDate: "2027-02-10",
          daysEntitled: 10,
          daysUsed: 10,
          status: "scheduled",
        }),
      })
    );
    const created = (await createResp.json()).data;
    await db.delete(schema.auditLogs);

    const resp = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(resp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: employee.id,
      action: "update",
      resource: "employee",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({
      status: "VACATION_SCHEDULED",
    });
    expect(entry.changes?.after).toMatchObject({ status: "ACTIVE" });
  });

  test("PUT /v1/vacations/:id changing status to canceled does NOT emit redundant employee audit when status doesn't change", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({
      organizationId,
      userId,
      hireDate: "2020-01-01",
    });

    const v1Resp = await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2027-03-01",
          endDate: "2027-03-10",
          daysEntitled: 10,
          daysUsed: 10,
          status: "scheduled",
        }),
      })
    );
    const v1 = (await v1Resp.json()).data;

    await app.handle(
      new Request(`${BASE_URL}/v1/vacations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          startDate: "2027-04-01",
          endDate: "2027-04-10",
          daysEntitled: 10,
          daysUsed: 10,
          status: "scheduled",
        }),
      })
    );

    await db.delete(schema.auditLogs);

    const resp = await app.handle(
      new Request(`${BASE_URL}/v1/vacations/${v1.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "canceled" }),
      })
    );
    expect(resp.status).toBe(200);

    const employeeEntries = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.resource, "employee"));
    expect(employeeEntries).toHaveLength(0);
  });
});

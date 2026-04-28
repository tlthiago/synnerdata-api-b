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

function buildAbsencePayload(
  employeeId: string,
  overrides: Partial<{
    reason: string;
    startDate: string;
    endDate: string;
  }> = {}
) {
  return {
    employeeId,
    startDate: overrides.startDate ?? "2026-01-01",
    endDate: overrides.endDate ?? "2026-01-05",
    type: "justified" as const,
    reason: overrides.reason ?? "Audit test reason",
  };
}

describe("audit coverage — absences", () => {
  test("POST /v1/absences emits audit_logs create entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildAbsencePayload(employee.id)),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const entry = await expectAuditEntry({
      resourceId: body.data.id,
      action: "create",
      resource: "absence",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      type: "justified",
      reason: "Audit test reason",
    });
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
  });

  test("PUT /v1/absences/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/absences`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildAbsencePayload(employee.id, { reason: "Antes" })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Depois" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "update",
      resource: "absence",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ reason: "Antes" });
    expect(entry.changes?.after).toMatchObject({ reason: "Depois" });
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
  });

  test("DELETE /v1/absences/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/absences`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildAbsencePayload(employee.id, { reason: "ParaDeletar" })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const deleteResp = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "delete",
      resource: "absence",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ reason: "ParaDeletar" });
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
  });
});

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

function buildTerminationPayload(
  employeeId: string,
  overrides: Partial<{
    terminationDate: string;
    type: string;
    reason: string;
    noticePeriodDays: number;
    noticePeriodWorked: boolean;
    lastWorkingDay: string;
    notes: string;
  }> = {}
) {
  return {
    employeeId,
    terminationDate: overrides.terminationDate ?? "2026-04-15",
    type: overrides.type ?? "RESIGNATION",
    reason: overrides.reason ?? "Audit test reason",
    noticePeriodDays: overrides.noticePeriodDays ?? 30,
    noticePeriodWorked: overrides.noticePeriodWorked ?? true,
    lastWorkingDay: overrides.lastWorkingDay ?? "2026-04-15",
    notes: overrides.notes ?? "Audit test notes",
  };
}

describe("audit coverage — terminations", () => {
  test("POST /v1/terminations emits audit_logs create entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildTerminationPayload(employee.id)),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const entry = await expectAuditEntry({
      resourceId: body.data.id,
      action: "create",
      resource: "termination",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      type: "RESIGNATION",
      reason: "Audit test reason",
    });
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
  });

  test("PUT /v1/terminations/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildTerminationPayload(employee.id, { reason: "Antes" })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Depois" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "update",
      resource: "termination",
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

  test("DELETE /v1/terminations/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildTerminationPayload(employee.id, {
            reason: "ParaDeletar",
            type: "DISMISSAL_WITHOUT_CAUSE",
          })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const deleteResp = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "delete",
      resource: "termination",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({
      reason: "ParaDeletar",
      type: "DISMISSAL_WITHOUT_CAUSE",
    });
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
  });

  test("GET /v1/terminations/:id emits audit_logs read entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildTerminationPayload(employee.id)),
      })
    );
    const created = (await createResp.json()).data;
    await db.delete(schema.auditLogs);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${created.id}`, {
        method: "GET",
        headers,
      })
    );
    expect(response.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "read",
      resource: "termination",
      userId: user.id,
      organizationId,
    });
    expect(entry.action).toBe("read");
    expect(entry.resource).toBe("termination");
    expect(entry.changes).toBeNull();
  });
});

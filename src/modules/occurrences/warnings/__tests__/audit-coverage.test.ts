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

function buildWarningPayload(
  employeeId: string,
  overrides: Partial<{
    date: string;
    type: "verbal" | "written" | "suspension";
    reason: string;
    description: string;
  }> = {}
) {
  return {
    employeeId,
    date: overrides.date ?? "2026-04-15",
    type: overrides.type ?? "verbal",
    reason: overrides.reason ?? "Audit test reason",
    description: overrides.description ?? "Detalhes da advertência",
  };
}

describe("audit coverage — warnings", () => {
  test("POST /v1/warnings emits audit_logs create entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildWarningPayload(employee.id)),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const entry = await expectAuditEntry({
      resourceId: body.data.id,
      action: "create",
      resource: "warning",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      type: "verbal",
      reason: "Audit test reason",
    });
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
  });

  test("PUT /v1/warnings/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildWarningPayload(employee.id, { reason: "Antes" })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Depois" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "update",
      resource: "warning",
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

  test("DELETE /v1/warnings/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildWarningPayload(employee.id, { reason: "ParaDeletar" })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const deleteResp = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "delete",
      resource: "warning",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ reason: "ParaDeletar" });
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
  });

  test("GET /v1/warnings/:id emits audit_logs read entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/warnings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildWarningPayload(employee.id)),
      })
    );
    const created = (await createResp.json()).data;
    await db.delete(schema.auditLogs);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/warnings/${created.id}`, {
        method: "GET",
        headers,
      })
    );
    expect(response.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "read",
      resource: "warning",
      userId: user.id,
      organizationId,
    });
    expect(entry.action).toBe("read");
    expect(entry.resource).toBe("warning");
    expect(entry.changes).toBeNull();
  });
});

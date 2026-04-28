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

function buildAccidentPayload(
  employeeId: string,
  overrides: Partial<{
    date: string;
    description: string;
    nature: string;
    measuresTaken: string;
  }> = {}
) {
  return {
    employeeId,
    date: overrides.date ?? "2024-01-15",
    description: overrides.description ?? "Queda de escada durante manutenção",
    nature: overrides.nature ?? "Queda",
    measuresTaken:
      overrides.measuresTaken ?? "Primeiros socorros aplicados no local",
  };
}

describe("audit coverage — accidents", () => {
  test("POST /v1/accidents emits audit_logs create entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildAccidentPayload(employee.id)),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const entry = await expectAuditEntry({
      resourceId: body.data.id,
      action: "create",
      resource: "accident",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      nature: "Queda",
      description: "Queda de escada durante manutenção",
    });
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
  });

  test("PUT /v1/accidents/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildAccidentPayload(employee.id, { nature: "Queda" })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/accidents/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ nature: "Corte" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "update",
      resource: "accident",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ nature: "Queda" });
    expect(entry.changes?.after).toMatchObject({ nature: "Corte" });
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
    expect(entry.changes?.after).not.toHaveProperty("employee");
    expect(entry.changes?.after).not.toHaveProperty("employeeId");
  });

  test("DELETE /v1/accidents/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildAccidentPayload(employee.id, { nature: "ParaDeletar" })
        ),
      })
    );
    const created = (await createResp.json()).data;

    const deleteResp = await app.handle(
      new Request(`${BASE_URL}/v1/accidents/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "delete",
      resource: "accident",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ nature: "ParaDeletar" });
    expect(entry.changes?.before).not.toHaveProperty("employee");
    expect(entry.changes?.before).not.toHaveProperty("employeeId");
  });

  test("GET /v1/accidents/:id emits audit_logs read entry", async () => {
    const { headers, organizationId, userId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/accidents`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildAccidentPayload(employee.id)),
      })
    );
    const created = (await createResp.json()).data;
    await db.delete(schema.auditLogs);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/accidents/${created.id}`, {
        method: "GET",
        headers,
      })
    );
    expect(response.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "read",
      resource: "accident",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes).toBeNull();
  });
});

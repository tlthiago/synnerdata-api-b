import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { expectAuditEntry } from "@/test/helpers/audit";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;
let app: TestApp;

beforeAll(() => {
  app = createTestApp();
});

afterEach(async () => {
  await db.delete(schema.auditLogs);
});

function generateCno(): string {
  return Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join(
    ""
  );
}

function buildProjectPayload(
  overrides: Partial<{ name: string; description: string }> = {}
) {
  return {
    name: overrides.name ?? "Projeto Audit Test",
    description: overrides.description ?? "Descrição do projeto",
    startDate: "2026-04-01",
    cno: generateCno(),
  };
}

describe("audit coverage — projects", () => {
  test("POST /v1/projects emits audit_logs create entry", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildProjectPayload()),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const entry = await expectAuditEntry({
      resourceId: body.data.id,
      action: "create",
      resource: "project",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      name: "Projeto Audit Test",
    });
    expect(entry.changes?.after).not.toHaveProperty("employees");
  });

  test("PUT /v1/projects/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildProjectPayload({ name: "Antes" })),
      })
    );
    const created = (await createResp.json()).data;

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Depois" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "update",
      resource: "project",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ name: "Antes" });
    expect(entry.changes?.after).toMatchObject({ name: "Depois" });
    expect(entry.changes?.before).not.toHaveProperty("employees");
    expect(entry.changes?.after).not.toHaveProperty("employees");
  });

  test("DELETE /v1/projects/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildProjectPayload({ name: "ParaDeletar" })),
      })
    );
    const created = (await createResp.json()).data;

    const deleteResp = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "delete",
      resource: "project",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ name: "ParaDeletar" });
    expect(entry.changes?.before).not.toHaveProperty("employees");
  });
});

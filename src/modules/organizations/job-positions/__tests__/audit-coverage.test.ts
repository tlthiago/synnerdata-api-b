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

describe("audit coverage — job-positions", () => {
  test("POST /v1/job-positions emits audit_logs create entry", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Cargo Audit Test",
          description: "Descrição original",
        }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const entry = await expectAuditEntry({
      resourceId: body.data.id,
      action: "create",
      resource: "job_position",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      name: "Cargo Audit Test",
      description: "Descrição original",
    });
  });

  test("PUT /v1/job-positions/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Cargo Audit Test" }),
      })
    );
    const created = (await createResp.json()).data;

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Cargo Atualizado" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "update",
      resource: "job_position",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({ name: "Cargo Audit Test" });
    expect(entry.changes?.after).toMatchObject({ name: "Cargo Atualizado" });
  });

  test("DELETE /v1/job-positions/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "ParaDeletar",
          description: "Para apagar",
        }),
      })
    );
    const created = (await createResp.json()).data;

    const deleteResp = await app.handle(
      new Request(`${BASE_URL}/v1/job-positions/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: created.id,
      action: "delete",
      resource: "job_position",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({
      name: "ParaDeletar",
      description: "Para apagar",
    });
  });
});

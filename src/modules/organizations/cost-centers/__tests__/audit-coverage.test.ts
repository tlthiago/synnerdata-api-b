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
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Centro Audit Test" }),
      })
    );
    const body = await response.json();
    expect(response.status).toBe(200);

    const [entry] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.resourceId, body.data.id));
    expect(entry).toBeDefined();
    expect(entry.action).toBe("create");
    expect(entry.resource).toBe("cost_center");
    expect(entry.userId).toBe(user.id);
    expect(entry.organizationId).toBe(organizationId);
    expect(entry.changes?.after).toMatchObject({ name: "Centro Audit Test" });
  });

  test("PUT /v1/cost-centers/:id emits audit_logs update entry", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Antes" }),
      })
    );
    const created = (await createResp.json()).data;
    await db.delete(schema.auditLogs);

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Depois" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const [entry] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.resourceId, created.id));
    expect(entry.action).toBe("update");
    expect(entry.resource).toBe("cost_center");
    expect(entry.userId).toBe(user.id);
    expect(entry.organizationId).toBe(organizationId);
    expect(entry.changes?.before).toMatchObject({ name: "Antes" });
    expect(entry.changes?.after).toMatchObject({ name: "Depois" });
  });

  test("DELETE /v1/cost-centers/:id emits audit_logs delete entry", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const createResp = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ParaDeletar" }),
      })
    );
    const created = (await createResp.json()).data;
    await db.delete(schema.auditLogs);

    const deleteResp = await app.handle(
      new Request(`${BASE_URL}/v1/cost-centers/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );
    expect(deleteResp.status).toBe(200);

    const [entry] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.resourceId, created.id));
    expect(entry.action).toBe("delete");
    expect(entry.resource).toBe("cost_center");
    expect(entry.userId).toBe(user.id);
    expect(entry.organizationId).toBe(organizationId);
    expect(entry.changes?.before).toMatchObject({ name: "ParaDeletar" });
  });
});

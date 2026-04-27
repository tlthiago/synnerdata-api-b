import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { expectAuditEntry } from "@/test/helpers/audit";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestPpeItem } from "@/test/helpers/ppe-item";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;
let app: TestApp;

beforeAll(() => {
  app = createTestApp();
});

afterEach(async () => {
  await db.delete(schema.auditLogs);
});

describe("audit coverage — ppe_job_position (M2M)", () => {
  test("POST /v1/ppe-items/:id/job-positions emits audit_logs create entry", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const ppeItem = await createTestPpeItem({ organizationId, userId });
    const jobPos = await createTestJobPosition({ organizationId, userId });
    await db.delete(schema.auditLogs);

    const resp = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ jobPositionId: jobPos.id }),
      })
    );
    expect(resp.status).toBe(200);

    const [row] = await db
      .select()
      .from(schema.ppeJobPositions)
      .where(eq(schema.ppeJobPositions.ppeItemId, ppeItem.id));

    const entry = await expectAuditEntry({
      resourceId: row.id,
      action: "create",
      resource: "ppe_job_position",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      ppeItemId: ppeItem.id,
      jobPositionId: jobPos.id,
    });
  });

  test("DELETE /v1/ppe-items/:id/job-positions/:jobPositionId emits audit_logs delete entry", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const ppeItem = await createTestPpeItem({ organizationId, userId });
    const jobPos = await createTestJobPosition({ organizationId, userId });

    await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ jobPositionId: jobPos.id }),
      })
    );

    const [row] = await db
      .select()
      .from(schema.ppeJobPositions)
      .where(eq(schema.ppeJobPositions.ppeItemId, ppeItem.id));

    await db.delete(schema.auditLogs);

    const resp = await app.handle(
      new Request(
        `${BASE_URL}/v1/ppe-items/${ppeItem.id}/job-positions/${jobPos.id}`,
        { method: "DELETE", headers }
      )
    );
    expect(resp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: row.id,
      action: "delete",
      resource: "ppe_job_position",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({
      ppeItemId: ppeItem.id,
      jobPositionId: jobPos.id,
    });
  });
});

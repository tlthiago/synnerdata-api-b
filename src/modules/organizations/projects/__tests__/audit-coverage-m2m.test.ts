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

function generateCno(): string {
  return Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join(
    ""
  );
}

function buildProjectPayload() {
  return {
    name: `Projeto M2M ${crypto.randomUUID().slice(0, 8)}`,
    description: "M2M audit test",
    startDate: "2026-04-01",
    cno: generateCno(),
  };
}

describe("audit coverage — project_employee (M2M)", () => {
  test("POST /v1/projects/:id/employees emits audit_logs create entry", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const projectResp = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildProjectPayload()),
      })
    );
    const project = (await projectResp.json()).data;
    await db.delete(schema.auditLogs);

    const addResp = await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id }),
      })
    );
    expect(addResp.status).toBe(200);

    const [row] = await db
      .select()
      .from(schema.projectEmployees)
      .where(eq(schema.projectEmployees.projectId, project.id));

    const entry = await expectAuditEntry({
      resourceId: row.id,
      action: "create",
      resource: "project_employee",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      projectId: project.id,
      employeeId: employee.id,
    });
  });

  test("DELETE /v1/projects/:id/employees/:employeeId emits audit_logs delete entry", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });

    const projectResp = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildProjectPayload()),
      })
    );
    const project = (await projectResp.json()).data;

    await app.handle(
      new Request(`${BASE_URL}/v1/projects/${project.id}/employees`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id }),
      })
    );

    const [row] = await db
      .select()
      .from(schema.projectEmployees)
      .where(eq(schema.projectEmployees.projectId, project.id));

    await db.delete(schema.auditLogs);

    const removeResp = await app.handle(
      new Request(
        `${BASE_URL}/v1/projects/${project.id}/employees/${employee.id}`,
        { method: "DELETE", headers }
      )
    );
    expect(removeResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: row.id,
      action: "delete",
      resource: "project_employee",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({
      projectId: project.id,
      employeeId: employee.id,
    });
  });

  test("POST /v1/projects with employeeIds emits one create entry per association", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee: emp1, dependencies } = await createTestEmployee({
      organizationId,
      userId,
    });
    const { employee: emp2 } = await createTestEmployee({
      organizationId,
      userId,
      dependencies,
    });

    const resp = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildProjectPayload(),
          employeeIds: [emp1.id, emp2.id],
        }),
      })
    );
    expect(resp.status).toBe(200);
    const project = (await resp.json()).data;

    const rows = await db
      .select()
      .from(schema.projectEmployees)
      .where(eq(schema.projectEmployees.projectId, project.id));
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      const entry = await expectAuditEntry({
        resourceId: row.id,
        action: "create",
        resource: "project_employee",
        userId: user.id,
        organizationId,
      });
      expect(entry.changes?.after).toMatchObject({
        projectId: project.id,
        employeeId: row.employeeId,
      });
    }
  });
});

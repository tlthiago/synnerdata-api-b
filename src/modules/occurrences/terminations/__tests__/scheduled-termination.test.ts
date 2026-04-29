import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function offsetISO(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().split("T")[0];
}

describe("POST /v1/terminations — scheduled flow", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("creates termination with status=scheduled and employee TERMINATION_SCHEDULED when terminationDate > today", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = offsetISO(30);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: futureDate,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: futureDate,
          noticePeriodWorked: false,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("scheduled");

    const [empRow] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id));
    expect(empRow?.status).toBe("TERMINATION_SCHEDULED");
  });

  test("creates termination with status=completed and employee TERMINATED when terminationDate is today", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const today = todayISO();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: today,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: today,
          noticePeriodWorked: false,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("completed");

    const [empRow] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id));
    expect(empRow?.status).toBe("TERMINATED");
  });

  test("creates termination with status=completed when terminationDate is in the past", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const pastDate = offsetISO(-30);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: pastDate,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: pastDate,
          noticePeriodWorked: false,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("completed");
  });
});

describe("DELETE /v1/terminations/:id — soft delete with canceled status", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("sets status=canceled and reverts employee from TERMINATION_SCHEDULED to ACTIVE when deleting scheduled", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = offsetISO(30);
    const createRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: futureDate,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: futureDate,
          noticePeriodWorked: false,
        }),
      })
    );
    const created = (await createRes.json()).data;
    expect(created.status).toBe("scheduled");

    const deleteRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json();
    expect(body.data.status).toBe("canceled");
    expect(body.data.deletedAt).toBeTruthy();

    const [empRow] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id));
    expect(empRow?.status).toBe("ACTIVE");
  });

  test("sets status=canceled and reverts employee from TERMINATED to ACTIVE when deleting completed", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const today = todayISO();
    const createRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: today,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: today,
          noticePeriodWorked: false,
        }),
      })
    );
    const created = (await createRes.json()).data;
    expect(created.status).toBe("completed");

    const deleteRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${created.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json();
    expect(body.data.status).toBe("canceled");

    const [empRow] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id));
    expect(empRow?.status).toBe("ACTIVE");
  });
});

describe("PUT /v1/terminations/:id — status flip on date change", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("flips scheduled→completed when terminationDate moves to past", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = offsetISO(30);

    const createRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: futureDate,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: futureDate,
          noticePeriodWorked: false,
        }),
      })
    );
    const created = (await createRes.json()).data;
    expect(created.status).toBe("scheduled");

    const today = todayISO();
    const updateRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          terminationDate: today,
          lastWorkingDay: today,
        }),
      })
    );

    expect(updateRes.status).toBe(200);
    const body = await updateRes.json();
    expect(body.data.status).toBe("completed");

    const [empRow] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id));
    expect(empRow?.status).toBe("TERMINATED");
  });

  test("flips completed→scheduled when terminationDate moves to future", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const today = todayISO();

    const createRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: today,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: today,
          noticePeriodWorked: false,
        }),
      })
    );
    const created = (await createRes.json()).data;
    expect(created.status).toBe("completed");

    const futureDate = offsetISO(15);
    const updateRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          terminationDate: futureDate,
          lastWorkingDay: futureDate,
        }),
      })
    );

    expect(updateRes.status).toBe(200);
    const body = await updateRes.json();
    expect(body.data.status).toBe("scheduled");

    const [empRow] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id));
    expect(empRow?.status).toBe("TERMINATION_SCHEDULED");
  });
});

describe("Termination edge cases — invariants from PR #304", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("rejects creating a 2nd termination when the 1st is scheduled (ensureNoActiveTermination)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = offsetISO(30);
    const firstRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: futureDate,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: futureDate,
          noticePeriodWorked: false,
        }),
      })
    );
    expect(firstRes.status).toBe(200);
    const firstBody = await firstRes.json();
    expect(firstBody.data.status).toBe("scheduled");

    const farFutureDate = offsetISO(60);
    const secondRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: farFutureDate,
          type: "RESIGNATION",
          lastWorkingDay: farFutureDate,
          noticePeriodWorked: false,
        }),
      })
    );

    expect(secondRes.status).toBe(409);
    const secondBody = await secondRes.json();
    expect(secondBody.error.code).toBe("TERMINATION_ALREADY_EXISTS");
  });

  test("preserves status when update changes only reason/notes (no terminationDate change)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = offsetISO(30);
    const createRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          terminationDate: futureDate,
          type: "DISMISSAL_WITHOUT_CAUSE",
          lastWorkingDay: futureDate,
          noticePeriodWorked: false,
        }),
      })
    );
    const created = (await createRes.json()).data;
    expect(created.status).toBe("scheduled");

    const updateRes = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${created.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Reorganização de equipe",
          notes: "Observação adicional",
        }),
      })
    );

    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()).data;
    expect(updated.status).toBe("scheduled");
    expect(updated.reason).toBe("Reorganização de equipe");
    expect(updated.notes).toBe("Observação adicional");

    const [empRow] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id));
    expect(empRow?.status).toBe("TERMINATION_SCHEDULED");
  });
});

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

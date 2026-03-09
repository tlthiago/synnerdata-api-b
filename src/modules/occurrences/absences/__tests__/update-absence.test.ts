import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestAbsence } from "@/test/helpers/absence";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PUT /v1/absences/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should update absence successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const absence = await createTestAbsence({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${absence.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "unjustified",
          reason: "Updated reason",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.type).toBe("unjustified");
    expect(body.data.reason).toBe("Updated reason");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBeString();
    expect(body.data.employee.name).toBeString();
  });

  test("should reject future startDate on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const absence = await createTestAbsence({
      organizationId,
      userId: user.id,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${absence.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: futureDateStr,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("should reject non-existent absence", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/absence-nonexistent`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "justified" }),
      })
    );

    expect(response.status).toBe(404);
  });

  test("should reject overlapping absence on update with same type", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await createTestAbsence({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2024-06-01",
      endDate: "2024-06-10",
      type: "justified",
    });

    const absence2 = await createTestAbsence({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2024-06-20",
      endDate: "2024-06-25",
      type: "justified",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${absence2.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2024-06-05",
          endDate: "2024-06-15",
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("ABSENCE_OVERLAP");
  });

  test("should allow updating absence without overlap (same record)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const absence = await createTestAbsence({
      organizationId,
      userId: user.id,
      employeeId: employee.id,
      startDate: "2024-07-01",
      endDate: "2024-07-10",
      type: "justified",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${absence.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2024-07-02",
          endDate: "2024-07-08",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

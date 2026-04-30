import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestAbsence } from "@/test/helpers/absence";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/absences/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should get absence by ID successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const absence = await createTestAbsence({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${absence.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe(absence.id);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(absence.employee.id);
    expect(body.data.employee.name).toBe(absence.employee.name);
    expect(body.data.createdBy).toBeObject();
    expect(body.data.createdBy.id).toBeString();
    expect(body.data.createdBy.name).toBeString();
    expect(body.data.updatedBy).toBeObject();
    expect(body.data.updatedBy.id).toBeString();
    expect(body.data.updatedBy.name).toBeString();
  });

  test("should reject non-existent absence", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/absence-nonexistent`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
  });
});

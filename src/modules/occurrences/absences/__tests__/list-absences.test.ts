import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestAbsence } from "@/test/helpers/absence";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/absences", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should list absences successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    await createTestAbsence({ organizationId, userId: user.id });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].employee).toBeObject();
    expect(body.data[0].employee.id).toBeString();
    expect(body.data[0].employee.name).toBeString();
    expect(body.data[0].createdBy).toBeObject();
    expect(body.data[0].createdBy.id).toBeString();
    expect(body.data[0].createdBy.name).toBeString();
    expect(body.data[0].updatedBy).toBeObject();
    expect(body.data[0].updatedBy.id).toBeString();
    expect(body.data[0].updatedBy.name).toBeString();
  });

  test("should return empty list when no absences", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });
});

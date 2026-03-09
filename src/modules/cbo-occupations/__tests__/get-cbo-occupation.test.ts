import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { cboOccupations } from "@/db/schema/cbo-occupations";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

const TEST_CBO_ID = `cbo-${crypto.randomUUID()}`;

async function seedTestCboOccupation() {
  await db
    .insert(cboOccupations)
    .values({
      id: TEST_CBO_ID,
      code: "9999-99",
      title: "Test CBO Occupation",
      familyCode: "9999",
      familyTitle: "Test CBO Family",
    })
    .onConflictDoNothing();
}

describe("GET /v1/cbo-occupations/:id", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedTestCboOccupation();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations/${TEST_CBO_ID}`)
    );

    expect(response.status).toBe(401);
  });

  test("should return CBO occupation by ID", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations/${TEST_CBO_ID}`, {
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(TEST_CBO_ID);
    expect(body.data.code).toBe("9999-99");
    expect(body.data.title).toBe("Test CBO Occupation");
    expect(body.data.familyCode).toBe("9999");
    expect(body.data.familyTitle).toBe("Test CBO Family");
  });

  test("should return 404 for non-existent ID", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const nonExistentId = `cbo-${crypto.randomUUID()}`;
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/cbo-occupations/${nonExistentId}`, {
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("CBO_OCCUPATION_NOT_FOUND");
  });
});

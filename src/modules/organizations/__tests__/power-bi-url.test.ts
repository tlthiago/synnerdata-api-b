import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { addMemberToOrganization } from "@/test/helpers/organization";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/organizations/power-bi-url", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/power-bi-url`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/power-bi-url`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return null when no Power BI URL is configured", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/power-bi-url`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.url).toBeNull();
  });

  test("should return the Power BI URL when configured", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const pbUrl = "https://app.powerbi.com/view?r=test-embed-id";
    await db
      .update(schema.organizationProfiles)
      .set({ pbUrl })
      .where(eq(schema.organizationProfiles.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/power-bi-url`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.url).toBe(pbUrl);
  });

  test("should return null when organization has no profile", async () => {
    const testId = crypto.randomUUID();
    const orgId = `test-org-${testId}`;

    await db.insert(schema.organizations).values({
      id: orgId,
      name: `Test Org ${testId.slice(0, 8)}`,
      slug: `test-org-${testId.slice(0, 8)}`,
      createdAt: new Date(),
    });

    const userResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(userResult, {
      organizationId: orgId,
      role: "owner",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/power-bi-url`, {
        method: "GET",
        headers: userResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.url).toBeNull();
  });

  test("should allow viewer to access Power BI URL", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/power-bi-url`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

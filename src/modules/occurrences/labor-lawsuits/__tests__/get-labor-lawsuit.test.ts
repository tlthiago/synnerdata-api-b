import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestLaborLawsuit } from "@/test/helpers/labor-lawsuit";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/labor-lawsuits/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/labor-lawsuit-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/labor-lawsuit-123`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 for non-existent lawsuit", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/labor-lawsuit-nonexistent`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("LABOR_LAWSUIT_NOT_FOUND");
  });

  test("should return lawsuit by id", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
      plaintiff: "Maria Santos",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(lawsuit.id);
    expect(body.data.processNumber).toBe(lawsuit.processNumber);
    expect(body.data.plaintiff).toBe("Maria Santos");
    expect(body.data.employee).toBeDefined();
    expect(body.data.createdBy).toBeObject();
    expect(body.data.createdBy.id).toBeString();
    expect(body.data.createdBy.name).toBeString();
    expect(body.data.updatedBy).toBeObject();
    expect(body.data.updatedBy.id).toBeString();
    expect(body.data.updatedBy.name).toBeString();
  });

  test("should not return lawsuit from another organization", async () => {
    const user1 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const user2 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const lawsuit = await createTestLaborLawsuit({
      organizationId: user1.organizationId,
      userId: user1.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "GET",
        headers: user2.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("LABOR_LAWSUIT_NOT_FOUND");
  });

  test("should allow viewer to get lawsuit", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const lawsuit = await createTestLaborLawsuit({
      organizationId,
      userId: user.id,
    });

    const viewer = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewer, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/labor-lawsuits/${lawsuit.id}`, {
        method: "GET",
        headers: viewer.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe(lawsuit.id);
  });
});

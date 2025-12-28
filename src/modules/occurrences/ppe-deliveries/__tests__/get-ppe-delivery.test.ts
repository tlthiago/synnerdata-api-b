import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestPpeDelivery } from "@/test/helpers/ppe-delivery";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/ppe-deliveries/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/ppe-delivery-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/ppe-delivery-123`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 for non-existent delivery", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/ppe-delivery-nonexistent`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_DELIVERY_NOT_FOUND");
  });

  test("should return delivery by id", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      reason: "Admissão",
      deliveredBy: "Maria Santos",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(delivery.id);
    expect(body.data.reason).toBe("Admissão");
    expect(body.data.deliveredBy).toBe("Maria Santos");
    expect(body.data.employee).toBeDefined();
  });

  test("should not return delivery from another organization", async () => {
    const user1 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const user2 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const delivery = await createTestPpeDelivery({
      organizationId: user1.organizationId,
      userId: user1.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "GET",
        headers: user2.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_DELIVERY_NOT_FOUND");
  });

  test("should allow viewer to get delivery", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const owner = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const delivery = await createTestPpeDelivery({
      organizationId: owner.organizationId,
      userId: owner.user.id,
    });

    const viewer = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewer, {
      organizationId: owner.organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "GET",
        headers: viewer.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe(delivery.id);
  });
});

import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestPpeDelivery } from "@/test/helpers/ppe-delivery";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("DELETE /v1/ppe-deliveries/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/ppe-delivery-123`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/ppe-delivery-123`, {
        method: "DELETE",
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
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_DELIVERY_NOT_FOUND");
  });

  test("should soft delete delivery", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(delivery.id);
    expect(body.data.deletedAt).toBeDefined();
    expect(body.data.deletedBy).toBeDefined();
  });

  test("should return 404 when trying to delete already deleted delivery", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
    });

    // First delete
    await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "DELETE",
        headers,
      })
    );

    // Second delete
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_DELIVERY_ALREADY_DELETED");
  });

  test("should not delete delivery from another organization", async () => {
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
        method: "DELETE",
        headers: user2.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_DELIVERY_NOT_FOUND");
  });

  test.each([
    "viewer",
  ] as const)("should reject %s from deleting delivery", async (role) => {
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

    const member = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(member, {
      organizationId: owner.organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "DELETE",
        headers: member.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to delete delivery", async () => {
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

    const manager = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(manager, {
      organizationId: owner.organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "DELETE",
        headers: manager.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.deletedAt).toBeDefined();
  });
});

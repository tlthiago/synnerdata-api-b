import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestPpeDelivery } from "@/test/helpers/ppe-delivery";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PUT /v1/ppe-deliveries/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/ppe-delivery-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Novo motivo" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/ppe-delivery-123`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Novo motivo" }),
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
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Novo motivo" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_DELIVERY_NOT_FOUND");
  });

  test("should update delivery", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      reason: "Motivo original",
      deliveredBy: "João Silva",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "Motivo atualizado",
          deliveredBy: "Maria Santos",
          deliveryDate: "2025-12-28",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(delivery.id);
    expect(body.data.reason).toBe("Motivo atualizado");
    expect(body.data.deliveredBy).toBe("Maria Santos");
    expect(body.data.deliveryDate).toBe("2025-12-28");
  });

  test("should allow partial update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      reason: "Motivo original",
      deliveredBy: "João Silva",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "Apenas motivo atualizado",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.reason).toBe("Apenas motivo atualizado");
    expect(body.data.deliveredBy).toBe("João Silva");
  });

  test("should not update delivery from another organization", async () => {
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
        method: "PUT",
        headers: {
          ...user2.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Tentativa de atualização" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_DELIVERY_NOT_FOUND");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from updating delivery", async (role) => {
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
        method: "PUT",
        headers: {
          ...member.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Tentativa" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to update delivery", async () => {
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
        method: "PUT",
        headers: {
          ...manager.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Atualizado pelo gerente" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.reason).toBe("Atualizado pelo gerente");
  });
});

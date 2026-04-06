import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestPpeDelivery } from "@/test/helpers/ppe-delivery";
import { createTestPpeItem } from "@/test/helpers/ppe-item";
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

  test("should reject future deliveryDate on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deliveryDate: futureDateStr,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
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

  test("should replace ppe items when ppeItemIds is provided", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const oldItem = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Capacete Antigo",
    });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      ppeItemIds: [oldItem.id],
    });

    expect(delivery.items.length).toBe(1);
    expect(delivery.items[0].name).toBe("Capacete Antigo");

    const newItem1 = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Luvas Novas",
    });

    const newItem2 = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Botas Novas",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ppeItemIds: [newItem1.id, newItem2.id],
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.items.length).toBe(2);
    const itemNames = body.data.items.map((i: { name: string }) => i.name);
    expect(itemNames).toContain("Luvas Novas");
    expect(itemNames).toContain("Botas Novas");
    expect(itemNames).not.toContain("Capacete Antigo");
  });

  test("should keep existing items when ppeItemIds is not provided", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const ppeItem = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Capacete",
    });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      ppeItemIds: [ppeItem.id],
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
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.reason).toBe("Motivo atualizado");
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].name).toBe("Capacete");
  });

  test("should remove all items when ppeItemIds is empty array", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      ppeItemCount: 2,
    });

    expect(delivery.items.length).toBe(2);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ppeItemIds: [],
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.items.length).toBe(0);
  });

  test("should keep items that remain and only add/remove diff", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const itemA = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Item A",
    });

    const itemB = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Item B",
    });

    const itemC = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Item C",
    });

    const delivery = await createTestPpeDelivery({
      organizationId,
      userId: user.id,
      ppeItemIds: [itemA.id, itemB.id],
    });

    expect(delivery.items.length).toBe(2);

    // Keep B, remove A, add C
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ppeItemIds: [itemB.id, itemC.id],
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.items.length).toBe(2);
    const itemNames = body.data.items.map((i: { name: string }) => i.name);
    expect(itemNames).toContain("Item B");
    expect(itemNames).toContain("Item C");
    expect(itemNames).not.toContain("Item A");
  });

  test("should return 404 for non-existent ppe item on update", async () => {
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
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ppeItemIds: ["ppe-item-nonexistent"],
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_ITEM_NOT_FOUND");
  });
});

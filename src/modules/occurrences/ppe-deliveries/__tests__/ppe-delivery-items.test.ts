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

describe("PPE Delivery Items Endpoints", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("POST /v1/ppe-deliveries/:id/items", () => {
    test("should reject unauthenticated requests", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/ppe-delivery-123/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ppeItemId: "ppe-item-123" }),
        })
      );

      expect(response.status).toBe(401);
    });

    test("should return 404 for non-existent delivery", async () => {
      const { headers } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/ppe-deliveries/ppe-delivery-nonexistent/items`,
          {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ppeItemId: "ppe-item-123" }),
          }
        )
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("PPE_DELIVERY_NOT_FOUND");
    });

    test("should return 404 for non-existent ppe item", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const delivery = await createTestPpeDelivery({
        organizationId,
        userId: user.id,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ppeItemId: "ppe-item-nonexistent" }),
        })
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("PPE_ITEM_NOT_FOUND");
    });

    test("should add ppe item to delivery successfully", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const delivery = await createTestPpeDelivery({
        organizationId,
        userId: user.id,
      });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ppeItemId: ppeItem.id }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.ppeDeliveryId).toBe(delivery.id);
      expect(body.data.ppeItemId).toBe(ppeItem.id);
      expect(body.data.createdAt).toBeDefined();
    });

    test("should return 409 when adding duplicate ppe item", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const delivery = await createTestPpeDelivery({
        organizationId,
        userId: user.id,
      });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      // First add
      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ppeItemId: ppeItem.id }),
        })
      );

      // Second add
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ppeItemId: ppeItem.id }),
        })
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe("PPE_DELIVERY_ITEM_ALREADY_EXISTS");
    });

    test.each([
      "viewer",
    ] as const)("should reject %s from adding ppe item", async (role) => {
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

      const ppeItem = await createTestPpeItem({
        organizationId: owner.organizationId,
        userId: owner.user.id,
      });

      const member = await createTestUser({ emailVerified: true });
      await addMemberToOrganization(member, {
        organizationId: owner.organizationId,
        role,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "POST",
          headers: {
            ...member.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ppeItemId: ppeItem.id }),
        })
      );

      expect(response.status).toBe(403);
    });
  });

  describe("GET /v1/ppe-deliveries/:id/items", () => {
    test("should return empty list when no items", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const delivery = await createTestPpeDelivery({
        organizationId,
        userId: user.id,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeArray();
      expect(body.data.length).toBe(0);
    });

    test("should return associated ppe items", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const delivery = await createTestPpeDelivery({
        organizationId,
        userId: user.id,
      });

      const ppeItem1 = await createTestPpeItem({
        organizationId,
        userId: user.id,
        name: "Capacete",
      });

      const ppeItem2 = await createTestPpeItem({
        organizationId,
        userId: user.id,
        name: "Luvas",
      });

      // Add items
      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ppeItemId: ppeItem1.id }),
        })
      );

      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ppeItemId: ppeItem2.id }),
        })
      );

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "GET",
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(2);

      const names = body.data.map((item: { name: string }) => item.name);
      expect(names).toContain("Capacete");
      expect(names).toContain("Luvas");
    });

    test("should allow viewer to list items", async () => {
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
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "GET",
          headers: viewer.headers,
        })
      );

      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /v1/ppe-deliveries/:id/items/:ppeItemId", () => {
    test("should return 404 for non-existent association", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const delivery = await createTestPpeDelivery({
        organizationId,
        userId: user.id,
      });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items/${ppeItem.id}`,
          {
            method: "DELETE",
            headers,
          }
        )
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("PPE_DELIVERY_ITEM_NOT_FOUND");
    });

    test("should remove ppe item from delivery", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({
          emailVerified: true,
        });

      const delivery = await createTestPpeDelivery({
        organizationId,
        userId: user.id,
      });

      const ppeItem = await createTestPpeItem({
        organizationId,
        userId: user.id,
      });

      // Add first
      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ppeItemId: ppeItem.id }),
        })
      );

      // Delete
      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items/${ppeItem.id}`,
          {
            method: "DELETE",
            headers,
          }
        )
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      const listResponse = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "GET",
          headers,
        })
      );

      const listBody = await listResponse.json();
      expect(listBody.data.length).toBe(0);
    });

    test.each([
      "viewer",
    ] as const)("should reject %s from removing ppe item", async (role) => {
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

      const ppeItem = await createTestPpeItem({
        organizationId: owner.organizationId,
        userId: owner.user.id,
      });

      // Add as owner
      await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
          method: "POST",
          headers: {
            ...owner.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ppeItemId: ppeItem.id }),
        })
      );

      const member = await createTestUser({ emailVerified: true });
      await addMemberToOrganization(member, {
        organizationId: owner.organizationId,
        role,
      });

      const response = await app.handle(
        new Request(
          `${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items/${ppeItem.id}`,
          {
            method: "DELETE",
            headers: member.headers,
          }
        )
      );

      expect(response.status).toBe(403);
    });
  });
});

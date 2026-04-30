import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestPpeItem } from "@/test/helpers/ppe-item";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/ppe-items/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items/ppe-item-123`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items/ppe-item-123`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 for non-existent ppe item", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items/ppe-item-nonexistent`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_ITEM_NOT_FOUND");
  });

  test("should return ppe item by id", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const ppeItem = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Luvas de Proteção",
      description: "Luvas para proteção das mãos",
      equipment: "Luvas de Nitrila",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(ppeItem.id);
    expect(body.data.name).toBe("Luvas de Proteção");
    expect(body.data.description).toBe("Luvas para proteção das mãos");
    expect(body.data.equipment).toBe("Luvas de Nitrila");
    expect(body.data.createdBy).toMatchObject({ id: user.id });
    expect(body.data.updatedBy).toMatchObject({ id: user.id });
  });

  test("should not return ppe item from another organization", async () => {
    const user1 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const user2 = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const ppeItem = await createTestPpeItem({
      organizationId: user1.organizationId,
      userId: user1.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}`, {
        method: "GET",
        headers: user2.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_ITEM_NOT_FOUND");
  });

  test("should allow viewer to get ppe item", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const owner = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const ppeItem = await createTestPpeItem({
      organizationId: owner.organizationId,
      userId: owner.user.id,
    });

    const viewer = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewer, {
      organizationId: owner.organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items/${ppeItem.id}`, {
        method: "GET",
        headers: viewer.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe(ppeItem.id);
  });
});

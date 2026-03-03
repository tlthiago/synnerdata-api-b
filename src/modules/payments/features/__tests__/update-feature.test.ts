import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { like } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

function generateUniqueId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

async function createFeature(
  app: TestApp,
  headers: Record<string, string>,
  overrides: { id?: string; displayName?: string } = {}
) {
  const id = overrides.id ?? generateUniqueId("test_upd");
  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/features`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        displayName: overrides.displayName ?? "Update Test Feature",
      }),
    })
  );
  const body = await response.json();
  return body.data;
}

describe("PUT /payments/features/:id", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  afterAll(async () => {
    await db.delete(schema.features).where(like(schema.features.id, "test_%"));
  });

  test("should reject unauthenticated requests", async () => {
    const feature = await createFeature(app, authHeaders);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${feature.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated" }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const feature = await createFeature(app, authHeaders);
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${feature.id}`, {
        method: "PUT",
        headers: { ...nonAdminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated" }),
      })
    );
    expect(response.status).toBe(403);
  });

  test("should update feature metadata", async () => {
    const feature = await createFeature(app, authHeaders);

    const updateData = {
      displayName: "Updated Display Name",
      description: "Updated description",
      category: "updated_category",
      sortOrder: 99,
      isDefault: true,
      isPremium: true,
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${feature.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(feature.id);
    expect(body.data.displayName).toBe(updateData.displayName);
    expect(body.data.description).toBe(updateData.description);
    expect(body.data.category).toBe(updateData.category);
    expect(body.data.sortOrder).toBe(updateData.sortOrder);
    expect(body.data.isDefault).toBe(true);
    expect(body.data.isPremium).toBe(true);
  });

  test("should deactivate feature via update", async () => {
    const feature = await createFeature(app, authHeaders);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${feature.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.isActive).toBe(false);
  });

  test("should allow setting description to null", async () => {
    const featureId = generateUniqueId("test_null_desc");
    await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: featureId,
          displayName: "Null Desc Feature",
          description: "Has a description",
        }),
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${featureId}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ description: null }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.description).toBeNull();
  });

  test("should return 404 for non-existent feature", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/non_existent_feature_id`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Updated" }),
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("FEATURE_NOT_FOUND");
  });

  test("should only update provided fields", async () => {
    const featureId = generateUniqueId("test_partial");
    await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: featureId,
          displayName: "Original Name",
          description: "Original description",
          category: "original",
          sortOrder: 5,
        }),
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${featureId}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "New Name" }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.displayName).toBe("New Name");
    expect(body.data.description).toBe("Original description");
    expect(body.data.category).toBe("original");
    expect(body.data.sortOrder).toBe(5);
  });
});

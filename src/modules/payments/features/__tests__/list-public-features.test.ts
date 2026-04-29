import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { getOrCreateSystemTestUser } from "@/test/helpers/system-user";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("GET /payments/features (public)", () => {
  let app: TestApp;
  let systemUserId: string;

  beforeAll(async () => {
    app = createTestApp();
    systemUserId = await getOrCreateSystemTestUser();
  });

  test("should list features without authentication", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
  });

  test("should return only active features", async () => {
    const featureId = `test_inactive_pub_${crypto.randomUUID().slice(0, 8)}`;

    await db.insert(schema.features).values({
      id: featureId,
      displayName: "Test Inactive Public",
      isActive: false,
      sortOrder: 999,
      createdBy: systemUserId,
      updatedBy: systemUserId,
    });

    try {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/features`)
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      const inactiveFeature = body.data.find(
        (f: { id: string }) => f.id === featureId
      );
      expect(inactiveFeature).toBeUndefined();
    } finally {
      await db.delete(schema.features).where(eq(schema.features.id, featureId));
    }
  });

  test("should return features ordered by sortOrder", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    const features = body.data;

    for (let i = 1; i < features.length; i++) {
      expect(features[i].sortOrder).toBeGreaterThanOrEqual(
        features[i - 1].sortOrder
      );
    }
  });

  test("should return correct public feature properties", async () => {
    const featureId = `test_props_${crypto.randomUUID().slice(0, 8)}`;

    await db.insert(schema.features).values({
      id: featureId,
      displayName: "Test Props Feature",
      description: "Test description",
      category: "test_category",
      sortOrder: 0,
      isDefault: true,
      isPremium: false,
      createdBy: systemUserId,
      updatedBy: systemUserId,
    });

    try {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/features`)
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      const features = body.data;

      expect(features.length).toBeGreaterThan(0);

      const feature = features.find((f: { id: string }) => f.id === featureId);
      expect(feature).toBeDefined();
      expect(feature).toHaveProperty("id");
      expect(feature).toHaveProperty("displayName");
      expect(feature).toHaveProperty("description");
      expect(feature).toHaveProperty("category");
      expect(feature).toHaveProperty("sortOrder");
      expect(feature).toHaveProperty("isDefault");
      expect(feature).toHaveProperty("isPremium");
    } finally {
      await db.delete(schema.features).where(eq(schema.features.id, featureId));
    }
  });

  test("should not expose internal fields", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    const features = body.data;

    for (const feature of features) {
      expect(feature).not.toHaveProperty("isActive");
      expect(feature).not.toHaveProperty("createdAt");
      expect(feature).not.toHaveProperty("updatedAt");
      expect(feature).not.toHaveProperty("planCount");
    }
  });
});

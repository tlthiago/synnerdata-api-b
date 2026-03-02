import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("GET /payments/features (public)", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should list features without authentication", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.features).toBeArray();
  });

  test("should return only active features", async () => {
    const featureId = `test_inactive_pub_${crypto.randomUUID().slice(0, 8)}`;

    await db.insert(schema.features).values({
      id: featureId,
      displayName: "Test Inactive Public",
      isActive: false,
      sortOrder: 999,
    });

    try {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/features`)
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      const inactiveFeature = body.data.features.find(
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
    const features = body.data.features;

    for (let i = 1; i < features.length; i++) {
      expect(features[i].sortOrder).toBeGreaterThanOrEqual(
        features[i - 1].sortOrder
      );
    }
  });

  test("should return correct public feature properties", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    const features = body.data.features;

    if (features.length > 0) {
      const feature = features[0];
      expect(feature).toHaveProperty("id");
      expect(feature).toHaveProperty("displayName");
      expect(feature).toHaveProperty("description");
      expect(feature).toHaveProperty("category");
      expect(feature).toHaveProperty("sortOrder");
      expect(feature).toHaveProperty("isDefault");
      expect(feature).toHaveProperty("isPremium");
    }
  });

  test("should not expose internal fields", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    const features = body.data.features;

    for (const feature of features) {
      expect(feature).not.toHaveProperty("isActive");
      expect(feature).not.toHaveProperty("createdAt");
      expect(feature).not.toHaveProperty("updatedAt");
      expect(feature).not.toHaveProperty("planCount");
    }
  });
});

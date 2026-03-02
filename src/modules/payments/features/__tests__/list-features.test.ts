import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("GET /payments/features", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`)
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        headers: nonAdminHeaders,
      })
    );
    expect(response.status).toBe(403);
  });

  test("should list all features with planCount", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.features).toBeArray();

    for (const feature of body.data.features) {
      expect(feature.id).toBeString();
      expect(feature.displayName).toBeString();
      expect(typeof feature.planCount).toBe("number");
      expect(feature.planCount).toBeGreaterThanOrEqual(0);
      expect(feature.createdAt).toBeString();
      expect(feature.updatedAt).toBeString();
    }
  });

  test("should return features ordered by sortOrder", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        headers: authHeaders,
      })
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

  test("should include both active and inactive features", async () => {
    const featureId = `test_inactive_list_${crypto.randomUUID().slice(0, 8)}`;

    await db.insert(schema.features).values({
      id: featureId,
      displayName: "Test Inactive Feature",
      isActive: false,
      sortOrder: 999,
    });

    try {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/features`, {
          headers: authHeaders,
        })
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      const inactiveFeature = body.data.features.find(
        (f: { id: string }) => f.id === featureId
      );
      expect(inactiveFeature).toBeDefined();
      expect(inactiveFeature.isActive).toBe(false);
    } finally {
      await db.delete(schema.features).where(eq(schema.features.id, featureId));
    }
  });
});

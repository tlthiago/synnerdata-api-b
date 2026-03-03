import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

function generateUniqueId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

async function createFeatureViaApi(
  app: TestApp,
  headers: Record<string, string>,
  id?: string
) {
  const featureId = id ?? generateUniqueId("test_del");
  const response = await app.handle(
    new Request(`${BASE_URL}/v1/payments/features`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: featureId,
        displayName: `Delete Test ${featureId}`,
      }),
    })
  );
  const body = await response.json();
  return body.data;
}

describe("DELETE /payments/features/:id", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  afterAll(async () => {
    await db
      .delete(schema.planFeatures)
      .where(like(schema.planFeatures.featureId, "test_%"));
    await db.delete(schema.features).where(like(schema.features.id, "test_%"));
  });

  test("should reject unauthenticated requests", async () => {
    const feature = await createFeatureViaApi(app, authHeaders);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${feature.id}`, {
        method: "DELETE",
      })
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const feature = await createFeatureViaApi(app, authHeaders);
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${feature.id}`, {
        method: "DELETE",
        headers: nonAdminHeaders,
      })
    );
    expect(response.status).toBe(403);
  });

  test("should hard delete feature with no plan associations", async () => {
    const feature = await createFeatureViaApi(app, authHeaders);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${feature.id}`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);

    const [deletedFeature] = await db
      .select()
      .from(schema.features)
      .where(eq(schema.features.id, feature.id))
      .limit(1);
    expect(deletedFeature).toBeUndefined();
  });

  test("should soft delete (deactivate) feature associated with plans", async () => {
    const featureId = generateUniqueId("test_soft_del");

    await db.insert(schema.features).values({
      id: featureId,
      displayName: "Soft Delete Feature",
    });

    await PlanFactory.createPaid("gold", {
      features: [featureId],
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/${featureId}`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.deactivated).toBe(true);
    expect(body.data.planCount).toBeGreaterThan(0);

    const [deactivatedFeature] = await db
      .select()
      .from(schema.features)
      .where(eq(schema.features.id, featureId))
      .limit(1);
    expect(deactivatedFeature).toBeDefined();
    expect(deactivatedFeature.isActive).toBe(false);
  });

  test("should return 404 for non-existent feature", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features/non_existent_feature`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("FEATURE_NOT_FOUND");
  });
});

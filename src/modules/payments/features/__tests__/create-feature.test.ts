import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

function generateUniqueId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

describe("POST /payments/features", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;
  let adminUserId: string;

  beforeAll(async () => {
    app = createTestApp();
    const { headers, user } = await UserFactory.createAdmin({
      emailVerified: true,
    });
    authHeaders = headers;
    adminUserId = user.id;
  });

  afterAll(async () => {
    await db.delete(schema.features).where(like(schema.features.id, "test_%"));
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test_feature",
          displayName: "Test Feature",
        }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...nonAdminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test_feature",
          displayName: "Test Feature",
        }),
      })
    );
    expect(response.status).toBe(403);
  });

  test("should create feature with valid data", async () => {
    const featureId = generateUniqueId("test_create");
    const featureData = {
      id: featureId,
      displayName: "Test Create Feature",
      description: "A test feature for creation",
      category: "testing",
      sortOrder: 50,
      isDefault: true,
      isPremium: true,
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(featureData),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(featureId);
    expect(body.data.displayName).toBe(featureData.displayName);
    expect(body.data.description).toBe(featureData.description);
    expect(body.data.category).toBe(featureData.category);
    expect(body.data.sortOrder).toBe(featureData.sortOrder);
    expect(body.data.isActive).toBe(true);
    expect(body.data.isDefault).toBe(true);
    expect(body.data.isPremium).toBe(true);
    expect(body.data.planCount).toBe(0);
    expect(body.data.createdAt).toBeString();
    expect(body.data.updatedAt).toBeString();
  });

  test("should populate createdBy with admin user ID", async () => {
    const featureId = generateUniqueId("test_created_by");
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: featureId,
          displayName: "Created By Test Feature",
        }),
      })
    );
    expect(response.status).toBe(200);

    const [dbFeature] = await db
      .select({ createdBy: schema.features.createdBy })
      .from(schema.features)
      .where(eq(schema.features.id, featureId))
      .limit(1);

    expect(dbFeature).toBeDefined();
    expect(dbFeature.createdBy).toBe(adminUserId);
  });

  test("should apply default values for optional fields", async () => {
    const featureId = generateUniqueId("test_defaults");
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: featureId,
          displayName: "Test Defaults Feature",
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.sortOrder).toBe(0);
    expect(body.data.isDefault).toBe(false);
    expect(body.data.isPremium).toBe(false);
    expect(body.data.isActive).toBe(true);
    expect(body.data.description).toBeNull();
    expect(body.data.category).toBeNull();
  });

  test("should reject duplicate feature id", async () => {
    const featureId = generateUniqueId("test_dup");
    const featureData = {
      id: featureId,
      displayName: "First Feature",
    };

    const firstResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(featureData),
      })
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ...featureData, displayName: "Second Feature" }),
      })
    );
    expect(secondResponse.status).toBe(409);

    const errorBody = await secondResponse.json();
    expect(errorBody.error.code).toBe("FEATURE_ALREADY_EXISTS");
  });

  test("should reject non-snake_case id", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "Invalid-ID",
          displayName: "Invalid Feature",
        }),
      })
    );
    expect(response.status).toBe(422);
  });

  test("should reject id starting with number", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "1_bad_id",
          displayName: "Bad ID Feature",
        }),
      })
    );
    expect(response.status).toBe(422);
  });

  test("should reject missing required fields", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "missing_display_name",
        }),
      })
    );
    expect(response.status).toBe(422);
  });

  test("should reject id longer than 50 characters", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/features`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "a".repeat(51),
          displayName: "Long ID Feature",
        }),
      })
    );
    expect(response.status).toBe(422);
  });
});

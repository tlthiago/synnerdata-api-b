import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createPaidPlan } from "@/test/factories/plan";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestAdminUser, createTestUser } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("DELETE /payments/plans/:id", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await createTestAdminUser({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const { plan } = await createPaidPlan("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "DELETE",
      })
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { plan } = await createPaidPlan("gold");
    const { headers: nonAdminHeaders } = await createTestUser({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "DELETE",
        headers: nonAdminHeaders,
      })
    );
    expect(response.status).toBe(403);
  });

  test("should delete plan successfully", async () => {
    const { plan } = await createPaidPlan("diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);

    // Verify plan was deleted from database
    const [deletedPlan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, plan.id))
      .limit(1);
    expect(deletedPlan).toBeUndefined();
  });

  test("should delete plan and its pricing tiers", async () => {
    const { plan, tiers } = await createPaidPlan("platinum");
    const tierId = tiers[0].id;

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    // Verify pricing tiers were also deleted (cascade)
    const [deletedTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tierId))
      .limit(1);
    expect(deletedTier).toBeUndefined();
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/plan-non-existent-id`, {
        method: "DELETE",
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });
});

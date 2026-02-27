import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("GET /payments/plans/:planId/tiers", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const { plan } = await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`)
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { plan } = await PlanFactory.createPaid("gold");
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        headers: nonAdminHeaders,
      })
    );
    expect(response.status).toBe(403);
  });

  test("should list all tiers for a plan", async () => {
    const { plan, tiers } = await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.tiers).toHaveLength(tiers.length);
  });

  test("should return tiers ordered by minEmployees", async () => {
    const { plan } = await PlanFactory.createPaid("diamond");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        headers: authHeaders,
      })
    );
    const body = await response.json();
    const returnedTiers = body.data.tiers;

    for (let i = 1; i < returnedTiers.length; i++) {
      expect(returnedTiers[i].minEmployees).toBeGreaterThan(
        returnedTiers[i - 1].minEmployees
      );
    }
  });

  test("should include Pagar.me plan IDs in response", async () => {
    const { plan } = await PlanFactory.createPaid("gold");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/tiers`, {
        headers: authHeaders,
      })
    );
    const body = await response.json();
    const tier = body.data.tiers[0];

    expect(tier).toHaveProperty("pagarmePlanIdMonthly");
    expect(tier).toHaveProperty("pagarmePlanIdYearly");
    expect(tier).toHaveProperty("id");
    expect(tier).toHaveProperty("minEmployees");
    expect(tier).toHaveProperty("maxEmployees");
    expect(tier).toHaveProperty("priceMonthly");
    expect(tier).toHaveProperty("priceYearly");
  });

  test("should return 404 for non-existent plan", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/plan-non-existent-id/tiers`, {
        headers: authHeaders,
      })
    );
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });
});

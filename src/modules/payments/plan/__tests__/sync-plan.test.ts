import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { skipIntegration } from "@/test/helpers/skip-integration";
import { createTestAdminUser } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe.skipIf(skipIntegration)(
  "POST /payments/plans/:id/sync - Pagarme API",
  () => {
    let app: TestApp;
    let authHeaders: Record<string, string>;
    const createdPlanIds: string[] = [];

    beforeAll(async () => {
      app = createTestApp();
      await seedPlans();
      const { headers } = await createTestAdminUser({ emailVerified: true });
      authHeaders = headers;
    });

    afterAll(async () => {
      // Clean up created plans and reset pagarmePlanId
      for (const planId of createdPlanIds) {
        await db
          .delete(schema.subscriptionPlans)
          .where(eq(schema.subscriptionPlans.id, planId));
      }
    });

    async function createTestPlan(name: string) {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            displayName: `Test ${name}`,
            priceMonthly: 1000,
            priceYearly: 10_000,
            limits: {
              maxMembers: 5,
              maxProjects: 10,
              maxStorage: 1000,
              features: ["basic"],
            },
          }),
        })
      );
      const body = await response.json();
      createdPlanIds.push(body.data.id);
      return body.data;
    }

    test("should reject unauthenticated requests", async () => {
      const plan = await createTestPlan(`sync-unauth-${Date.now()}`);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
          method: "POST",
        })
      );
      expect(response.status).toBe(401);
    });

    test("should sync plan to Pagarme and return pagarmePlanIdMonthly", async () => {
      const plan = await createTestPlan(`sync-new-${Date.now()}`);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
          method: "POST",
          headers: authHeaders,
        })
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(plan.id);
      expect(body.data.pagarmePlanIdMonthly).toBeDefined();
      expect(body.data.pagarmePlanIdMonthly).toStartWith("plan_");

      // Verify pagarmePlanIdMonthly was saved in database
      const [dbPlan] = await db
        .select({
          pagarmePlanIdMonthly: schema.subscriptionPlans.pagarmePlanIdMonthly,
        })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, plan.id))
        .limit(1);

      expect(dbPlan.pagarmePlanIdMonthly).toBe(body.data.pagarmePlanIdMonthly);
    });

    test("should return existing pagarmePlanIdMonthly if already synced", async () => {
      const plan = await createTestPlan(`sync-existing-${Date.now()}`);

      // First sync
      const firstResponse = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
          method: "POST",
          headers: authHeaders,
        })
      );
      expect(firstResponse.status).toBe(200);
      const firstBody = await firstResponse.json();
      const pagarmePlanIdMonthly = firstBody.data.pagarmePlanIdMonthly;

      // Second sync - should return same ID without creating new plan
      const secondResponse = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
          method: "POST",
          headers: authHeaders,
        })
      );
      expect(secondResponse.status).toBe(200);

      const secondBody = await secondResponse.json();
      expect(secondBody.success).toBe(true);
      expect(secondBody.data.pagarmePlanIdMonthly).toBe(pagarmePlanIdMonthly);
    });

    test("should return 404 for non-existent plan", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans/non-existent-plan-id/sync`, {
          method: "POST",
          headers: authHeaders,
        })
      );
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error.code).toBe("PLAN_NOT_FOUND");
    });

    test("should sync plan with correct data to Pagarme", async () => {
      const planData = {
        name: `sync-data-${Date.now()}`,
        displayName: "Sync Data Test Plan",
        priceMonthly: 9900,
        priceYearly: 99_000,
        limits: {
          maxMembers: 10,
          maxProjects: 25,
          maxStorage: 5000,
          features: ["basic", "advanced"],
        },
      };

      const createResponse = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans`, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(planData),
        })
      );
      const createBody = await createResponse.json();
      const plan = createBody.data;
      createdPlanIds.push(plan.id);

      const syncResponse = await app.handle(
        new Request(`${BASE_URL}/v1/payments/plans/${plan.id}/sync`, {
          method: "POST",
          headers: authHeaders,
        })
      );
      expect(syncResponse.status).toBe(200);

      const body = await syncResponse.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(plan.id);
      expect(body.data.pagarmePlanIdMonthly).toBeDefined();
    });
  }
);

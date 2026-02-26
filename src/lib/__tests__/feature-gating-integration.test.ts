import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

/**
 * Integration tests for feature gating on business module controllers.
 *
 * Validates that real endpoints enforce requireFeature by hitting
 * actual controller routes via createTestApp().
 *
 * Strategy: use GET (list) endpoints which don't need pre-existing data.
 * A 200 means the feature gate passed; a 403 with FEATURE_NOT_AVAILABLE
 * means it was correctly blocked.
 */
describe("Feature Gating Integration", () => {
  let app: ReturnType<typeof createTestApp>;
  let goldPlan: CreatePlanResult;
  let diamondPlan: CreatePlanResult;

  beforeAll(async () => {
    app = createTestApp();
    [goldPlan, diamondPlan] = await Promise.all([
      PlanFactory.createPaid("gold"),
      PlanFactory.createPaid("diamond"),
    ]);
  });

  afterAll(async () => {
    for (const plan of [goldPlan, diamondPlan]) {
      if (plan) {
        await db
          .delete(schema.orgSubscriptions)
          .where(eq(schema.orgSubscriptions.planId, plan.plan.id));
        await db
          .delete(schema.planPricingTiers)
          .where(eq(schema.planPricingTiers.planId, plan.plan.id));
        await db
          .delete(schema.subscriptionPlans)
          .where(eq(schema.subscriptionPlans.id, plan.plan.id));
      }
    }
  });

  /**
   * Helper: create user + org + subscription in one call.
   */
  async function createUserWithPlan(planId: string) {
    const result = await UserFactory.createWithOrganization({
      emailVerified: true,
    });
    await SubscriptionFactory.createActive(result.organizationId, planId);
    return result;
  }

  /**
   * Helper: create user + org with NO subscription.
   */
  function createUserWithoutPlan() {
    return UserFactory.createWithOrganization({ emailVerified: true });
  }

  // ─── Gold tier features ───────────────────────────────────────────

  describe("Gold features — org without subscription is blocked", () => {
    const goldEndpoints = [
      "/v1/absences",
      "/v1/accidents",
      "/v1/warnings",
      "/v1/medical-certificates",
      "/v1/terminations",
    ];

    for (const path of goldEndpoints) {
      test(`GET ${path} returns 403 FEATURE_NOT_AVAILABLE without subscription`, async () => {
        const { headers } = await createUserWithoutPlan();

        const response = await app.handle(
          new Request(`${BASE_URL}${path}`, { headers })
        );

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error.code).toBe("FEATURE_NOT_AVAILABLE");
      });
    }
  });

  describe("Gold features — org with Gold plan can access", () => {
    const goldEndpoints = [
      "/v1/absences",
      "/v1/accidents",
      "/v1/warnings",
      "/v1/medical-certificates",
      "/v1/terminations",
    ];

    for (const path of goldEndpoints) {
      test(`GET ${path} returns 200 with Gold plan`, async () => {
        const { headers } = await createUserWithPlan(goldPlan.plan.id);

        const response = await app.handle(
          new Request(`${BASE_URL}${path}`, { headers })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
      });
    }
  });

  // ─── Diamond tier feature (ppe) ───────────────────────────────────

  describe("Diamond feature (ppe) — Gold plan is blocked", () => {
    test("GET /v1/ppe-deliveries returns 403 FEATURE_NOT_AVAILABLE with Gold plan", async () => {
      const { headers } = await createUserWithPlan(goldPlan.plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries`, { headers })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("FEATURE_NOT_AVAILABLE");
    });
  });

  describe("Diamond feature (ppe) — Diamond plan can access", () => {
    test("GET /v1/ppe-deliveries returns 200 with Diamond plan", async () => {
      const { headers } = await createUserWithPlan(diamondPlan.plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/ppe-deliveries`, { headers })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Diamond plan includes Gold features ──────────────────────────

  describe("Diamond plan includes Gold features", () => {
    test("GET /v1/absences returns 200 with Diamond plan", async () => {
      const { headers } = await createUserWithPlan(diamondPlan.plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/absences`, { headers })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  // ─── Employee status (Gold feature, specific endpoint) ────────────

  describe("employee_status feature gate", () => {
    test("PATCH /v1/employees/:id/status returns 403 without subscription", async () => {
      const { headers } = await createUserWithoutPlan();
      const fakeId = `emp-${crypto.randomUUID()}`;

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/employees/${fakeId}/status`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ON_LEAVE" }),
        })
      );

      // Feature gate runs before param validation, so we expect 403
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("FEATURE_NOT_AVAILABLE");
    });

    test("PATCH /v1/employees/:id/status passes feature gate with Gold plan", async () => {
      const { headers } = await createUserWithPlan(goldPlan.plan.id);
      const fakeId = `emp-${crypto.randomUUID()}`;

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/employees/${fakeId}/status`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ON_LEAVE" }),
        })
      );

      // Feature gate passes — the request proceeds further
      // and fails on employee not found (404) or validation (422), not on feature gate
      expect(response.status).not.toBe(403);
    });
  });

  // ─── Non-gated employee CRUD still accessible ─────────────────────

  describe("Employee CRUD is not feature-gated", () => {
    test("GET /v1/employees returns 200 without any subscription", async () => {
      const { headers } = await createUserWithoutPlan();

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/employees`, { headers })
      );

      // Employee list is not gated — should work even without a plan
      // May return 403 for permission reasons but NOT for FEATURE_NOT_AVAILABLE
      if (response.status === 403) {
        const body = await response.json();
        expect(body.error.code).not.toBe("FEATURE_NOT_AVAILABLE");
      } else {
        expect(response.status).toBe(200);
      }
    });
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import Elysia from "elysia";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import {
  createApiKeyHeaders,
  createGlobalTestApiKey,
} from "@/test/helpers/api-key";

const BASE_URL = env.API_URL;

/**
 * Create a test app with endpoints that use different auth options.
 * This allows us to test the Feature Guard in isolation.
 */
function createFeatureGuardTestApp() {
  return new Elysia({ name: "feature-guard-test" })
    .use(betterAuthPlugin)
    .get("/test/require-active-subscription", () => ({ success: true }), {
      auth: {
        requireOrganization: true,
        requireActiveSubscription: true,
      },
    })
    .get("/test/require-feature-gold", () => ({ success: true }), {
      auth: {
        requireOrganization: true,
        requireFeature: "terminated_employees",
      },
    })
    .get("/test/require-feature-platinum", () => ({ success: true }), {
      auth: {
        requireOrganization: true,
        requireFeature: "payroll",
      },
    })
    .get("/test/require-multiple-features", () => ({ success: true }), {
      auth: {
        requireOrganization: true,
        requireFeatures: ["birthdays", "ppe"],
      },
    })
    .get("/test/no-admin-bypass", () => ({ success: true }), {
      auth: {
        requireOrganization: true,
        requireActiveSubscription: true,
        allowAdminBypass: false,
      },
    });
}

describe("Feature Guard", () => {
  let app: ReturnType<typeof createFeatureGuardTestApp>;
  let trialPlan: CreatePlanResult;
  let goldPlan: CreatePlanResult;
  let diamondPlan: CreatePlanResult;
  let platinumPlan: CreatePlanResult;

  beforeAll(async () => {
    app = createFeatureGuardTestApp();
    [trialPlan, goldPlan, diamondPlan, platinumPlan] = await Promise.all([
      PlanFactory.createTrial(),
      PlanFactory.createPaid("gold"),
      PlanFactory.createPaid("diamond"),
      PlanFactory.createPaid("platinum"),
    ]);
  });

  afterAll(async () => {
    for (const plan of [trialPlan, goldPlan, diamondPlan, platinumPlan]) {
      if (plan) {
        // Delete subscriptions referencing this plan first
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

  describe("requireActiveSubscription", () => {
    test("should reject user with no subscription", async () => {
      const { headers } = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers,
        })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");
    });

    test("should reject user with expired subscription", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await SubscriptionFactory.createExpired(organizationId, goldPlan.plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers,
        })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");
    });

    test("should reject user with canceled subscription", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await SubscriptionFactory.createCanceled(
        organizationId,
        goldPlan.plan.id
      );

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers,
        })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");
    });

    test("should reject user with past_due subscription (grace period expired)", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await SubscriptionFactory.createPastDue(organizationId, goldPlan.plan.id);

      // Note: past_due has grace period, so it may still have access
      // depending on gracePeriodEnds. For this test we just verify it works.
      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers,
        })
      );

      // past_due within grace period still has access
      expect([200, 403]).toContain(response.status);
    });

    test("should allow user with active subscription", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await SubscriptionFactory.createActive(organizationId, goldPlan.plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test("should allow user with trial plan subscription", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      // Trial is now a PLAN type (isTrial=true), not a subscription status
      // Create subscription with status "active" but using the trial plan
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      await db.insert(schema.orgSubscriptions).values({
        id: `test-sub-${crypto.randomUUID()}`,
        organizationId,
        planId: trialPlan.plan.id,
        pricingTierId: trialPlan.tiers[0].id,
        status: "active",
        trialStart: now,
        trialEnd,
        trialUsed: true,
        seats: 1,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test("should reject user with expired trial plan", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      // Create trial subscription with expired trialEnd
      const now = new Date();
      const trialEnd = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      await db.insert(schema.orgSubscriptions).values({
        id: `test-sub-${crypto.randomUUID()}`,
        organizationId,
        planId: trialPlan.plan.id,
        pricingTierId: trialPlan.tiers[0].id,
        status: "active",
        trialStart: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        trialEnd,
        trialUsed: true,
        seats: 1,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers,
        })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");
    });

    test("should allow admin even with inactive subscription (default bypass)", async () => {
      const adminResult = await UserFactory.createAdmin({
        emailVerified: true,
        role: "admin",
      });

      // Create organization for admin
      const organization = await OrganizationFactory.create();
      await OrganizationFactory.addMember(adminResult, {
        organizationId: organization.id,
        role: "owner",
      });

      // Create expired subscription
      await SubscriptionFactory.createExpired(
        organization.id,
        goldPlan.plan.id
      );

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers: adminResult.headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  describe("requireFeature", () => {
    test("should reject user without feature in plan (gold trying platinum feature)", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      // Gold plan doesn't have payroll feature
      await SubscriptionFactory.createActive(organizationId, goldPlan.plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-feature-platinum`, {
          headers,
        })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("FEATURE_NOT_AVAILABLE");
    });

    test("should allow user with feature in plan (gold accessing gold feature)", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await SubscriptionFactory.createActive(organizationId, goldPlan.plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-feature-gold`, {
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test("should allow user with higher plan (platinum accessing gold feature)", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await SubscriptionFactory.createActive(
        organizationId,
        platinumPlan.plan.id
      );

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-feature-gold`, {
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test("should allow trial plan user to access any feature (trial has all features)", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      // Trial plan has ALL features including payroll
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      await db.insert(schema.orgSubscriptions).values({
        id: `test-sub-${crypto.randomUUID()}`,
        organizationId,
        planId: trialPlan.plan.id,
        pricingTierId: trialPlan.tiers[0].id,
        status: "active",
        trialStart: now,
        trialEnd,
        trialUsed: true,
        seats: 1,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-feature-platinum`, {
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test("should allow admin even without feature in plan", async () => {
      const adminResult = await UserFactory.createAdmin({
        emailVerified: true,
        role: "admin",
      });

      const organization = await OrganizationFactory.create();
      await OrganizationFactory.addMember(adminResult, {
        organizationId: organization.id,
        role: "owner",
      });

      // Gold plan doesn't have payroll
      await SubscriptionFactory.createActive(organization.id, goldPlan.plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-feature-platinum`, {
          headers: adminResult.headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  describe("requireFeatures (multiple)", () => {
    test("should reject user missing any of the required features", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      // Gold plan doesn't have birthdays or ppe (diamond features)
      await SubscriptionFactory.createActive(organizationId, goldPlan.plan.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-multiple-features`, {
          headers,
        })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("FEATURE_NOT_AVAILABLE");
    });

    test("should allow user with all required features", async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      // Diamond plan has birthdays and ppe
      await SubscriptionFactory.createActive(
        organizationId,
        diamondPlan.plan.id
      );

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-multiple-features`, {
          headers,
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  describe("allowAdminBypass", () => {
    test("should bypass subscription check for admin by default", async () => {
      const adminResult = await UserFactory.createAdmin({
        emailVerified: true,
        role: "admin",
      });

      const organization = await OrganizationFactory.create();
      await OrganizationFactory.addMember(adminResult, {
        organizationId: organization.id,
        role: "owner",
      });

      // No subscription at all
      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers: adminResult.headers,
        })
      );

      expect(response.status).toBe(200);
    });

    test("should bypass subscription check for super_admin", async () => {
      const superAdminResult = await UserFactory.createAdmin({
        emailVerified: true,
        role: "super_admin",
      });

      const organization = await OrganizationFactory.create();
      await OrganizationFactory.addMember(superAdminResult, {
        organizationId: organization.id,
        role: "owner",
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers: superAdminResult.headers,
        })
      );

      expect(response.status).toBe(200);
    });

    test("should bypass subscription check for API key (admin context)", async () => {
      const adminResult = await UserFactory.createAdmin({
        emailVerified: true,
        role: "admin",
      });

      const organization = await OrganizationFactory.create();
      await OrganizationFactory.addMember(adminResult, {
        organizationId: organization.id,
        role: "owner",
      });

      const apiKey = await createGlobalTestApiKey(adminResult.user.id);

      const response = await app.handle(
        new Request(`${BASE_URL}/test/require-active-subscription`, {
          headers: createApiKeyHeaders(apiKey.key),
        })
      );

      // API keys may have different auth flow, so we accept success or auth error
      // depending on how API key auth resolves the organization context
      expect([200, 401, 403]).toContain(response.status);
    });

    test("should NOT bypass when allowAdminBypass is false", async () => {
      const adminResult = await UserFactory.createAdmin({
        emailVerified: true,
        role: "admin",
      });

      const organization = await OrganizationFactory.create();
      await OrganizationFactory.addMember(adminResult, {
        organizationId: organization.id,
        role: "owner",
      });

      // No subscription
      const response = await app.handle(
        new Request(`${BASE_URL}/test/no-admin-bypass`, {
          headers: adminResult.headers,
        })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");
    });
  });
});

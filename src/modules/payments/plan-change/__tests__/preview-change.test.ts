import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { EmployeeFactory } from "@/test/factories/employee.factory";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/subscription/preview-change`;

describe("POST /v1/payments/subscription/preview-change", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("Authentication", () => {
    test("should reject unauthenticated requests", async () => {
      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPlanId: "some-plan-id" }),
        })
      );

      expect(response.status).toBe(401);
    });
  });

  describe("Authorization", () => {
    test("should allow user with subscription:read permission", async () => {
      const ownerResult = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const viewerResult = await UserFactory.create({ emailVerified: true });

      await db.insert(schema.members).values({
        id: `member-${crypto.randomUUID()}`,
        organizationId: ownerResult.organizationId,
        userId: viewerResult.user.id,
        role: "viewer",
        createdAt: new Date(),
      });

      await db
        .update(schema.sessions)
        .set({ activeOrganizationId: ownerResult.organizationId })
        .where(eq(schema.sessions.userId, viewerResult.user.id));

      const { plan: goldPlan, tiers: goldTiers } =
        await PlanFactory.createPaid("gold");
      const { plan: diamondPlan } = await PlanFactory.createPaid("diamond");

      await SubscriptionFactory.create(
        ownerResult.organizationId,
        goldPlan.id,
        {
          pricingTierId: goldTiers[0].id,
        }
      );

      await BillingProfileFactory.create({
        organizationId: ownerResult.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...viewerResult.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newPlanId: diamondPlan.id }),
        })
      );

      // Viewer with read permission should be able to preview
      expect(response.status).toBe(200);
    });
  });

  describe("Validation Errors", () => {
    test("should return SUBSCRIPTION_NOT_FOUND when org has no subscription", async () => {
      const result = await UserFactory.create({ emailVerified: true });

      const org = await OrganizationFactory.create({
        name: "No Subscription Org",
        tradeName: "No Sub",
        phone: "11999999999",
      });

      await OrganizationFactory.addMember(result, {
        organizationId: org.id,
        role: "owner",
      });

      await BillingProfileFactory.create({ organizationId: org.id });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newPlanId: "some-plan-id" }),
        })
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
    });

    test("should return SUBSCRIPTION_NOT_ACTIVE when subscription is canceled", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tiers[0].id,
      });

      await db
        .update(schema.orgSubscriptions)
        .set({ status: "canceled" })
        .where(
          eq(schema.orgSubscriptions.organizationId, result.organizationId)
        );

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newPlanId: "some-plan-id" }),
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_NOT_ACTIVE");
    });

    test("should return PLAN_CHANGE_IN_PROGRESS when change already scheduled", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");
      const { plan: goldPlan } = await PlanFactory.createPaid("gold");

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tiers[0].id,
      });

      await db
        .update(schema.orgSubscriptions)
        .set({
          pendingPlanId: goldPlan.id,
          pendingBillingCycle: "monthly",
          planChangeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
        .where(
          eq(schema.orgSubscriptions.organizationId, result.organizationId)
        );

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newPlanId: goldPlan.id }),
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("PLAN_CHANGE_IN_PROGRESS");
    });

    test("should return NO_CHANGE_REQUESTED when same configuration", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: goldPlan, tiers } = await PlanFactory.createPaid("gold");

      await SubscriptionFactory.create(result.organizationId, goldPlan.id, {
        pricingTierId: tiers[0].id,
        billingCycle: "monthly",
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: goldPlan.id,
            newBillingCycle: "monthly",
            newTierId: tiers[0].id,
          }),
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("NO_CHANGE_REQUESTED");
    });

    test("should return EMPLOYEE_COUNT_EXCEEDS_LIMIT on downgrade with too many employees", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers: diamondTiers } =
        await PlanFactory.createPaid("diamond");
      const { plan: goldPlan, tiers: goldTiers } =
        await PlanFactory.createPaid("gold");

      // Use second tier (11-20 employees)
      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: diamondTiers[1].id,
      });

      // Create 15 employees (more than first tier max of 10)
      for (let i = 0; i < 15; i++) {
        await EmployeeFactory.create({ organizationId: result.organizationId });
      }

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      // Try to preview downgrade to first tier (0-10)
      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: goldPlan.id,
            newTierId: goldTiers[0].id,
          }),
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("EMPLOYEE_COUNT_EXCEEDS_NEW_PLAN_LIMIT");
    });
  });

  describe("Preview Upgrade", () => {
    test("should return upgrade preview for plan upgrade (gold -> diamond)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: goldPlan, tiers: goldTiers } =
        await PlanFactory.createPaid("gold");
      const { plan: diamondPlan, tiers: diamondTiers } =
        await PlanFactory.createPaid("diamond");

      const periodStart = new Date();
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await SubscriptionFactory.create(result.organizationId, goldPlan.id, {
        pricingTierId: goldTiers[0].id,
        billingCycle: "monthly",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: diamondPlan.id,
            newTierId: diamondTiers[0].id,
          }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.data.changeType).toBe("upgrade");
      expect(body.data.immediate).toBe(true);
      expect(body.data.currentPlan.id).toBe(goldPlan.id);
      expect(body.data.newPlan.id).toBe(diamondPlan.id);
      expect(body.data.prorationAmount).toBeGreaterThan(0);
      expect(body.data.daysRemaining).toBeGreaterThan(0);
      expect(body.data.scheduledAt).toBeUndefined();
      expect(body.data.featuresGained.length).toBeGreaterThan(0);
      expect(body.data.featuresLost.length).toBe(0);
    });

    test("should return upgrade preview for billing cycle change (monthly -> yearly)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tiers[0].id,
        billingCycle: "monthly",
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newBillingCycle: "yearly" }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.data.changeType).toBe("upgrade");
      expect(body.data.immediate).toBe(true);
      expect(body.data.currentPlan.billingCycle).toBe("monthly");
      expect(body.data.newPlan.billingCycle).toBe("yearly");
    });

    test("should return upgrade preview for tier upgrade (0-10 -> 11-20)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: goldPlan, tiers } = await PlanFactory.createPaid("gold");

      await SubscriptionFactory.create(result.organizationId, goldPlan.id, {
        pricingTierId: tiers[0].id,
        billingCycle: "monthly",
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newTierId: tiers[1].id }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.data.changeType).toBe("upgrade");
      expect(body.data.currentTier.id).toBe(tiers[0].id);
      expect(body.data.newTier.id).toBe(tiers[1].id);
      expect(body.data.newTier.minEmployees).toBe(11);
      expect(body.data.newTier.maxEmployees).toBe(20);
    });
  });

  describe("Preview Downgrade", () => {
    test("should return downgrade preview for plan downgrade (diamond -> gold)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: goldPlan, tiers: goldTiers } =
        await PlanFactory.createPaid("gold");
      const { plan: diamondPlan, tiers: diamondTiers } =
        await PlanFactory.createPaid("diamond");

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: diamondTiers[0].id,
        billingCycle: "monthly",
        currentPeriodEnd: periodEnd,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: goldPlan.id,
            newTierId: goldTiers[0].id,
          }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.data.changeType).toBe("downgrade");
      expect(body.data.immediate).toBe(false);
      expect(body.data.currentPlan.id).toBe(diamondPlan.id);
      expect(body.data.newPlan.id).toBe(goldPlan.id);
      expect(body.data.scheduledAt).toBeDefined();
      expect(body.data.prorationAmount).toBeUndefined();
      expect(body.data.featuresGained.length).toBe(0);
      expect(body.data.featuresLost.length).toBeGreaterThan(0);
    });

    test("should return downgrade preview for billing cycle change (yearly -> monthly)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: diamondPlan, tiers } =
        await PlanFactory.createPaid("diamond");

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: tiers[0].id,
        billingCycle: "yearly",
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newBillingCycle: "monthly" }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.data.changeType).toBe("downgrade");
      expect(body.data.immediate).toBe(false);
      expect(body.data.currentPlan.billingCycle).toBe("yearly");
      expect(body.data.newPlan.billingCycle).toBe("monthly");
    });
  });

  describe("Feature Comparison", () => {
    test("should return features gained with display names (gold -> diamond)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: goldPlan, tiers: goldTiers } =
        await PlanFactory.createPaid("gold");
      const { plan: diamondPlan, tiers: diamondTiers } =
        await PlanFactory.createPaid("diamond");

      await SubscriptionFactory.create(result.organizationId, goldPlan.id, {
        pricingTierId: goldTiers[0].id,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: diamondPlan.id,
            newTierId: diamondTiers[0].id,
          }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // Diamond has: birthdays, ppe, employee_record that gold doesn't have
      expect(body.data.featuresGained).toContain("Aniversariantes");
      expect(body.data.featuresGained).toContain("EPI");
      expect(body.data.featuresGained).toContain("Ficha Cadastral");
      expect(body.data.featuresLost).toEqual([]);
    });

    test("should return features lost with display names (diamond -> gold)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: goldPlan, tiers: goldTiers } =
        await PlanFactory.createPaid("gold");
      const { plan: diamondPlan, tiers: diamondTiers } =
        await PlanFactory.createPaid("diamond");

      await SubscriptionFactory.create(result.organizationId, diamondPlan.id, {
        pricingTierId: diamondTiers[0].id,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPlanId: goldPlan.id,
            newTierId: goldTiers[0].id,
          }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.data.featuresGained).toEqual([]);
      expect(body.data.featuresLost).toContain("Aniversariantes");
      expect(body.data.featuresLost).toContain("EPI");
      expect(body.data.featuresLost).toContain("Ficha Cadastral");
    });

    test("should handle tier change only (same features)", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      const { plan: goldPlan, tiers } = await PlanFactory.createPaid("gold");

      await SubscriptionFactory.create(result.organizationId, goldPlan.id, {
        pricingTierId: tiers[0].id,
      });

      await BillingProfileFactory.create({
        organizationId: result.organizationId,
      });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: {
            ...result.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ newTierId: tiers[1].id }),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // Same plan, different tier = no feature changes
      expect(body.data.featuresGained).toEqual([]);
      expect(body.data.featuresLost).toEqual([]);
    });
  });
});

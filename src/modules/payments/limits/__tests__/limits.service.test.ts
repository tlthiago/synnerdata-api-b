import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  EmployeeLimitReachedError,
  FeatureNotAvailableError,
} from "@/modules/payments/errors";
import {
  clearPlanDisplayNamesCache,
  LimitsService,
} from "@/modules/payments/limits/limits.service";
import { PLAN_FEATURES } from "@/modules/payments/plans/plans.constants";
import {
  type CreatePlanResult,
  createPaidPlan,
  createTrialPlan,
} from "@/test/factories/plan";
import { createTestEmployees } from "@/test/helpers/employee";
import { createTestSubscription } from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";

let goldPlanResult: CreatePlanResult;
let diamondPlanResult: CreatePlanResult;
let platinumPlanResult: CreatePlanResult;
let trialPlanResult: CreatePlanResult;

// Generate unique suffix for this test run to avoid name conflicts
const testSuffix = crypto.randomUUID().slice(0, 8);

describe("LimitsService", () => {
  beforeAll(async () => {
    // Clear cache to ensure fresh data from our test plans
    clearPlanDisplayNamesCache();

    // Create plans with proper sortOrder for hierarchy testing
    [goldPlanResult, diamondPlanResult, platinumPlanResult, trialPlanResult] =
      await Promise.all([
        createPaidPlan("gold", { name: `gold-${testSuffix}`, sortOrder: 1 }),
        createPaidPlan("diamond", {
          name: `diamond-${testSuffix}`,
          sortOrder: 2,
        }),
        createPaidPlan("platinum", {
          name: `platinum-${testSuffix}`,
          sortOrder: 3,
        }),
        createTrialPlan(),
      ]);
  });

  afterAll(() => {
    // Clear cache after tests
    clearPlanDisplayNamesCache();
  });

  describe("checkFeature()", () => {
    test("should return hasAccess true for feature in plan", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        goldPlanResult.plan.id,
        "active"
      );

      const result = await LimitsService.checkFeature(
        organizationId,
        "absences"
      );

      expect(result.hasAccess).toBe(true);
      expect(result.featureName).toBe("absences");
    });

    test("should return hasAccess false for feature not in plan", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      // Gold plan doesn't have payroll feature (platinum only)
      await createTestSubscription(
        organizationId,
        goldPlanResult.plan.id,
        "active"
      );

      const result = await LimitsService.checkFeature(
        organizationId,
        "payroll"
      );

      expect(result.hasAccess).toBe(false);
      // Display name comes from DB - just verify it's a non-null string
      // (can vary due to test data: "Platina", "Test Platinum", etc.)
      expect(result.requiredPlan).toBeString();
      expect(result.requiredPlan).not.toBe("");
    });

    test("should return hasAccess true for trial subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        diamondPlanResult.plan.id,
        "trial"
      );

      const result = await LimitsService.checkFeature(
        organizationId,
        "birthdays" // Diamond feature
      );

      expect(result.hasAccess).toBe(true);
    });

    test("should return hasAccess false for canceled subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        platinumPlanResult.plan.id,
        "canceled"
      );

      const result = await LimitsService.checkFeature(
        organizationId,
        "payroll"
      );

      expect(result.hasAccess).toBe(false);
    });

    test("should return hasAccess false for organization without subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      // Delete any auto-created subscriptions
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      const result = await LimitsService.checkFeature(
        organizationId,
        "absences"
      );

      expect(result.hasAccess).toBe(false);
    });
  });

  describe("checkFeatures()", () => {
    test("should check multiple features at once", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        diamondPlanResult.plan.id,
        "active"
      );

      const result = await LimitsService.checkFeatures(organizationId, [
        "absences", // Gold feature - should have access
        "birthdays", // Diamond feature - should have access
        "payroll", // Platinum feature - should NOT have access
      ]);

      expect(result.features.length).toBe(3);
      expect(result.planName).toBe(`diamond-${testSuffix}`);
      expect(result.planDisplayName).toBe(diamondPlanResult.plan.displayName);

      const absences = result.features.find(
        (f) => f.featureName === "absences"
      );
      const birthdays = result.features.find(
        (f) => f.featureName === "birthdays"
      );
      const payroll = result.features.find((f) => f.featureName === "payroll");

      expect(absences?.hasAccess).toBe(true);
      expect(birthdays?.hasAccess).toBe(true);
      expect(payroll?.hasAccess).toBe(false);
      // Display name comes from DB - just verify it's a non-null string
      expect(payroll?.requiredPlan).toBeString();
    });
  });

  describe("requireFeature()", () => {
    test("should not throw for available feature", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        goldPlanResult.plan.id,
        "active"
      );

      await expect(
        LimitsService.requireFeature(organizationId, "absences")
      ).resolves.toBeUndefined();
    });

    test("should throw FeatureNotAvailableError for unavailable feature", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        goldPlanResult.plan.id,
        "active"
      );

      await expect(
        LimitsService.requireFeature(organizationId, "payroll")
      ).rejects.toThrow(FeatureNotAvailableError);
    });
  });

  describe("getAvailableFeatures()", () => {
    test("should return all features for gold plan", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        goldPlanResult.plan.id,
        "active"
      );

      const features = await LimitsService.getAvailableFeatures(organizationId);

      expect(features).toBeArray();
      expect(features).toContain("absences");
      expect(features).toContain("medical_certificates");
      expect(features).not.toContain("birthdays"); // Diamond feature
      expect(features).not.toContain("payroll"); // Platinum feature
    });

    test("should return all features for platinum plan", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        platinumPlanResult.plan.id,
        "active"
      );

      const features = await LimitsService.getAvailableFeatures(organizationId);

      expect(features).toContain("absences"); // Gold feature
      expect(features).toContain("birthdays"); // Diamond feature
      expect(features).toContain("payroll"); // Platinum feature
    });

    test("should return empty array for organization without subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      const features = await LimitsService.getAvailableFeatures(organizationId);

      expect(features).toBeArray();
      expect(features.length).toBe(0);
    });
  });

  describe("hasPlanOrHigher()", () => {
    test("should return true when organization has same plan", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        diamondPlanResult.plan.id,
        "active"
      );

      const result = await LimitsService.hasPlanOrHigher(
        organizationId,
        "diamond"
      );

      expect(result).toBe(true);
    });

    test("should return true when organization has higher plan", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        platinumPlanResult.plan.id,
        "active"
      );

      const result = await LimitsService.hasPlanOrHigher(
        organizationId,
        "gold"
      );

      expect(result).toBe(true);
    });

    test("should return false when organization has lower plan", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        goldPlanResult.plan.id,
        "active"
      );

      const result = await LimitsService.hasPlanOrHigher(
        organizationId,
        "platinum"
      );

      expect(result).toBe(false);
    });

    test("should return false for organization without subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      const result = await LimitsService.hasPlanOrHigher(
        organizationId,
        "gold"
      );

      expect(result).toBe(false);
    });
  });

  describe("getCapabilities()", () => {
    test("should return full capabilities for active subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        diamondPlanResult.plan.id,
        "active"
      );

      const capabilities = await LimitsService.getCapabilities(organizationId);

      expect(capabilities.subscription.status).toBe("active");
      expect(capabilities.subscription.hasAccess).toBe(true);
      expect(capabilities.subscription.requiresPayment).toBe(false);
      expect(capabilities.plan).not.toBeNull();
      expect(capabilities.plan?.name).toBe(`diamond-${testSuffix}`);
      expect(capabilities.plan?.displayName).toBe(
        diamondPlanResult.plan.displayName
      );
      expect(capabilities.features).toBeArray();
      expect(capabilities.availableFeatures).toContain("birthdays");
      expect(capabilities.availableFeatures).not.toContain("payroll");
    });

    test("should return full capabilities for trial subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      // Use actual trial plan (isTrial=true) for proper trial behavior
      await createTestSubscription(
        organizationId,
        trialPlanResult.plan.id,
        "trial"
      );

      const capabilities = await LimitsService.getCapabilities(organizationId);

      expect(capabilities.subscription.status).toBe("trial");
      expect(capabilities.subscription.hasAccess).toBe(true);
      expect(capabilities.subscription.daysRemaining).toBeGreaterThan(0);
      expect(capabilities.plan?.name).toBe(trialPlanResult.plan.name);
      // Trial plan has all features (most complete plan for trial period)
      expect(capabilities.availableFeatures).toContain("payroll");
    });

    test("should return no access for expired subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(organizationId, goldPlanResult.plan.id, {
        status: "expired",
      });

      const capabilities = await LimitsService.getCapabilities(organizationId);

      expect(capabilities.subscription.status).toBe("expired");
      expect(capabilities.subscription.hasAccess).toBe(false);
      expect(capabilities.subscription.requiresPayment).toBe(true);
      expect(capabilities.plan).toBeNull();
      expect(capabilities.availableFeatures.length).toBe(0);
    });

    test("should return no access for canceled subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(organizationId, goldPlanResult.plan.id, {
        status: "canceled",
      });

      const capabilities = await LimitsService.getCapabilities(organizationId);

      expect(capabilities.subscription.status).toBe("canceled");
      expect(capabilities.subscription.hasAccess).toBe(false);
      expect(capabilities.plan).toBeNull();
    });

    test("should return no subscription status for org without subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      const capabilities = await LimitsService.getCapabilities(organizationId);

      expect(capabilities.subscription.status).toBe("no_subscription");
      expect(capabilities.subscription.hasAccess).toBe(false);
      expect(capabilities.subscription.requiresPayment).toBe(true);
      expect(capabilities.plan).toBeNull();
      expect(capabilities.availableFeatures.length).toBe(0);
    });

    test("should include all features with access status", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        goldPlanResult.plan.id,
        "active"
      );

      const capabilities = await LimitsService.getCapabilities(organizationId);

      // Should have all features listed
      expect(capabilities.features.length).toBeGreaterThan(0);

      // Gold features should have access
      const absencesFeature = capabilities.features.find(
        (f) => f.featureName === "absences"
      );
      expect(absencesFeature?.hasAccess).toBe(true);

      // Platinum features should not have access and show required plan
      const payrollFeature = capabilities.features.find(
        (f) => f.featureName === "payroll"
      );
      expect(payrollFeature?.hasAccess).toBe(false);
      // Display name comes from DB - just verify it's a non-null string
      expect(payrollFeature?.requiredPlan).toBeString();
    });
  });

  describe("Plan feature inheritance", () => {
    test("diamond plan should have all gold features plus diamond features", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        diamondPlanResult.plan.id,
        "active"
      );

      const features = await LimitsService.getAvailableFeatures(organizationId);

      // Should have gold features
      for (const goldFeature of PLAN_FEATURES.gold) {
        expect(features).toContain(goldFeature);
      }

      // Should have diamond features
      for (const diamondFeature of PLAN_FEATURES.diamond) {
        expect(features).toContain(diamondFeature);
      }
    });

    test("platinum plan should have all features", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await createTestSubscription(
        organizationId,
        platinumPlanResult.plan.id,
        "active"
      );

      const features = await LimitsService.getAvailableFeatures(organizationId);

      // Should have all features from all plans
      const allFeatures = [
        ...PLAN_FEATURES.gold,
        ...PLAN_FEATURES.diamond,
        ...PLAN_FEATURES.platinum,
      ];

      for (const feature of allFeatures) {
        expect(features).toContain(feature);
      }
    });
  });

  describe("checkEmployeeLimit()", () => {
    test("should return current count and limit for organization with subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      // Use first tier (0-10 employees)
      const pricingTierId = goldPlanResult.tiers[0].id;

      await createTestSubscription(organizationId, goldPlanResult.plan.id, {
        status: "active",
        pricingTierId,
      });

      const result = await LimitsService.checkEmployeeLimit(organizationId);

      expect(result.current).toBe(0);
      expect(result.limit).toBe(10); // First tier maxEmployees
      expect(result.canAdd).toBe(true);
    });

    test("should return canAdd false when limit is reached", async () => {
      const { organizationId, user } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      // Use first tier (0-10 employees)
      const pricingTierId = goldPlanResult.tiers[0].id;

      await createTestSubscription(organizationId, goldPlanResult.plan.id, {
        status: "active",
        pricingTierId,
      });

      // Create employees up to the limit
      await createTestEmployees({
        organizationId,
        userId: user.id,
        count: 10,
      });

      const result = await LimitsService.checkEmployeeLimit(organizationId);

      expect(result.current).toBe(10);
      expect(result.limit).toBe(10);
      expect(result.canAdd).toBe(false);
    });

    test("should return zero limit for organization without subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      const result = await LimitsService.checkEmployeeLimit(organizationId);

      expect(result.current).toBe(0);
      expect(result.limit).toBe(0);
      expect(result.canAdd).toBe(false);
    });
  });

  describe("requireEmployeeLimit()", () => {
    test("should not throw when under limit", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const pricingTierId = goldPlanResult.tiers[0].id;

      await createTestSubscription(organizationId, goldPlanResult.plan.id, {
        status: "active",
        pricingTierId,
      });

      await expect(
        LimitsService.requireEmployeeLimit(organizationId)
      ).resolves.toBeUndefined();
    });

    test("should throw EmployeeLimitReachedError when limit is reached", async () => {
      const { organizationId, user } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const pricingTierId = goldPlanResult.tiers[0].id;

      await createTestSubscription(organizationId, goldPlanResult.plan.id, {
        status: "active",
        pricingTierId,
      });

      // Create employees up to the limit
      await createTestEmployees({
        organizationId,
        userId: user.id,
        count: 10,
      });

      await expect(
        LimitsService.requireEmployeeLimit(organizationId)
      ).rejects.toThrow(EmployeeLimitReachedError);
    });
  });

  describe("getEmployeeUsagePercentage()", () => {
    test("should return 0 when no employees", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const pricingTierId = goldPlanResult.tiers[0].id;

      await createTestSubscription(organizationId, goldPlanResult.plan.id, {
        status: "active",
        pricingTierId,
      });

      const percentage =
        await LimitsService.getEmployeeUsagePercentage(organizationId);

      expect(percentage).toBe(0);
    });

    test("should return correct percentage", async () => {
      const { organizationId, user } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      const pricingTierId = goldPlanResult.tiers[0].id;

      await createTestSubscription(organizationId, goldPlanResult.plan.id, {
        status: "active",
        pricingTierId,
      });

      // Create 5 employees (50% of limit 10)
      await createTestEmployees({
        organizationId,
        userId: user.id,
        count: 5,
      });

      const percentage =
        await LimitsService.getEmployeeUsagePercentage(organizationId);

      expect(percentage).toBe(50);
    });

    test("should return 100 when limit is zero", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      const percentage =
        await LimitsService.getEmployeeUsagePercentage(organizationId);

      expect(percentage).toBe(100);
    });
  });
});

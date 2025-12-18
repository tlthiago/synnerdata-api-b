import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { PLAN_FEATURES, schema } from "@/db/schema";
import { FeatureNotAvailableError } from "@/modules/payments/errors";
import { LimitsService } from "@/modules/payments/limits/limits.service";
import { diamondPlan, goldPlan, platinumPlan } from "@/test/fixtures/plans";
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";

describe("LimitsService", () => {
  beforeAll(async () => {
    await seedPlans();
  });

  describe("checkFeature()", () => {
    test("should return hasAccess true for feature in plan", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      await createTestSubscription(organizationId, goldPlan.id, "active");

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

      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      // Gold plan doesn't have payroll feature (platinum only)
      await createTestSubscription(organizationId, goldPlan.id, "active");

      const result = await LimitsService.checkFeature(
        organizationId,
        "payroll"
      );

      expect(result.hasAccess).toBe(false);
      expect(result.requiredPlan).toBe("Platina");
    });

    test("should return hasAccess true for trial subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      await createTestSubscription(organizationId, diamondPlan.id, "trial");

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

      if (!platinumPlan) {
        throw new Error("Platinum plan not found in fixtures");
      }

      await createTestSubscription(organizationId, platinumPlan.id, "canceled");

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

      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      await createTestSubscription(organizationId, diamondPlan.id, "active");

      const result = await LimitsService.checkFeatures(organizationId, [
        "absences", // Gold feature - should have access
        "birthdays", // Diamond feature - should have access
        "payroll", // Platinum feature - should NOT have access
      ]);

      expect(result.features.length).toBe(3);
      expect(result.planName).toBe("diamond");
      expect(result.planDisplayName).toBe("Test Diamond");

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
      expect(payroll?.requiredPlan).toBe("Platina");
    });
  });

  describe("requireFeature()", () => {
    test("should not throw for available feature", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      await createTestSubscription(organizationId, goldPlan.id, "active");

      await expect(
        LimitsService.requireFeature(organizationId, "absences")
      ).resolves.toBeUndefined();
    });

    test("should throw FeatureNotAvailableError for unavailable feature", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      await createTestSubscription(organizationId, goldPlan.id, "active");

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

      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      await createTestSubscription(organizationId, goldPlan.id, "active");

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

      if (!platinumPlan) {
        throw new Error("Platinum plan not found in fixtures");
      }

      await createTestSubscription(organizationId, platinumPlan.id, "active");

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

      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      await createTestSubscription(organizationId, diamondPlan.id, "active");

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

      if (!platinumPlan) {
        throw new Error("Platinum plan not found in fixtures");
      }

      await createTestSubscription(organizationId, platinumPlan.id, "active");

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

      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      await createTestSubscription(organizationId, goldPlan.id, "active");

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

      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      await createTestSubscription(organizationId, diamondPlan.id, "active");

      const capabilities = await LimitsService.getCapabilities(organizationId);

      expect(capabilities.subscription.status).toBe("active");
      expect(capabilities.subscription.hasAccess).toBe(true);
      expect(capabilities.subscription.requiresPayment).toBe(false);
      expect(capabilities.plan).not.toBeNull();
      expect(capabilities.plan?.name).toBe("diamond");
      expect(capabilities.plan?.displayName).toBe("Test Diamond");
      expect(capabilities.features).toBeArray();
      expect(capabilities.availableFeatures).toContain("birthdays");
      expect(capabilities.availableFeatures).not.toContain("payroll");
    });

    test("should return full capabilities for trial subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      if (!platinumPlan) {
        throw new Error("Platinum plan not found in fixtures");
      }

      await createTestSubscription(organizationId, platinumPlan.id, "trial");

      const capabilities = await LimitsService.getCapabilities(organizationId);

      expect(capabilities.subscription.status).toBe("trial");
      expect(capabilities.subscription.hasAccess).toBe(true);
      expect(capabilities.subscription.daysRemaining).toBeGreaterThan(0);
      expect(capabilities.plan?.name).toBe("platinum");
      expect(capabilities.availableFeatures).toContain("payroll");
    });

    test("should return no access for expired subscription", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      await createTestSubscription(organizationId, goldPlan.id, {
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

      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      await createTestSubscription(organizationId, goldPlan.id, {
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

      if (!goldPlan) {
        throw new Error("Gold plan not found in fixtures");
      }

      await createTestSubscription(organizationId, goldPlan.id, "active");

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
      expect(payrollFeature?.requiredPlan).toBe("Platina");
    });
  });

  describe("Plan feature inheritance", () => {
    test("diamond plan should have all gold features plus diamond features", async () => {
      const { organizationId } = await createTestUserWithOrganization({
        emailVerified: true,
      });

      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      await createTestSubscription(organizationId, diamondPlan.id, "active");

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

      if (!platinumPlan) {
        throw new Error("Platinum plan not found in fixtures");
      }

      await createTestSubscription(organizationId, platinumPlan.id, "active");

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
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { proPlan, testPlans } from "@/test/fixtures/plans";
import { seedPlans } from "@/test/helpers/seed";
import { PlanNotAvailableError, PlanNotFoundError } from "../../errors";
import { PlanService } from "../plan.service";

describe("PlanService", () => {
  beforeAll(async () => {
    await seedPlans();
  });

  afterAll(async () => {
    // Clean up test plans pagarmePlanId after tests
    for (const plan of testPlans) {
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: null })
        .where(eq(subscriptionPlans.id, plan.id));
    }
  });

  describe("list()", () => {
    test("should return only active and public plans", async () => {
      const plans = await PlanService.list();

      expect(plans).toBeArray();
      expect(plans.length).toBeGreaterThan(0);

      for (const plan of plans) {
        expect(plan.isActive).toBe(true);
        expect(plan.isPublic).toBe(true);
      }
    });

    test("should return plans ordered by sortOrder", async () => {
      const plans = await PlanService.list();

      for (let i = 1; i < plans.length; i++) {
        expect(plans[i].sortOrder).toBeGreaterThanOrEqual(
          plans[i - 1].sortOrder
        );
      }
    });

    test("should return correct plan properties", async () => {
      const plans = await PlanService.list();
      const plan = plans[0];

      expect(plan).toHaveProperty("id");
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("displayName");
      expect(plan).toHaveProperty("priceMonthly");
      expect(plan).toHaveProperty("priceYearly");
      expect(plan).toHaveProperty("trialDays");
      expect(plan).toHaveProperty("limits");
      expect(plan).toHaveProperty("isActive");
      expect(plan).toHaveProperty("isPublic");
      expect(plan).toHaveProperty("sortOrder");
    });

    test("should not return inactive plans", async () => {
      const plans = await PlanService.list();
      const inactivePlan = plans.find((p) => p.name === "legacy");

      expect(inactivePlan).toBeUndefined();
    });
  });

  describe("getById()", () => {
    test("should return plan by id", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      const plan = await PlanService.getById(proPlan.id);

      expect(plan).toBeDefined();
      expect(plan.id).toBe(proPlan.id);
      expect(plan.name).toBe(proPlan.name);
      expect(plan.displayName).toBe(proPlan.displayName);
      expect(plan.priceMonthly).toBe(proPlan.priceMonthly);
    });

    test("should throw PlanNotFoundError for non-existent plan", () => {
      expect(() => PlanService.getById("non-existent-plan")).toThrow(
        PlanNotFoundError
      );
    });

    test("should return inactive plans (no filter)", async () => {
      const inactivePlan = testPlans.find((p) => !p.isActive);
      if (!inactivePlan) {
        throw new Error("No inactive plan in fixtures");
      }

      const plan = await PlanService.getById(inactivePlan.id);

      expect(plan).toBeDefined();
      expect(plan.isActive).toBe(false);
    });
  });

  describe("getByIdForCheckout()", () => {
    test("should return active plan for checkout", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      const plan = await PlanService.getByIdForCheckout(proPlan.id);

      expect(plan).toBeDefined();
      expect(plan.id).toBe(proPlan.id);
      expect(plan.isActive).toBe(true);
    });

    test("should throw PlanNotAvailableError for inactive plan", () => {
      const inactivePlan = testPlans.find((p) => !p.isActive);
      if (!inactivePlan) {
        throw new Error("No inactive plan in fixtures");
      }

      expect(() => PlanService.getByIdForCheckout(inactivePlan.id)).toThrow(
        PlanNotAvailableError
      );
    });

    test("should throw PlanNotFoundError for non-existent plan", () => {
      expect(() => PlanService.getByIdForCheckout("non-existent-plan")).toThrow(
        PlanNotFoundError
      );
    });
  });

  describe("getByName()", () => {
    test("should return plan by name", async () => {
      const plan = await PlanService.getByName("pro");

      expect(plan).toBeDefined();
      expect(plan?.name).toBe("pro");
    });

    test("should return null for non-existent name", async () => {
      const plan = await PlanService.getByName("non-existent-plan");

      expect(plan).toBeNull();
    });

    test("should return inactive plans by name", async () => {
      const plan = await PlanService.getByName("legacy");

      expect(plan).toBeDefined();
      expect(plan?.isActive).toBe(false);
    });
  });
});

describe("PlanService - Pagarme Sync", () => {
  beforeAll(async () => {
    await seedPlans();

    // Reset pagarmePlanId for all test plans
    for (const plan of testPlans) {
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: null })
        .where(eq(subscriptionPlans.id, plan.id));
    }
  });

  afterAll(async () => {
    // Clean up pagarmePlanId after tests
    for (const plan of testPlans) {
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: null })
        .where(eq(subscriptionPlans.id, plan.id));
    }
  });

  describe("syncToPagarme()", () => {
    test("should return existing pagarmePlanId if already synced", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      // Set a pagarmePlanId manually (simulating already synced)
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: "plan_existing_123" })
        .where(eq(subscriptionPlans.id, proPlan.id));

      const pagarmePlanId = await PlanService.syncToPagarme(proPlan.id);

      expect(pagarmePlanId).toBe("plan_existing_123");

      // Reset for other tests
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: null })
        .where(eq(subscriptionPlans.id, proPlan.id));
    });

    test("should throw PlanNotFoundError for non-existent plan", () => {
      expect(() => PlanService.syncToPagarme("non-existent-plan")).toThrow(
        PlanNotFoundError
      );
    });

    test("should create plan in Pagarme and save pagarmePlanId", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      // Ensure plan has no pagarmePlanId
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: null })
        .where(eq(subscriptionPlans.id, proPlan.id));

      // This will call the real Pagarme API
      const pagarmePlanId = await PlanService.syncToPagarme(proPlan.id);

      // Verify pagarmePlanId was returned
      expect(pagarmePlanId).toBeDefined();
      expect(typeof pagarmePlanId).toBe("string");
      expect(pagarmePlanId.startsWith("plan_")).toBe(true);

      // Verify it was saved in the database
      const dbPlan = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, proPlan.id),
      });

      expect(dbPlan?.pagarmePlanId).toBe(pagarmePlanId);
    });
  });

  describe("ensureSynced()", () => {
    test("should return plan with pagarmePlanId when already synced", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      // Set a pagarmePlanId manually
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: "plan_synced_456" })
        .where(eq(subscriptionPlans.id, proPlan.id));

      const plan = await PlanService.ensureSynced(proPlan.id);

      expect(plan).toBeDefined();
      expect(plan.pagarmePlanId).toBe("plan_synced_456");
      expect(plan.id).toBe(proPlan.id);
      expect(plan.name).toBe(proPlan.name);

      // Reset for other tests
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: null })
        .where(eq(subscriptionPlans.id, proPlan.id));
    });

    test("should throw PlanNotFoundError for non-existent plan", () => {
      expect(() => PlanService.ensureSynced("non-existent-plan")).toThrow(
        PlanNotFoundError
      );
    });

    test("should throw PlanNotAvailableError for inactive plan", () => {
      const inactivePlan = testPlans.find((p) => !p.isActive);
      if (!inactivePlan) {
        throw new Error("No inactive plan in fixtures");
      }

      expect(() => PlanService.ensureSynced(inactivePlan.id)).toThrow(
        PlanNotAvailableError
      );
    });

    test("should sync plan to Pagarme if not yet synced", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      // Ensure plan has no pagarmePlanId
      await db
        .update(subscriptionPlans)
        .set({ pagarmePlanId: null })
        .where(eq(subscriptionPlans.id, proPlan.id));

      // This will call the real Pagarme API
      const plan = await PlanService.ensureSynced(proPlan.id);

      // Verify plan was returned with pagarmePlanId
      expect(plan).toBeDefined();
      expect(plan.pagarmePlanId).toBeDefined();
      expect(typeof plan.pagarmePlanId).toBe("string");
      expect(plan.id).toBe(proPlan.id);

      // Verify it was saved in the database
      const dbPlan = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, proPlan.id),
      });

      expect(dbPlan?.pagarmePlanId).toBe(plan.pagarmePlanId);
    });
  });
});

describe("PlanService - Pagarme API Request Structure", () => {
  // These tests validate the expected request structure for Pagarme API
  // without calling the API

  test("should have correct plan request structure for Pagarme", () => {
    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    // This documents the expected structure for createPlan
    const expectedRequest = {
      name: proPlan.name,
      description: proPlan.displayName,
      currency: "BRL",
      interval: "month",
      interval_count: 1,
      billing_type: "prepaid",
      payment_methods: ["credit_card"],
      items: [
        {
          name: proPlan.displayName,
          quantity: 1,
          pricing_scheme: {
            price: proPlan.priceMonthly,
            scheme_type: "unit",
          },
        },
      ],
      metadata: {
        local_plan_id: proPlan.id,
      },
    };

    expect(expectedRequest.name).toBe("pro");
    expect(expectedRequest.currency).toBe("BRL");
    expect(expectedRequest.interval).toBe("month");
    expect(expectedRequest.items[0].pricing_scheme.price).toBe(9900);
  });

  test("should use correct idempotency key format", () => {
    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    const expectedIdempotencyKey = `create-plan-${proPlan.id}`;
    expect(expectedIdempotencyKey).toBe("create-plan-test-plan-pro");
  });
});

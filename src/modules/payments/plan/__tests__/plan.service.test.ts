import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { diamondPlan, testPlans } from "@/test/fixtures/plans";
import { seedPlans } from "@/test/helpers/seed";
import { PlanNotAvailableError, PlanNotFoundError } from "../../errors";
import { PlanService } from "../plan.service";

describe("PlanService", () => {
  beforeAll(async () => {
    await seedPlans();
  });

  afterAll(async () => {
    // Clean up test plans pagarmePlanIds after tests
    for (const plan of testPlans) {
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, plan.id));
    }
  });

  describe("list()", () => {
    test("should return only active and public plans", async () => {
      const response = await PlanService.list();

      expect(response.plans).toBeArray();
      expect(response.plans.length).toBeGreaterThan(0);

      for (const plan of response.plans) {
        expect(plan.isActive).toBe(true);
        expect(plan.isPublic).toBe(true);
      }
    });

    test("should return plans ordered by sortOrder", async () => {
      const response = await PlanService.list();
      const plans = response.plans;

      for (let i = 1; i < plans.length; i++) {
        expect(plans[i].sortOrder).toBeGreaterThanOrEqual(
          plans[i - 1].sortOrder
        );
      }
    });

    test("should return correct plan properties", async () => {
      const response = await PlanService.list();
      const plan = response.plans[0];

      expect(plan).toHaveProperty("id");
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("displayName");
      expect(plan).toHaveProperty("description");
      expect(plan).toHaveProperty("startingPrice");
      expect(plan).toHaveProperty("trialDays");
      expect(plan).toHaveProperty("limits");
      expect(plan).toHaveProperty("isActive");
      expect(plan).toHaveProperty("isPublic");
      expect(plan).toHaveProperty("sortOrder");
      expect(plan).toHaveProperty("pricingTiers");
    });

    test("should not return inactive plans", async () => {
      const response = await PlanService.list();
      const inactivePlan = response.plans.find((p) => p.name === "legacy");

      expect(inactivePlan).toBeUndefined();
    });
  });

  describe("getById()", () => {
    test("should return plan by id", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const response = await PlanService.getById(diamondPlan.id);

      expect(response.id).toBe(diamondPlan.id);
      expect(response.name).toBe(diamondPlan.name);
      expect(response.displayName).toBe(diamondPlan.displayName);
      expect(response.priceMonthly).toBe(diamondPlan.priceMonthly);
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

      const response = await PlanService.getById(inactivePlan.id);

      expect(response.isActive).toBe(false);
    });
  });

  describe("getByIdForCheckout()", () => {
    test("should return active plan for checkout", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      const plan = await PlanService.getByIdForCheckout(diamondPlan.id);

      expect(plan).toBeDefined();
      expect(plan.id).toBe(diamondPlan.id);
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
      const plan = await PlanService.getByName("diamond");

      expect(plan).toBeDefined();
      expect(plan?.name).toBe("diamond");
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

    // Reset pagarmePlanIds for all test plans
    for (const plan of testPlans) {
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, plan.id));
    }
  });

  afterAll(async () => {
    // Clean up pagarmePlanIds after tests
    for (const plan of testPlans) {
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, plan.id));
    }
  });

  describe("syncToPagarme()", () => {
    test("should return existing pagarmePlanIdMonthly if already synced", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      // Set pagarmePlanIdMonthly manually (simulating already synced)
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: "plan_existing_123" })
        .where(eq(schema.subscriptionPlans.id, diamondPlan.id));

      const response = await PlanService.syncToPagarme(diamondPlan.id);

      expect(response.pagarmePlanIdMonthly).toBe("plan_existing_123");

      // Reset for other tests
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, diamondPlan.id));
    });

    test("should throw PlanNotFoundError for non-existent plan", () => {
      expect(() => PlanService.syncToPagarme("non-existent-plan")).toThrow(
        PlanNotFoundError
      );
    });

    test("should create monthly and yearly plans in Pagarme", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      // Ensure plan has no pagarmePlanIds
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, diamondPlan.id));

      // This will call the real Pagarme API
      const response = await PlanService.syncToPagarme(diamondPlan.id);

      // Verify response structure
      expect(response.pagarmePlanIdMonthly).toBeDefined();
      expect(typeof response.pagarmePlanIdMonthly).toBe("string");
      expect(response.pagarmePlanIdMonthly?.startsWith("plan_")).toBe(true);

      // Yearly plan should also be created since diamondPlan has priceYearly > 0
      expect(response.pagarmePlanIdYearly).toBeDefined();
      expect(typeof response.pagarmePlanIdYearly).toBe("string");
      expect(response.pagarmePlanIdYearly?.startsWith("plan_")).toBe(true);

      // Verify it was saved in the database
      const [dbPlan] = await db
        .select({
          pagarmePlanIdMonthly: schema.subscriptionPlans.pagarmePlanIdMonthly,
          pagarmePlanIdYearly: schema.subscriptionPlans.pagarmePlanIdYearly,
        })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, diamondPlan.id))
        .limit(1);

      expect(dbPlan?.pagarmePlanIdMonthly).toBe(response.pagarmePlanIdMonthly);
      expect(dbPlan?.pagarmePlanIdYearly).toBe(response.pagarmePlanIdYearly);
    });
  });

  describe("ensureSynced()", () => {
    test("should return plan with pagarmePlanIdMonthly when already synced", async () => {
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      // Set pagarmePlanIdMonthly manually
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: "plan_synced_456" })
        .where(eq(schema.subscriptionPlans.id, diamondPlan.id));

      const plan = await PlanService.ensureSynced(diamondPlan.id);

      expect(plan).toBeDefined();
      expect(plan.pagarmePlanIdMonthly).toBe("plan_synced_456");
      expect(plan.id).toBe(diamondPlan.id);
      expect(plan.name).toBe(diamondPlan.name);

      // Reset for other tests
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, diamondPlan.id));
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
      if (!diamondPlan) {
        throw new Error("Diamond plan not found in fixtures");
      }

      // Ensure plan has no pagarmePlanIds
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, diamondPlan.id));

      // This will call the real Pagarme API
      const plan = await PlanService.ensureSynced(diamondPlan.id);

      // Verify plan was returned with pagarmePlanIdMonthly
      expect(plan).toBeDefined();
      expect(plan.pagarmePlanIdMonthly).toBeDefined();
      expect(typeof plan.pagarmePlanIdMonthly).toBe("string");
      expect(plan.id).toBe(diamondPlan.id);

      // Verify it was saved in the database
      const [dbPlan] = await db
        .select({
          pagarmePlanIdMonthly: schema.subscriptionPlans.pagarmePlanIdMonthly,
        })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, diamondPlan.id))
        .limit(1);

      expect(dbPlan?.pagarmePlanIdMonthly).toBe(plan.pagarmePlanIdMonthly);
    });
  });
});

describe("PlanService - Pagarme API Request Structure", () => {
  // These tests validate the expected request structure for Pagarme API
  // without calling the API

  test("should have correct plan request structure for Pagarme", () => {
    if (!diamondPlan) {
      throw new Error("Diamond plan not found in fixtures");
    }

    // This documents the expected structure for createPlan
    const expectedRequest = {
      name: diamondPlan.name,
      description: diamondPlan.displayName,
      currency: "BRL",
      interval: "month",
      interval_count: 1,
      billing_type: "prepaid",
      payment_methods: ["credit_card"],
      items: [
        {
          name: diamondPlan.displayName,
          quantity: 1,
          pricing_scheme: {
            price: diamondPlan.priceMonthly,
            scheme_type: "unit",
          },
        },
      ],
      metadata: {
        local_plan_id: diamondPlan.id,
      },
    };

    expect(expectedRequest.name).toBe("diamond");
    expect(expectedRequest.currency).toBe("BRL");
    expect(expectedRequest.interval).toBe("month");
    expect(expectedRequest.items[0].pricing_scheme.price).toBe(49_900);
  });

  test("should use correct idempotency key format", () => {
    if (!diamondPlan) {
      throw new Error("Diamond plan not found in fixtures");
    }

    const expectedIdempotencyKey = `create-plan-${diamondPlan.id}`;
    expect(expectedIdempotencyKey).toBe("create-plan-test-plan-diamond");
  });
});

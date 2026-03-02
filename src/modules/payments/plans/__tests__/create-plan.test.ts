import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { EMPLOYEE_TIERS } from "../plans.constants";

const BASE_URL = env.API_URL;

const GOLD_FEATURES = [
  "terminated_employees",
  "absences",
  "medical_certificates",
  "accidents",
  "warnings",
  "employee_status",
];
const DIAMOND_FEATURES = [
  "terminated_employees",
  "absences",
  "medical_certificates",
  "accidents",
  "warnings",
  "employee_status",
  "birthdays",
  "ppe",
  "employee_record",
];
const TRIAL_FEATURES = [
  "terminated_employees",
  "absences",
  "medical_certificates",
  "accidents",
  "warnings",
  "employee_status",
  "birthdays",
  "ppe",
  "employee_record",
  "payroll",
];

function generateTierPrices(basePrice: number) {
  return EMPLOYEE_TIERS.map((tier, index) => ({
    minEmployees: tier.min,
    maxEmployees: tier.max,
    priceMonthly: basePrice + index * 1000,
  }));
}

function generateUniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

describe("POST /payments/plans", () => {
  let app: TestApp;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    authHeaders = headers;
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "test-plan",
          displayName: "Test Plan",
          features: GOLD_FEATURES,
          pricingTiers: generateTierPrices(4900),
        }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("should reject non-admin users", async () => {
    const { headers: nonAdminHeaders } = await UserFactory.create({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...nonAdminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("test-non-admin"),
          displayName: "Test Non Admin Plan",
          features: GOLD_FEATURES,
          pricingTiers: generateTierPrices(4900),
        }),
      })
    );
    expect(response.status).toBe(403);
  });

  test("should create plan with valid data", async () => {
    const tierPrices = generateTierPrices(4900);
    const planData = {
      name: generateUniqueName("test-create"),
      displayName: "Test Create Plan",
      trialDays: 7,
      features: DIAMOND_FEATURES,
      isActive: true,
      isPublic: true,
      sortOrder: 10,
      pricingTiers: tierPrices,
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toStartWith("plan-");
    expect(body.data.name).toBe(planData.name);
    expect(body.data.displayName).toBe(planData.displayName);
    expect(body.data.trialDays).toBe(planData.trialDays);
    expect(body.data.features).toEqual(planData.features);
    expect(body.data.isActive).toBe(planData.isActive);
    expect(body.data.isPublic).toBe(planData.isPublic);
    expect(body.data.sortOrder).toBe(planData.sortOrder);
    expect(body.data.pricingTiers).toBeArray();
    expect(body.data.pricingTiers.length).toBe(10);
    expect(body.data.startingPriceMonthly).toBe(tierPrices[0].priceMonthly);
  });

  test("should reject duplicate plan name", async () => {
    const planData = {
      name: generateUniqueName("test-duplicate"),
      displayName: "Test Duplicate Plan",
      features: GOLD_FEATURES,
      pricingTiers: generateTierPrices(1000),
    };

    const firstResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );
    expect(firstResponse.status).toBe(200);

    const secondResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );
    expect(secondResponse.status).toBe(400);

    const errorBody = await secondResponse.json();
    expect(errorBody.error.code).toBe("PLAN_NAME_ALREADY_EXISTS");
  });

  test("should reject invalid data - missing required fields", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "incomplete-plan",
        }),
      })
    );
    expect(response.status).toBe(422);
  });

  test("should reject invalid data - negative price in tier", async () => {
    const invalidTiers = generateTierPrices(1000);
    invalidTiers[0].priceMonthly = -100;

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "negative-price-plan",
          displayName: "Negative Price Plan",
          features: GOLD_FEATURES,
          pricingTiers: invalidTiers,
        }),
      })
    );
    expect(response.status).toBe(422);
  });

  test("should reject paid plan with zero tiers", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("zero-tiers"),
          displayName: "Zero Tiers Plan",
          features: GOLD_FEATURES,
          isTrial: false,
          pricingTiers: [],
        }),
      })
    );
    // Zod min(1) on the schema rejects empty arrays with 422
    expect(response.status).toBe(422);
  });

  test("should apply default values for optional fields", async () => {
    const planData = {
      name: generateUniqueName("test-defaults"),
      displayName: "Test Defaults Plan",
      features: GOLD_FEATURES,
      pricingTiers: generateTierPrices(1000),
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.trialDays).toBe(0);
    expect(body.data.isActive).toBe(true);
    expect(body.data.isPublic).toBe(true);
    expect(body.data.sortOrder).toBe(0);
    expect(body.data.isTrial).toBe(false);
  });

  test("should create trial plan with 1 tier (0-10 employees)", async () => {
    // Archive existing active trial to satisfy unique constraint
    await PlanFactory.archiveActiveTrial();

    const planData = {
      name: generateUniqueName("test-trial"),
      displayName: "Test Trial Plan",
      trialDays: 14,
      isTrial: true,
      isPublic: false,
      features: TRIAL_FEATURES,
      pricingTiers: [{ minEmployees: 0, maxEmployees: 10, priceMonthly: 0 }],
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.trialDays).toBe(14);
    expect(body.data.isTrial).toBe(true);
    expect(body.data.isPublic).toBe(false);
    expect(body.data.pricingTiers).toBeArray();
    expect(body.data.pricingTiers.length).toBe(1);
    expect(body.data.pricingTiers[0].minEmployees).toBe(0);
    expect(body.data.pricingTiers[0].maxEmployees).toBe(10);
    expect(body.data.pricingTiers[0].priceMonthly).toBe(0);
  });

  test("should reject trial plan with wrong tier range", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("test-trial-wrong-range"),
          displayName: "Test Trial Wrong Range",
          isTrial: true,
          features: TRIAL_FEATURES,
          pricingTiers: [
            { minEmployees: 0, maxEmployees: 20, priceMonthly: 0 },
          ],
        }),
      })
    );
    expect(response.status).toBe(422);

    const errorBody = await response.json();
    expect(errorBody.error.code).toBe("INVALID_TIER_RANGE");
  });

  test("should generate correct yearly prices from monthly", async () => {
    const tierPrices = generateTierPrices(10_000);
    const planData = {
      name: generateUniqueName("test-yearly"),
      displayName: "Test Yearly Price Plan",
      features: GOLD_FEATURES,
      pricingTiers: tierPrices,
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();

    const expectedYearlyFirst = Math.round(
      tierPrices[0].priceMonthly * 12 * 0.8
    );
    expect(body.data.pricingTiers[0].priceYearly).toBe(expectedYearlyFirst);
  });

  test("should create paid plan with 3 custom tiers", async () => {
    const tierPrices = [
      { minEmployees: 0, maxEmployees: 50, priceMonthly: 9900 },
      { minEmployees: 51, maxEmployees: 100, priceMonthly: 14_900 },
      { minEmployees: 101, maxEmployees: 500, priceMonthly: 24_900 },
    ];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("custom-3-tiers"),
          displayName: "Custom 3 Tiers Plan",
          features: GOLD_FEATURES,
          pricingTiers: tierPrices,
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.pricingTiers.length).toBe(3);
    expect(body.data.pricingTiers[0].minEmployees).toBe(0);
    expect(body.data.pricingTiers[2].maxEmployees).toBe(500);
  });

  test("should create paid plan with a single tier (0-1000)", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("single-tier"),
          displayName: "Single Tier Plan",
          features: GOLD_FEATURES,
          pricingTiers: [
            { minEmployees: 0, maxEmployees: 1000, priceMonthly: 49_900 },
          ],
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.pricingTiers.length).toBe(1);
    expect(body.data.pricingTiers[0].maxEmployees).toBe(1000);
  });

  test("should reject tiers with overlapping ranges", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("overlap-tiers"),
          displayName: "Overlap Tiers Plan",
          features: GOLD_FEATURES,
          pricingTiers: [
            { minEmployees: 0, maxEmployees: 50, priceMonthly: 9900 },
            { minEmployees: 40, maxEmployees: 100, priceMonthly: 14_900 },
          ],
        }),
      })
    );
    expect(response.status).toBe(422);

    const errorBody = await response.json();
    expect(errorBody.error.code).toBe("TIER_OVERLAP");
  });

  test("should reject tiers with gaps", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("gap-tiers"),
          displayName: "Gap Tiers Plan",
          features: GOLD_FEATURES,
          pricingTiers: [
            { minEmployees: 0, maxEmployees: 50, priceMonthly: 9900 },
            { minEmployees: 61, maxEmployees: 100, priceMonthly: 14_900 },
          ],
        }),
      })
    );
    expect(response.status).toBe(422);

    const errorBody = await response.json();
    expect(errorBody.error.code).toBe("TIER_GAP");
  });

  test("should reject tier with minEmployees > maxEmployees", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("min-gt-max"),
          displayName: "Min GT Max Plan",
          features: GOLD_FEATURES,
          pricingTiers: [
            { minEmployees: 50, maxEmployees: 10, priceMonthly: 9900 },
          ],
        }),
      })
    );
    expect(response.status).toBe(422);

    const errorBody = await response.json();
    expect(errorBody.error.code).toBe("TIER_MIN_EXCEEDS_MAX");
  });

  test("should reject tier with negative minEmployees", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("negative-min"),
          displayName: "Negative Min Plan",
          features: GOLD_FEATURES,
          pricingTiers: [
            { minEmployees: -5, maxEmployees: 10, priceMonthly: 9900 },
          ],
        }),
      })
    );
    expect(response.status).toBe(422);
  });

  test("should still accept standard 10 EMPLOYEE_TIERS", async () => {
    const tierPrices = generateTierPrices(4900);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("standard-10"),
          displayName: "Standard 10 Tiers Plan",
          features: GOLD_FEATURES,
          pricingTiers: tierPrices,
        }),
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.pricingTiers.length).toBe(10);
  });
});

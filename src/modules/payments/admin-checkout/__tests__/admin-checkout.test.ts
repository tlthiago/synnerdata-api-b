import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { generateCnpj, generateMobile } from "@/test/support/faker";
import { skipIntegration } from "@/test/support/skip-integration";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/admin/checkout`;

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org-placeholder",
    basePlanId: "plan-placeholder",
    minEmployees: 0,
    maxEmployees: 25,
    billingCycle: "monthly",
    customPriceMonthly: 5000,
    successUrl: "https://app.example.com/success",
    ...overrides,
  };
}

function buildBillingData(overrides: Record<string, unknown> = {}) {
  return {
    legalName: "Empresa LTDA",
    taxId: generateCnpj(),
    email: "billing@empresa.com",
    phone: generateMobile(),
    street: "Rua Exemplo",
    number: "123",
    neighborhood: "Centro",
    city: "Sao Paulo",
    state: "SP",
    zipCode: "01001000",
    ...overrides,
  };
}

describe("POST /v1/payments/admin/checkout", () => {
  let app: TestApp;
  let trialPlanResult: CreatePlanResult;
  let goldPlanResult: CreatePlanResult;
  let inactivePlanResult: CreatePlanResult;

  beforeAll(async () => {
    app = createTestApp();

    [trialPlanResult, goldPlanResult, inactivePlanResult] = await Promise.all([
      PlanFactory.createTrial(),
      PlanFactory.createPaid("gold"),
      PlanFactory.createInactive({ type: "diamond" }),
    ]);
  });

  // ── Authentication / Authorization ──────────────────────────────

  test("should return 401 without session", async () => {
    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should return 403 for non-admin user", async () => {
    const { headers } = await UserFactory.create();
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            basePlanId: goldPlanResult.plan.id,
          })
        ),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  // ── Validation (422) ────────────────────────────────────────────

  test("should return 422 for empty body", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 when customPriceMonthly is below 100 centavos", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            basePlanId: goldPlanResult.plan.id,
            customPriceMonthly: 50,
          })
        ),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 for missing required fields (no organizationId)", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          basePlanId: goldPlanResult.plan.id,
          minEmployees: 0,
          maxEmployees: 25,
          customPriceMonthly: 5000,
          successUrl: "https://app.example.com/success",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 when maxEmployees <= minEmployees", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            basePlanId: goldPlanResult.plan.id,
            minEmployees: 10,
            maxEmployees: 10,
          })
        ),
      })
    );

    expect(response.status).toBe(422);
  });

  // ── Business Rules ──────────────────────────────────────────────

  test("should return 404 for non-existent organization", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: "org-non-existent-id",
            basePlanId: goldPlanResult.plan.id,
          })
        ),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ORGANIZATION_NOT_FOUND");
  });

  test("should return 400 when organization has active paid subscription", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    await SubscriptionFactory.createActive(org.id, goldPlanResult.plan.id);

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            basePlanId: goldPlanResult.plan.id,
          })
        ),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
  });

  test("should return 404 for non-existent plan (basePlanId)", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            basePlanId: "plan-non-existent",
          })
        ),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });

  test("should return 400 for inactive plan", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            basePlanId: inactivePlanResult.plan.id,
          })
        ),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_AVAILABLE");
  });

  test("should return 400 when basePlanId is a trial plan (TRIAL_PLAN_AS_BASE)", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    await BillingProfileFactory.create({ organizationId: org.id });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            basePlanId: trialPlanResult.plan.id,
          })
        ),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("TRIAL_PLAN_AS_BASE");
  });

  test("should return 400 when billing profile is missing and no billing data provided", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            basePlanId: goldPlanResult.plan.id,
          })
        ),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("BILLING_PROFILE_REQUIRED");
  });

  // ── Success — Pagarme integration ───────────────────────────────

  test.skipIf(skipIntegration)(
    "should create checkout with custom price when billing profile exists",
    async () => {
      const { headers } = await UserFactory.createAdmin();
      const org = await OrganizationFactory.create();

      await BillingProfileFactory.create({ organizationId: org.id });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(
            buildPayload({
              organizationId: org.id,
              basePlanId: goldPlanResult.plan.id,
              minEmployees: 0,
              maxEmployees: 25,
              customPriceMonthly: 5000,
              notes: "Desconto negociado",
            })
          ),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data.checkoutUrl).toBeString();
      expect(body.data.paymentLinkId).toBeString();
      expect(body.data.privatePlanId).toStartWith("plan-");
      expect(body.data.privateTierId).toStartWith("tier-");
      expect(body.data.customPriceMonthly).toBe(5000);
      expect(body.data.customPriceYearly).toBeNumber();
      expect(body.data.basePlanDisplayName).toBe(
        goldPlanResult.plan.displayName
      );
      expect(body.data.minEmployees).toBe(0);
      expect(body.data.maxEmployees).toBe(25);
      expect(body.data.expiresAt).toBeString();

      // Verify private plan was created in DB
      const [privatePlan] = await db
        .select()
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, body.data.privatePlanId))
        .limit(1);

      expect(privatePlan).toBeDefined();
      expect(privatePlan.isPublic).toBe(false);
      expect(privatePlan.isTrial).toBe(false);
      expect(privatePlan.isActive).toBe(true);
      expect(privatePlan.organizationId).toBe(org.id);
      expect(privatePlan.basePlanId).toBe(goldPlanResult.plan.id);

      // Verify private tier was created in DB
      const [privateTier] = await db
        .select()
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.id, body.data.privateTierId))
        .limit(1);

      expect(privateTier).toBeDefined();
      expect(privateTier.planId).toBe(body.data.privatePlanId);
      expect(privateTier.minEmployees).toBe(0);
      expect(privateTier.maxEmployees).toBe(25);
      expect(privateTier.priceMonthly).toBe(5000);
      expect(privateTier.priceYearly).toBeNumber();

      // Verify pending checkout was saved
      const [checkout] = await db
        .select()
        .from(schema.pendingCheckouts)
        .where(
          eq(schema.pendingCheckouts.paymentLinkId, body.data.paymentLinkId)
        )
        .limit(1);

      expect(checkout).toBeDefined();
      expect(checkout.organizationId).toBe(org.id);
      expect(checkout.planId).toBe(body.data.privatePlanId);
      expect(checkout.pricingTierId).toBe(body.data.privateTierId);
      expect(checkout.status).toBe("pending");
      expect(checkout.customPriceMonthly).toBe(5000);
      expect(checkout.customPriceYearly).toBeNumber();
      expect(checkout.notes).toBe("Desconto negociado");
      expect(checkout.pagarmePlanId).toBeString();
    },
    15_000
  );

  test.skipIf(skipIntegration)(
    "should create checkout with inline billing data (creates profile automatically)",
    async () => {
      const { headers } = await UserFactory.createAdmin();
      const org = await OrganizationFactory.create();

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(
            buildPayload({
              organizationId: org.id,
              basePlanId: goldPlanResult.plan.id,
              minEmployees: 0,
              maxEmployees: 25,
              customPriceMonthly: 3000,
              billing: buildBillingData(),
            })
          ),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.checkoutUrl).toBeString();
      expect(body.data.privatePlanId).toStartWith("plan-");
      expect(body.data.privateTierId).toStartWith("tier-");
      expect(body.data.customPriceMonthly).toBe(3000);
      expect(body.data.basePlanDisplayName).toBe(
        goldPlanResult.plan.displayName
      );
      expect(body.data.minEmployees).toBe(0);
      expect(body.data.maxEmployees).toBe(25);

      // Verify billing profile was created
      const [profile] = await db
        .select()
        .from(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, org.id))
        .limit(1);

      expect(profile).toBeDefined();
      expect(profile.organizationId).toBe(org.id);
    },
    15_000
  );

  test.skipIf(skipIntegration)(
    "should allow checkout for org with trial subscription",
    async () => {
      const { headers } = await UserFactory.createAdmin();
      const org = await OrganizationFactory.create();

      await BillingProfileFactory.create({ organizationId: org.id });
      await SubscriptionFactory.createTrial(org.id, trialPlanResult.plan.id);

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(
            buildPayload({
              organizationId: org.id,
              basePlanId: goldPlanResult.plan.id,
              minEmployees: 0,
              maxEmployees: 25,
            })
          ),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.checkoutUrl).toBeString();
      expect(body.data.privatePlanId).toStartWith("plan-");
      expect(body.data.privateTierId).toStartWith("tier-");
      expect(body.data.basePlanDisplayName).toBe(
        goldPlanResult.plan.displayName
      );
    },
    15_000
  );

  test.skipIf(skipIntegration)(
    "should create checkout with custom range above catalog (min=0, max=500)",
    async () => {
      const { headers } = await UserFactory.createAdmin();
      const org = await OrganizationFactory.create();

      await BillingProfileFactory.create({ organizationId: org.id });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(
            buildPayload({
              organizationId: org.id,
              basePlanId: goldPlanResult.plan.id,
              minEmployees: 0,
              maxEmployees: 500,
              customPriceMonthly: 200_000,
            })
          ),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.checkoutUrl).toBeString();
      expect(body.data.privatePlanId).toStartWith("plan-");
      expect(body.data.privateTierId).toStartWith("tier-");
      expect(body.data.minEmployees).toBe(0);
      expect(body.data.maxEmployees).toBe(500);
      expect(body.data.customPriceMonthly).toBe(200_000);

      // Verify private tier has the custom range
      const [privateTier] = await db
        .select()
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.id, body.data.privateTierId))
        .limit(1);

      expect(privateTier).toBeDefined();
      expect(privateTier.minEmployees).toBe(0);
      expect(privateTier.maxEmployees).toBe(500);
    },
    15_000
  );

  test.skipIf(skipIntegration)(
    "should create private plan with base plan features (verify DB limits)",
    async () => {
      const { headers } = await UserFactory.createAdmin();
      const org = await OrganizationFactory.create();

      await BillingProfileFactory.create({ organizationId: org.id });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(
            buildPayload({
              organizationId: org.id,
              basePlanId: goldPlanResult.plan.id,
              minEmployees: 0,
              maxEmployees: 50,
              customPriceMonthly: 10_000,
            })
          ),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify private plan inherits base plan's limits/features
      const [privatePlan] = await db
        .select()
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, body.data.privatePlanId))
        .limit(1);

      expect(privatePlan).toBeDefined();
      expect(privatePlan.isPublic).toBe(false);
      expect(privatePlan.isTrial).toBe(false);
      expect(privatePlan.limits).toEqual(goldPlanResult.plan.limits);
    },
    15_000
  );

  // ── Pagarme failure ─────────────────────────────────────────────

  test("should handle Pagarme API failure gracefully", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    await BillingProfileFactory.create({ organizationId: org.id });

    const createPlanSpy = spyOn(
      PagarmeClient,
      "createPlan"
    ).mockRejectedValueOnce(new Error("Pagarme API error: Connection refused"));

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            basePlanId: goldPlanResult.plan.id,
          })
        ),
      })
    );

    expect(response.status).toBe(500);

    createPlanSpy.mockRestore();
  });
});

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
    planId: "plan-placeholder",
    pricingTierId: "tier-placeholder",
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

    const tier = PlanFactory.getFirstTier(goldPlanResult);
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            planId: goldPlanResult.plan.id,
            pricingTierId: tier.id,
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
    const tier = PlanFactory.getFirstTier(goldPlanResult);

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            planId: goldPlanResult.plan.id,
            pricingTierId: tier.id,
            customPriceMonthly: 50,
          })
        ),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 for missing required fields (no organizationId)", async () => {
    const { headers } = await UserFactory.createAdmin();
    const tier = PlanFactory.getFirstTier(goldPlanResult);

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: goldPlanResult.plan.id,
          pricingTierId: tier.id,
          customPriceMonthly: 5000,
          successUrl: "https://app.example.com/success",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  // ── Business Rules ──────────────────────────────────────────────

  test("should return 404 for non-existent organization", async () => {
    const { headers } = await UserFactory.createAdmin();
    const tier = PlanFactory.getFirstTier(goldPlanResult);

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: "org-non-existent-id",
            planId: goldPlanResult.plan.id,
            pricingTierId: tier.id,
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
    const tier = PlanFactory.getFirstTier(goldPlanResult);

    await SubscriptionFactory.createActive(org.id, goldPlanResult.plan.id);

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            planId: goldPlanResult.plan.id,
            pricingTierId: tier.id,
          })
        ),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
  });

  test("should return 404 for non-existent plan", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();
    const tier = PlanFactory.getFirstTier(goldPlanResult);

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            planId: "plan-non-existent",
            pricingTierId: tier.id,
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
    const tier = PlanFactory.getFirstTier(inactivePlanResult);

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            planId: inactivePlanResult.plan.id,
            pricingTierId: tier.id,
          })
        ),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_AVAILABLE");
  });

  test("should return 404 for non-existent pricing tier", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            planId: goldPlanResult.plan.id,
            pricingTierId: "tier-non-existent",
          })
        ),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PRICING_TIER_NOT_FOUND");
  });

  test("should return 400 when billing profile is missing and no billing data provided", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();
    const tier = PlanFactory.getFirstTier(goldPlanResult);

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            organizationId: org.id,
            planId: goldPlanResult.plan.id,
            pricingTierId: tier.id,
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
      const tier = PlanFactory.getFirstTier(goldPlanResult);

      await BillingProfileFactory.create({ organizationId: org.id });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(
            buildPayload({
              organizationId: org.id,
              planId: goldPlanResult.plan.id,
              pricingTierId: tier.id,
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
      expect(body.data.customPriceMonthly).toBe(5000);
      expect(body.data.customPriceYearly).toBeNumber();
      expect(body.data.catalogPriceMonthly).toBeNumber();
      expect(body.data.catalogPriceYearly).toBeNumber();
      expect(body.data.discountPercentage).toBeNumber();
      expect(body.data.expiresAt).toBeString();

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
      expect(checkout.planId).toBe(goldPlanResult.plan.id);
      expect(checkout.pricingTierId).toBe(tier.id);
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
      const tier = PlanFactory.getFirstTier(goldPlanResult);

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(
            buildPayload({
              organizationId: org.id,
              planId: goldPlanResult.plan.id,
              pricingTierId: tier.id,
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
      expect(body.data.customPriceMonthly).toBe(3000);

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
      const tier = PlanFactory.getFirstTier(goldPlanResult);

      await BillingProfileFactory.create({ organizationId: org.id });
      await SubscriptionFactory.createTrial(org.id, trialPlanResult.plan.id);

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(
            buildPayload({
              organizationId: org.id,
              planId: goldPlanResult.plan.id,
              pricingTierId: tier.id,
            })
          ),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.checkoutUrl).toBeString();
    },
    15_000
  );

  // ── Pagarme failure ─────────────────────────────────────────────

  test("should handle Pagarme API failure gracefully", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();
    const tier = PlanFactory.getFirstTier(goldPlanResult);

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
            planId: goldPlanResult.plan.id,
            pricingTierId: tier.id,
          })
        ),
      })
    );

    expect(response.status).toBe(500);

    createPlanSpy.mockRestore();
  });
});

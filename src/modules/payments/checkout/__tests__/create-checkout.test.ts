import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { billingProfiles } from "@/db/schema/billing-profiles";
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
import { skipIntegration } from "@/test/support/skip-integration";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/checkout", () => {
  let app: TestApp;
  let trialPlanResult: CreatePlanResult;
  let goldPlanResult: CreatePlanResult;
  let diamondPlanResult: CreatePlanResult;
  let inactivePlanResult: CreatePlanResult;

  beforeAll(async () => {
    app = createTestApp();

    [trialPlanResult, goldPlanResult, diamondPlanResult, inactivePlanResult] =
      await Promise.all([
        PlanFactory.createTrial(),
        PlanFactory.createPaid("gold"),
        PlanFactory.createPaid("diamond"),
        PlanFactory.createInactive({ type: "platinum" }),
      ]);
  });

  test("should reject unauthenticated requests", async () => {
    const tier = PlanFactory.getFirstTier(diamondPlanResult);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: diamondPlanResult.plan.id,
          tierId: tier.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user with unverified email", async () => {
    const { headers } = await UserFactory.createWithOrganization({
      emailVerified: false,
    });
    const tier = PlanFactory.getFirstTier(diamondPlanResult);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: diamondPlanResult.plan.id,
          tierId: tier.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  test("should reject if organization already has active subscription", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });
    await SubscriptionFactory.create(
      organizationId,
      diamondPlanResult.plan.id,
      { status: "active" }
    );

    const tier = PlanFactory.getFirstTier(goldPlanResult);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: goldPlanResult.plan.id,
          tierId: tier.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
  });

  test("should reject for non-existent plan", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });
    const tier = PlanFactory.getFirstTier(diamondPlanResult);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "non-existent-plan",
          tierId: tier.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });

  test("should reject for non-existent tier", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: diamondPlanResult.plan.id,
          tierId: "non-existent-tier",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TIER_NOT_FOUND");
  });

  test("should reject for inactive plan", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });
    const tier = PlanFactory.getFirstTier(inactivePlanResult);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: inactivePlanResult.plan.id,
          tierId: tier.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_AVAILABLE");
  });

  test("should reject invalid successUrl", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });
    const tier = PlanFactory.getFirstTier(diamondPlanResult);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: diamondPlanResult.plan.id,
          tierId: tier.id,
          successUrl: "not-a-valid-url",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject missing required fields", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject missing tierId", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: diamondPlanResult.plan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test.skipIf(skipIntegration)(
    "should create payment link and return checkoutUrl and paymentLinkId",
    async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await BillingProfileFactory.create({ organizationId });
      const tier = PlanFactory.getFirstTier(diamondPlanResult);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlanResult.plan.id,
            tierId: tier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.checkoutUrl).toBeDefined();
      expect(body.data.checkoutUrl).toBeString();
      expect(body.data.paymentLinkId).toBeDefined();
      expect(body.data.paymentLinkId).toBeString();
      expect(body.data.checkoutUrl).toContain("pagar.me");
    }
  );

  test.skipIf(skipIntegration)(
    "should sync pricing tier plan to Pagarme if not yet synced",
    async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await BillingProfileFactory.create({ organizationId });
      const tier = PlanFactory.getFirstTier(diamondPlanResult);

      // Reset Pagarme IDs for all pricing tiers of this plan
      await db
        .update(schema.planPricingTiers)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.planPricingTiers.planId, diamondPlanResult.plan.id));

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlanResult.plan.id,
            tierId: tier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      // Verify the pricing tier now has a Pagarme plan ID
      const tiers = await db
        .select()
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.planId, diamondPlanResult.plan.id));

      // At least one tier should have a pagarmePlanIdMonthly
      const syncedTier = tiers.find((t) => t.pagarmePlanIdMonthly !== null);
      expect(syncedTier).toBeDefined();
      expect(syncedTier?.pagarmePlanIdMonthly).toStartWith("plan_");
    }
  );

  test.skipIf(skipIntegration)(
    "should reuse existing pagarmePlanId if already synced",
    async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await BillingProfileFactory.create({ organizationId });
      const tier = PlanFactory.getFirstTier(diamondPlanResult);

      const firstResponse = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlanResult.plan.id,
            tierId: tier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );
      expect(firstResponse.status).toBe(200);

      const tiersAfterFirst = await db
        .select()
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.planId, diamondPlanResult.plan.id));

      const firstPagarmePlanId = tiersAfterFirst.find(
        (t) => t.pagarmePlanIdMonthly !== null
      )?.pagarmePlanIdMonthly;

      const { headers: headers2, organizationId: orgId2 } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await BillingProfileFactory.create({ organizationId: orgId2 });

      const secondResponse = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...headers2,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlanResult.plan.id,
            tierId: tier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );
      expect(secondResponse.status).toBe(200);

      const tiersAfterSecond = await db
        .select()
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.planId, diamondPlanResult.plan.id));

      const secondPagarmePlanId = tiersAfterSecond.find(
        (t) => t.pagarmePlanIdMonthly !== null
      )?.pagarmePlanIdMonthly;

      expect(secondPagarmePlanId).toBe(firstPagarmePlanId);
    },
    15_000
  );

  test.skipIf(skipIntegration).each(["trial", "canceled"] as const)(
    "should allow checkout for org with %s subscription",
    async (status) => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await BillingProfileFactory.create({ organizationId });
      // Use trial plan for trial status, paid plan for canceled status
      const subscriptionPlanId =
        status === "trial" ? trialPlanResult.plan.id : goldPlanResult.plan.id;
      const subscriptionStatus = status === "trial" ? "active" : "canceled";
      await SubscriptionFactory.create(organizationId, subscriptionPlanId, {
        status: subscriptionStatus,
      });

      const tier = PlanFactory.getFirstTier(diamondPlanResult);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlanResult.plan.id,
            tierId: tier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      // biome-ignore lint/suspicious/noMisplacedAssertion: false positive - assertions are inside test.skipIf().each() callback
      expect(response.status).toBe(200);

      const body = await response.json();
      // biome-ignore lint/suspicious/noMisplacedAssertion: false positive - assertions are inside test.skipIf().each() callback
      expect(body.data.checkoutUrl).toBeDefined();
      // biome-ignore lint/suspicious/noMisplacedAssertion: false positive - assertions are inside test.skipIf().each() callback
      expect(body.data.paymentLinkId).toBeDefined();
    }
  );

  test.skipIf(skipIntegration)(
    "should create checkout without prior customer_id",
    async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      // Create billing profile WITHOUT pagarmeCustomerId
      await BillingProfileFactory.create({ organizationId });

      const [profile] = await db
        .select({
          pagarmeCustomerId: billingProfiles.pagarmeCustomerId,
        })
        .from(billingProfiles)
        .where(eq(billingProfiles.organizationId, organizationId))
        .limit(1);

      expect(profile.pagarmeCustomerId).toBeNull();

      const tier = PlanFactory.getFirstTier(diamondPlanResult);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlanResult.plan.id,
            tierId: tier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.checkoutUrl).toBeDefined();
      expect(body.data.paymentLinkId).toBeDefined();
    }
  );

  test.skipIf(skipIntegration)(
    "should reuse existing customer_id from billing profile",
    async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      // Create billing profile without customer
      const billingProfile = await BillingProfileFactory.create({
        organizationId,
      });
      expect(billingProfile.pagarmeCustomerId).toBeNull();

      const tier = PlanFactory.getFirstTier(diamondPlanResult);

      // First checkout - creates customer in Pagarme
      const firstResponse = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlanResult.plan.id,
            tierId: tier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(firstResponse.status).toBe(200);

      // Get the customer ID that was created
      const [profileAfterFirst] = await db
        .select({
          pagarmeCustomerId: billingProfiles.pagarmeCustomerId,
        })
        .from(billingProfiles)
        .where(eq(billingProfiles.organizationId, organizationId))
        .limit(1);

      expect(profileAfterFirst.pagarmeCustomerId).toBeDefined();
      expect(profileAfterFirst.pagarmeCustomerId).toStartWith("cus_");

      // Second checkout - should reuse existing customer
      const secondResponse = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlanResult.plan.id,
            tierId: tier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(secondResponse.status).toBe(200);

      // Customer ID should remain the same (not create a new one)
      const [profileAfterSecond] = await db
        .select({
          pagarmeCustomerId: billingProfiles.pagarmeCustomerId,
        })
        .from(billingProfiles)
        .where(eq(billingProfiles.organizationId, organizationId))
        .limit(1);

      expect(profileAfterSecond.pagarmeCustomerId).toBe(
        profileAfterFirst.pagarmeCustomerId
      );
    }
  );

  test.skipIf(skipIntegration)(
    "should create pending_checkout record for webhook lookup",
    async () => {
      const { headers, organizationId } =
        await UserFactory.createWithOrganization({
          emailVerified: true,
        });

      await BillingProfileFactory.create({ organizationId });
      const tier = PlanFactory.getFirstTier(diamondPlanResult);

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/checkout`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: diamondPlanResult.plan.id,
            tierId: tier.id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      const [checkout] = await db
        .select()
        .from(schema.pendingCheckouts)
        .where(
          eq(schema.pendingCheckouts.paymentLinkId, body.data.paymentLinkId)
        )
        .limit(1);

      expect(checkout).toBeDefined();
      expect(checkout.organizationId).toBe(organizationId);
      expect(checkout.planId).toBe(diamondPlanResult.plan.id);
      expect(checkout.pricingTierId).toBe(tier.id);
      expect(checkout.status).toBe("pending");
      expect(checkout.expiresAt).toBeInstanceOf(Date);
      expect(checkout.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  );

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from creating checkout", async (role) => {
    const { organizationId } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    await BillingProfileFactory.create({ organizationId });

    const memberResult = await UserFactory.create({ emailVerified: true });

    await OrganizationFactory.addMember(memberResult, {
      organizationId,
      role,
    });
    const memberHeaders = memberResult.headers;
    const tier = PlanFactory.getFirstTier(diamondPlanResult);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...memberHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: diamondPlanResult.plan.id,
          tierId: tier.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject empty planId", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });
    const tier = PlanFactory.getFirstTier(diamondPlanResult);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "",
          tierId: tier.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should handle Pagarme API connection failure", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await BillingProfileFactory.create({ organizationId });
    const tier = PlanFactory.getFirstTier(diamondPlanResult);

    const createPaymentLinkSpy = spyOn(
      PagarmeClient,
      "createPaymentLink"
    ).mockRejectedValueOnce(new Error("Pagarme API error: Connection refused"));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: diamondPlanResult.plan.id,
          tierId: tier.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(500);

    createPaymentLinkSpy.mockRestore();
  });

  test("should reject checkout without billing profile", async () => {
    const { headers } = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    // Do NOT create billing profile
    const tier = PlanFactory.getFirstTier(diamondPlanResult);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: diamondPlanResult.plan.id,
          tierId: tier.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("BILLING_PROFILE_NOT_FOUND");
  });
});

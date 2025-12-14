import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { proPlan, testPlans } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createTestSubscription } from "@/test/helpers/subscription";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { CustomerService } from "../../customer/customer.service";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/checkout", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();

    for (const plan of testPlans) {
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, plan.id));
    }
  });

  afterAll(async () => {
    for (const plan of testPlans) {
      await db
        .update(schema.subscriptionPlans)
        .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
        .where(eq(schema.subscriptionPlans.id, plan.id));
    }
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "test-plan-pro",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user with unverified email", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: false,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "test-plan-pro",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  test("should reject if organization already has active subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    await createTestSubscription(orgId, "test-plan-pro", "active");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "test-plan-enterprise",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
  });

  test("should reject for non-existent plan", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "non-existent-plan",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_FOUND");
  });

  test("should reject for inactive plan", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "test-plan-inactive",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("PLAN_NOT_AVAILABLE");
  });

  test("should reject invalid successUrl", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "test-plan-pro",
          successUrl: "not-a-valid-url",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject missing required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

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

  test("should create payment link and return checkoutUrl and paymentLinkId", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: proPlan.id,
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
  });

  test("should sync plan to Pagarme if not yet synced", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    await db
      .update(schema.subscriptionPlans)
      .set({ pagarmePlanIdMonthly: null, pagarmePlanIdYearly: null })
      .where(eq(schema.subscriptionPlans.id, proPlan.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const [dbPlan] = await db
      .select({
        pagarmePlanIdMonthly: schema.subscriptionPlans.pagarmePlanIdMonthly,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, proPlan.id))
      .limit(1);

    expect(dbPlan.pagarmePlanIdMonthly).toBeDefined();
    expect(dbPlan.pagarmePlanIdMonthly).toStartWith("plan_");
  });

  test("should reuse existing pagarmePlanIdMonthly if already synced", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    const firstResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );
    expect(firstResponse.status).toBe(200);

    const [planAfterFirst] = await db
      .select({
        pagarmePlanIdMonthly: schema.subscriptionPlans.pagarmePlanIdMonthly,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, proPlan.id))
      .limit(1);

    const firstPagarmePlanIdMonthly = planAfterFirst.pagarmePlanIdMonthly;

    const { headers: headers2 } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const secondResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers2,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );
    expect(secondResponse.status).toBe(200);

    const [planAfterSecond] = await db
      .select({
        pagarmePlanIdMonthly: schema.subscriptionPlans.pagarmePlanIdMonthly,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, proPlan.id))
      .limit(1);

    expect(planAfterSecond.pagarmePlanIdMonthly).toBe(
      firstPagarmePlanIdMonthly
    );
  });

  test.each([
    "trial",
    "canceled",
  ] as const)("should allow checkout for org with %s subscription", async (status) => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    await createTestSubscription(orgId, "test-plan-starter", status);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.checkoutUrl).toBeDefined();
    expect(body.data.paymentLinkId).toBeDefined();
  });

  test("should create checkout without prior customer_id", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    const [profile] = await db
      .select({
        pagarmeCustomerId: schema.organizationProfiles.pagarmeCustomerId,
      })
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, orgId))
      .limit(1);

    expect(profile.pagarmeCustomerId).toBeNull();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.checkoutUrl).toBeDefined();
    expect(body.data.paymentLinkId).toBeDefined();
  });

  test("should pre-fill checkout with existing customer_id from profile", async () => {
    const { user, headers, organizationId } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });
    const orgId = organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, orgId))
      .limit(1);

    if (!profile) {
      throw new Error("Organization profile not found");
    }

    const { pagarmeCustomerId } = await CustomerService.create({
      organizationId: orgId,
      name: profile.tradeName,
      email: profile.email ?? user.email,
      document: profile.taxId ?? "12345678000190",
      phone: profile.phone ?? "11999999999",
    });

    expect(pagarmeCustomerId).toBeDefined();
    expect(pagarmeCustomerId).toStartWith("cus_");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.checkoutUrl).toBeDefined();
    expect(body.data.paymentLinkId).toBeDefined();

    const [updatedProfile] = await db
      .select({
        pagarmeCustomerId: schema.organizationProfiles.pagarmeCustomerId,
      })
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, orgId))
      .limit(1);

    expect(updatedProfile.pagarmeCustomerId).toBe(pagarmeCustomerId);
  });

  test("should create pending_checkout record for webhook lookup", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    // const schema = await import("@/db/schema");
    const [checkout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, body.data.paymentLinkId))
      .limit(1);

    expect(checkout).toBeDefined();
    expect(checkout.organizationId).toBe(orgId);
    expect(checkout.planId).toBe(proPlan.id);
    expect(checkout.status).toBe("pending");
    expect(checkout.expiresAt).toBeInstanceOf(Date);
    expect(checkout.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from creating checkout", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const orgId = organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    const memberResult = await createTestUser({ emailVerified: true });

    await addMemberToOrganization(memberResult, {
      organizationId: orgId,
      role,
    });
    const memberHeaders = memberResult.headers;

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...memberHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "test-plan-pro",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject empty planId", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: "",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should handle Pagarme API connection failure", async () => {
    const { PagarmeClient } = await import("../../pagarme/client");

    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

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
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(500);

    createPaymentLinkSpy.mockRestore();
  });
});

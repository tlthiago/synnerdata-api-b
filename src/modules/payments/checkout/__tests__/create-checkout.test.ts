import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationProfiles, subscriptionPlans } from "@/db/schema";
import { env } from "@/env";
import { proPlan, testPlans } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestUser } from "@/test/helpers/auth";
import { createTestSubscription, seedPlans } from "@/test/helpers/db";
import { CustomerService } from "../../customer/customer.service";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/checkout", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
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

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "test-org",
          planId: "test-plan-pro",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user with unverified email", async () => {
    const { user, headers } = await createTestUser({ emailVerified: false });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: user.organizationId,
          planId: "test-plan-pro",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  test("should reject if organization already has active subscription", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });
    const orgId = user.organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    // Create an active subscription
    await createTestSubscription(orgId, "test-plan-pro", "active");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: orgId,
          planId: "test-plan-enterprise",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
  });

  test("should reject for non-existent plan", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: user.organizationId,
          planId: "non-existent-plan",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("PLAN_NOT_FOUND");
  });

  test("should reject for inactive plan", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: user.organizationId,
          planId: "test-plan-inactive",
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("PLAN_NOT_AVAILABLE");
  });

  test("should reject invalid successUrl", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: user.organizationId,
          planId: "test-plan-pro",
          successUrl: "not-a-valid-url",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject missing required fields", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "test-org",
          // Missing planId and successUrl
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should create payment link and return checkoutUrl and paymentLinkId", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });
    const orgId = user.organizationId;

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
          organizationId: orgId,
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checkoutUrl).toBeDefined();
    expect(body.checkoutUrl).toBeString();
    expect(body.paymentLinkId).toBeDefined();
    expect(body.paymentLinkId).toBeString();

    // Pagarme payment link URL should contain pagar.me domain
    expect(body.checkoutUrl).toContain("pagar.me");
  });

  test("should sync plan to Pagarme if not yet synced", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });
    const orgId = user.organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    // Ensure plan has no pagarmePlanId
    await db
      .update(subscriptionPlans)
      .set({ pagarmePlanId: null })
      .where(eq(subscriptionPlans.id, proPlan.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: orgId,
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    // Verify plan was synced
    const [dbPlan] = await db
      .select({ pagarmePlanId: subscriptionPlans.pagarmePlanId })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, proPlan.id))
      .limit(1);

    expect(dbPlan.pagarmePlanId).toBeDefined();
    expect(dbPlan.pagarmePlanId).toStartWith("plan_");
  });

  test("should reuse existing pagarmePlanId if already synced", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });
    const orgId = user.organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    // First request - will sync plan
    const firstResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: orgId,
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );
    expect(firstResponse.status).toBe(200);

    // Get the pagarmePlanId after first request
    const [planAfterFirst] = await db
      .select({ pagarmePlanId: subscriptionPlans.pagarmePlanId })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, proPlan.id))
      .limit(1);

    const firstPagarmePlanId = planAfterFirst.pagarmePlanId;

    // Create new user for second request
    const { user: user2, headers: headers2 } = await createTestUser({
      emailVerified: true,
    });

    // Second request - should reuse existing pagarmePlanId
    const secondResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers2,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: user2.organizationId,
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );
    expect(secondResponse.status).toBe(200);

    // Verify pagarmePlanId is still the same
    const [planAfterSecond] = await db
      .select({ pagarmePlanId: subscriptionPlans.pagarmePlanId })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, proPlan.id))
      .limit(1);

    expect(planAfterSecond.pagarmePlanId).toBe(firstPagarmePlanId);
  });

  test("should allow checkout for org with trial subscription", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });
    const orgId = user.organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    // Create a trial subscription (not active)
    await createTestSubscription(orgId, "test-plan-starter", "trial");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: orgId,
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checkoutUrl).toBeDefined();
    expect(body.paymentLinkId).toBeDefined();
  });

  test("should pre-fill checkout with existing customer_id from profile", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });
    const orgId = user.organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    if (!proPlan) {
      throw new Error("Pro plan not found in fixtures");
    }

    // Get the organization profile to use its data
    const [profile] = await db
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, orgId))
      .limit(1);

    if (!profile) {
      throw new Error("Organization profile not found");
    }

    // Create a real customer in Pagarme using CustomerService
    const { pagarmeCustomerId } = await CustomerService.create({
      organizationId: orgId,
      name: profile.tradeName,
      email: profile.email ?? user.email,
      document: profile.taxId ?? "12345678000190",
      phone: profile.phone ?? "11999999999",
    });

    expect(pagarmeCustomerId).toBeDefined();
    expect(pagarmeCustomerId).toStartWith("cus_");

    // Now create checkout - should use the existing customer_id
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: orgId,
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checkoutUrl).toBeDefined();
    expect(body.paymentLinkId).toBeDefined();

    // Verify the customer_id is still in the profile
    const [updatedProfile] = await db
      .select({ pagarmeCustomerId: organizationProfiles.pagarmeCustomerId })
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, orgId))
      .limit(1);

    expect(updatedProfile.pagarmeCustomerId).toBe(pagarmeCustomerId);
  });

  test("should create pending_checkout record for webhook lookup", async () => {
    const { user, headers } = await createTestUser({ emailVerified: true });
    const orgId = user.organizationId;

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
          organizationId: orgId,
          planId: proPlan.id,
          successUrl: "https://example.com/success",
        }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    // Verify pending_checkout was created
    const { pendingCheckouts } = await import("@/db/schema");
    const [checkout] = await db
      .select()
      .from(pendingCheckouts)
      .where(eq(pendingCheckouts.paymentLinkId, body.paymentLinkId))
      .limit(1);

    expect(checkout).toBeDefined();
    expect(checkout.organizationId).toBe(orgId);
    expect(checkout.planId).toBe(proPlan.id);
    expect(checkout.status).toBe("pending");
    expect(checkout.expiresAt).toBeInstanceOf(Date);
    expect(checkout.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("should reject non-owner member from creating checkout", async () => {
    // Create owner with organization
    const { user: owner } = await createTestUser({ emailVerified: true });
    const orgId = owner.organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    // Create another user without organization
    const { user: member, headers: memberHeaders } = await createTestUser({
      emailVerified: true,
      withOrganization: false,
    });

    // Add the second user as a "viewer" member of the owner's organization
    const { members } = await import("@/db/schema");
    await db.insert(members).values({
      id: `test-member-viewer-${crypto.randomUUID()}`,
      organizationId: orgId,
      userId: member.id,
      role: "viewer",
      createdAt: new Date(),
    });

    // Try to create checkout with the viewer member
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...memberHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: orgId,
          planId: "test-plan-pro",
          successUrl: "https://example.com/success",
        }),
      })
    );

    // Should be forbidden - only owner can upgrade subscription
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  test("should reject manager member from creating checkout", async () => {
    // Create owner with organization
    const { user: owner } = await createTestUser({ emailVerified: true });
    const orgId = owner.organizationId;

    if (!orgId) {
      throw new Error("Organization not created");
    }

    // Create another user without organization
    const { user: member, headers: memberHeaders } = await createTestUser({
      emailVerified: true,
      withOrganization: false,
    });

    // Add the second user as a "manager" member of the owner's organization
    const { members } = await import("@/db/schema");
    await db.insert(members).values({
      id: `test-member-manager-${crypto.randomUUID()}`,
      organizationId: orgId,
      userId: member.id,
      role: "manager",
      createdAt: new Date(),
    });

    // Try to create checkout with the manager member
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/checkout`, {
        method: "POST",
        headers: {
          ...memberHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: orgId,
          planId: "test-plan-pro",
          successUrl: "https://example.com/success",
        }),
      })
    );

    // Should be forbidden - only owner can upgrade subscription
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("FORBIDDEN");
  });
});

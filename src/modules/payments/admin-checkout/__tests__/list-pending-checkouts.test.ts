import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import { CheckoutFactory } from "@/test/factories/payments/checkout.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

function getEndpoint(organizationId: string) {
  return `${BASE_URL}/v1/payments/admin/checkout/${organizationId}`;
}

describe("GET /v1/payments/admin/checkout/:organizationId", () => {
  let app: TestApp;
  let goldPlanResult: CreatePlanResult;

  beforeAll(async () => {
    app = createTestApp();
    goldPlanResult = await PlanFactory.createPaid("gold");
  });

  // ── Authentication / Authorization ──────────────────────────────

  test("should return 401 without session", async () => {
    const response = await app.handle(
      new Request(getEndpoint("org-test"), { method: "GET" })
    );

    expect(response.status).toBe(401);
  });

  test("should return 403 for non-admin user", async () => {
    const { headers } = await UserFactory.create();
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(getEndpoint(org.id), {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  // ── Business Rules ──────────────────────────────────────────────

  test("should return 404 for non-existent organization", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(getEndpoint("org-non-existent-id"), {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ORGANIZATION_NOT_FOUND");
  });

  // ── Success ─────────────────────────────────────────────────────

  test("should return empty array when organization has no checkouts", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const response = await app.handle(
      new Request(getEndpoint(org.id), {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data).toHaveLength(0);
  });

  test("should return pending checkouts for organization", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const checkout = await CheckoutFactory.create(
      org.id,
      goldPlanResult.plan.id,
      {
        pricingTierId: goldPlanResult.tiers[0].id,
        checkoutUrl: "https://pagar.me/checkout/pl_test123",
      }
    );

    const response = await app.handle(
      new Request(getEndpoint(org.id), {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    const item = body.data[0];
    expect(item.id).toBe(checkout.id);
    expect(item.organizationId).toBe(org.id);
    expect(item.planId).toBe(goldPlanResult.plan.id);
    expect(item.pricingTierId).toBe(goldPlanResult.tiers[0].id);
    expect(item.paymentLinkId).toBe(checkout.paymentLinkId);
    expect(item.checkoutUrl).toBe("https://pagar.me/checkout/pl_test123");
    expect(item.status).toBe("pending");
    expect(item.isExpired).toBe(false);
    expect(item.expiresAt).toBeString();
    expect(item.createdAt).toBeString();
  });

  test("should mark checkout as expired when expiresAt is in the past", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const checkout = await CheckoutFactory.create(
      org.id,
      goldPlanResult.plan.id,
      {
        expirationHours: -1,
        checkoutUrl: "https://pagar.me/checkout/pl_expired",
      }
    );

    const response = await app.handle(
      new Request(getEndpoint(org.id), {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);

    const item = body.data[0];
    expect(item.id).toBe(checkout.id);
    expect(item.isExpired).toBe(true);
  });

  test("should return multiple checkouts ordered by createdAt desc", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const checkout1 = await CheckoutFactory.create(
      org.id,
      goldPlanResult.plan.id,
      { checkoutUrl: "https://pagar.me/checkout/pl_first" }
    );
    const checkout2 = await CheckoutFactory.create(
      org.id,
      goldPlanResult.plan.id,
      { checkoutUrl: "https://pagar.me/checkout/pl_second" }
    );

    const response = await app.handle(
      new Request(getEndpoint(org.id), {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    // Most recent first
    expect(body.data[0].id).toBe(checkout2.id);
    expect(body.data[1].id).toBe(checkout1.id);
  });

  test("should not return checkouts from other organizations", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org1 = await OrganizationFactory.create();
    const org2 = await OrganizationFactory.create();

    await CheckoutFactory.create(org1.id, goldPlanResult.plan.id);
    await CheckoutFactory.create(org2.id, goldPlanResult.plan.id);

    const response = await app.handle(
      new Request(getEndpoint(org1.id), {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].organizationId).toBe(org1.id);
  });

  test("should include completed checkouts", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();

    const checkout = await CheckoutFactory.create(
      org.id,
      goldPlanResult.plan.id
    );
    await CheckoutFactory.markCompleted(checkout.paymentLinkId);

    const response = await app.handle(
      new Request(getEndpoint(org.id), {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe("completed");
  });

  test("should persist checkoutUrl when creating admin checkout (mocked Pagarme)", async () => {
    const { headers } = await UserFactory.createAdmin();
    const org = await OrganizationFactory.create();
    await BillingProfileFactory.create({ organizationId: org.id });

    const mockPaymentLinkId = `pl_mock_${crypto.randomUUID().slice(0, 8)}`;
    const mockCheckoutUrl = `https://pagar.me/checkout/${mockPaymentLinkId}`;
    const now = new Date().toISOString();

    const { PagarmeClient } = require("../../pagarme/client");

    const createPlanSpy = spyOn(PagarmeClient, "createPlan").mockResolvedValue({
      id: `plan_mock_${crypto.randomUUID().slice(0, 8)}`,
      name: "custom-gold-mock",
      interval: "month",
      interval_count: 1,
      billing_type: "prepaid",
      payment_methods: ["credit_card"],
      currency: "BRL",
      items: [],
      status: "active",
      created_at: now,
      updated_at: now,
    });

    const createPaymentLinkSpy = spyOn(
      PagarmeClient,
      "createPaymentLink"
    ).mockResolvedValue({
      id: mockPaymentLinkId,
      url: mockCheckoutUrl,
      short_url: mockCheckoutUrl,
      status: "active",
      type: "subscription",
      name: "Custom Gold Plan",
      success_url: "https://app.example.com/success",
      created_at: now,
      updated_at: now,
    });

    const createCustomerSpy = spyOn(
      PagarmeClient,
      "createCustomer"
    ).mockResolvedValue({
      id: `cus_mock_${crypto.randomUUID().slice(0, 8)}`,
      name: "Empresa LTDA",
      email: "billing@empresa.com",
      document: "24004752000199",
      type: "company",
      created_at: now,
      updated_at: now,
    });

    // Create checkout via POST
    const createResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/admin/checkout`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org.id,
          basePlanId: goldPlanResult.plan.id,
          minEmployees: 0,
          maxEmployees: 25,
          customPriceMonthly: 5000,
          successUrl: "https://app.example.com/success",
        }),
      })
    );

    createPlanSpy.mockRestore();
    createPaymentLinkSpy.mockRestore();
    createCustomerSpy.mockRestore();

    expect(createResponse.status).toBe(200);

    // Verify checkoutUrl is persisted in DB
    const [checkout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, mockPaymentLinkId))
      .limit(1);

    expect(checkout).toBeDefined();
    expect(checkout.checkoutUrl).toBe(mockCheckoutUrl);

    // Verify GET endpoint returns the checkoutUrl
    const listResponse = await app.handle(
      new Request(getEndpoint(org.id), {
        method: "GET",
        headers,
      })
    );

    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    const item = listBody.data.find(
      (c: { paymentLinkId: string }) => c.paymentLinkId === mockPaymentLinkId
    );
    expect(item).toBeDefined();
    expect(item.checkoutUrl).toBe(mockCheckoutUrl);
    expect(item.isExpired).toBe(false);
  });
});

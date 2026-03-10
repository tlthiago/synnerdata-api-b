import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { generateCnpj, generateMobile } from "@/test/helpers/faker";
import { createTestApp, type TestApp } from "@/test/support/app";
import { skipIntegration } from "@/test/support/skip-integration";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/admin/provisions/checkout`;

function buildOrganization(overrides: Record<string, unknown> = {}) {
  return {
    name: "Empresa Real LTDA",
    tradeName: "Empresa Fantasia",
    legalName: "Empresa Real LTDA",
    taxId: generateCnpj(),
    email: "org@empresa.com",
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

function buildPayload(
  basePlanId: string,
  overrides: Record<string, unknown> = {}
) {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    ownerName: `Owner ${id}`,
    ownerEmail: `owner-${id}@example.com`,
    organization: buildOrganization(),
    organizationSlug: `org-${id}`,
    basePlanId,
    maxEmployees: 25,
    billingCycle: "monthly",
    customPriceMonthly: 5000,
    ...overrides,
  };
}

describe("POST /v1/payments/admin/provisions/checkout", () => {
  let app: TestApp;
  let goldPlanId: string;

  beforeAll(async () => {
    app = createTestApp();
    await PlanFactory.createTrial();
    const goldResult = await PlanFactory.createPaid("gold");
    goldPlanId = goldResult.plan.id;
  });

  // ── Authentication / Authorization ──────────────────────────────

  test("should return 401 without session", async () => {
    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(goldPlanId)),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should return 403 for non-admin user", async () => {
    const { headers } = await UserFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(goldPlanId)),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  // ── Validation ──────────────────────────────────────────────────

  test("should return 422 for invalid email", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload(goldPlanId, { ownerEmail: "not-an-email" })
        ),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 for invalid slug", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload(goldPlanId, { organizationSlug: "Invalid Slug!" })
        ),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 for price below minimum", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload(goldPlanId, { customPriceMonthly: 50 })
        ),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 for missing required address field", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload(goldPlanId, {
            organization: buildOrganization({ street: undefined }),
          })
        ),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 for invalid CNPJ in organization", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload(goldPlanId, {
            organization: buildOrganization({ taxId: "00000000000000" }),
          })
        ),
      })
    );

    expect(response.status).toBe(422);
  });

  // ── Conflict ──────────────────────────────────────────────────

  test("should return 409 for existing email", async () => {
    const { headers } = await UserFactory.createAdmin();
    const { user } = await UserFactory.create();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload(goldPlanId, { ownerEmail: user.email })
        ),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("USER_ALREADY_EXISTS");
  });

  // ── Success — Mocked Pagarme ────────────────────────────────

  function mockPagarme() {
    const mockPagarmePlanId = `plan_mock_${crypto.randomUUID().slice(0, 8)}`;
    const mockPaymentLinkId = `pl_mock_${crypto.randomUUID().slice(0, 8)}`;
    const mockCheckoutUrl = `https://pagar.me/checkout/${mockPaymentLinkId}`;
    const mockCustomerId = `cus_mock_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const { PagarmeClient } = require("@/modules/payments/pagarme/client");
    const { spyOn } = require("bun:test");

    const createPlanSpy = spyOn(PagarmeClient, "createPlan").mockResolvedValue({
      id: mockPagarmePlanId,
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
      success_url: `${env.APP_URL}/ativacao`,
      created_at: now,
      updated_at: now,
    });

    const createCustomerSpy = spyOn(
      PagarmeClient,
      "createCustomer"
    ).mockResolvedValue({
      id: mockCustomerId,
      name: "Empresa Real LTDA",
      email: "org@empresa.com",
      document: "24004752000199",
      type: "company",
      created_at: now,
      updated_at: now,
    });

    return {
      mockPagarmePlanId,
      mockPaymentLinkId,
      mockCheckoutUrl,
      restore: () => {
        createPlanSpy.mockRestore();
        createPaymentLinkSpy.mockRestore();
        createCustomerSpy.mockRestore();
      },
    };
  }

  test("should provision user + org + checkout with mocked Pagarme", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildPayload(goldPlanId, { notes: "Mocked checkout test" });

    const mocks = mockPagarme();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    mocks.restore();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.type).toBe("checkout");
    expect(data.status).toBe("pending_payment");
    expect(data.ownerName).toBe(payload.ownerName);
    expect(data.ownerEmail).toBe(payload.ownerEmail);
    expect(data.organizationName).toBe(payload.organization.name);
    expect(data.checkoutUrl).toBe(mocks.mockCheckoutUrl);
    expect(data.checkoutExpiresAt).toBeString();
    expect(data.notes).toBe("Mocked checkout test");

    // Verify subscription shows contracted plan data (not interim trial)
    expect(data.subscription).toBeDefined();
    expect(data.subscription.status).toBe("pending_payment");
    expect(data.subscription.maxEmployees).toBe(payload.maxEmployees);
    expect(data.subscription.billingCycle).toBe("monthly");
    expect(data.subscription.customPriceMonthly).toBe(
      payload.customPriceMonthly
    );
    expect(data.subscription.planName).toBeString();
    expect(data.subscription.trialDays).toBeNull();
    expect(data.subscription.trialEnd).toBeNull();

    // Verify user created
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, payload.ownerEmail))
      .limit(1);

    expect(user).toBeDefined();
    expect(user.name).toBe(payload.ownerName);

    // Verify organization created
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, data.organizationId))
      .limit(1);

    expect(org).toBeDefined();
    expect(org.name).toBe(payload.organization.name);

    // Verify org profile enriched
    const [orgProfile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(
        eq(schema.organizationProfiles.organizationId, data.organizationId)
      )
      .limit(1);

    expect(orgProfile).toBeDefined();
    expect(orgProfile.tradeName).toBe(payload.organization.tradeName);
    expect(orgProfile.legalName).toBe(payload.organization.legalName);
    expect(orgProfile.taxId).toBe(payload.organization.taxId);
    expect(orgProfile.email).toBe(payload.organization.email);
    expect(orgProfile.street).toBe(payload.organization.street);
    expect(orgProfile.city).toBe(payload.organization.city);
    expect(orgProfile.state).toBe(payload.organization.state);
    expect(orgProfile.zipCode).toBe(payload.organization.zipCode);

    // Verify billing profile created from organization data
    const [billingProfile] = await db
      .select()
      .from(schema.billingProfiles)
      .where(eq(schema.billingProfiles.organizationId, data.organizationId))
      .limit(1);

    expect(billingProfile).toBeDefined();
    expect(billingProfile.legalName).toBe(payload.organization.legalName);
    expect(billingProfile.taxId).toBe(payload.organization.taxId);
    expect(billingProfile.street).toBe(payload.organization.street);

    // Verify provision record
    const [provision] = await db
      .select()
      .from(schema.adminOrgProvisions)
      .where(eq(schema.adminOrgProvisions.id, data.id))
      .limit(1);

    expect(provision).toBeDefined();
    expect(provision.type).toBe("checkout");
    expect(provision.status).toBe("pending_payment");
    expect(provision.checkoutUrl).toBe(mocks.mockCheckoutUrl);
    expect(provision.pendingCheckoutId).toBe(mocks.mockPaymentLinkId);
    expect(provision.notes).toBe("Mocked checkout test");

    // Verify private plan + tier created
    const [privatePlan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.organizationId, data.organizationId))
      .limit(1);

    expect(privatePlan).toBeDefined();
    expect(privatePlan.isPublic).toBe(false);
    expect(privatePlan.isTrial).toBe(false);
    expect(privatePlan.basePlanId).toBe(goldPlanId);

    // Verify pending checkout references private plan
    const [pendingCheckout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, mocks.mockPaymentLinkId))
      .limit(1);

    expect(pendingCheckout).toBeDefined();
    expect(pendingCheckout.planId).toBe(privatePlan.id);
    expect(pendingCheckout.customPriceMonthly).toBe(payload.customPriceMonthly);
    expect(pendingCheckout.status).toBe("pending");
  });

  test("should provision checkout with yearly billing cycle (mocked Pagarme)", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildPayload(goldPlanId, {
      billingCycle: "yearly",
      customPriceMonthly: 8000,
    });

    const mocks = mockPagarme();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    mocks.restore();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.subscription.billingCycle).toBe("yearly");
    expect(data.subscription.customPriceMonthly).toBe(8000);

    // Verify pending checkout has yearly cycle
    const [pendingCheckout] = await db
      .select()
      .from(schema.pendingCheckouts)
      .where(eq(schema.pendingCheckouts.paymentLinkId, mocks.mockPaymentLinkId))
      .limit(1);

    expect(pendingCheckout).toBeDefined();
    expect(pendingCheckout.billingCycle).toBe("yearly");
  });

  // ── Success (requires Pagarme) ──────────────────────────────

  test.skipIf(skipIntegration)(
    "should provision user + org with checkout successfully",
    async () => {
      const { headers } = await UserFactory.createAdmin();
      const payload = buildPayload(goldPlanId, { notes: "Checkout test" });

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      const data = body.data;
      expect(data.type).toBe("checkout");
      expect(data.status).toBe("pending_payment");
      expect(data.ownerName).toBe(payload.ownerName);
      expect(data.ownerEmail).toBe(payload.ownerEmail);
      expect(data.organizationName).toBe(payload.organization.name);
      expect(data.checkoutUrl).toBeString();
      expect(data.checkoutExpiresAt).toBeString();

      // Verify subscription shows contracted plan data (not interim trial)
      expect(data.subscription).toBeDefined();
      expect(data.subscription.status).toBe("pending_payment");
      expect(data.subscription.maxEmployees).toBe(payload.maxEmployees);
      expect(data.subscription.billingCycle).toBe("monthly");
      expect(data.subscription.customPriceMonthly).toBe(
        payload.customPriceMonthly
      );
      expect(data.subscription.planName).toBeString();
      expect(data.subscription.trialDays).toBeNull();

      // Verify org profile enriched with organization data
      const [orgProfile] = await db
        .select()
        .from(schema.organizationProfiles)
        .where(
          eq(schema.organizationProfiles.organizationId, data.organizationId)
        )
        .limit(1);

      expect(orgProfile).toBeDefined();
      expect(orgProfile.tradeName).toBe(payload.organization.tradeName);
      expect(orgProfile.legalName).toBe(payload.organization.legalName);
      expect(orgProfile.taxId).toBe(payload.organization.taxId);
      expect(orgProfile.email).toBe(payload.organization.email);
      expect(orgProfile.street).toBe(payload.organization.street);
      expect(orgProfile.city).toBe(payload.organization.city);
      expect(orgProfile.state).toBe(payload.organization.state);
      expect(orgProfile.zipCode).toBe(payload.organization.zipCode);

      // Verify billing profile was created with organization data
      const [billingProfile] = await db
        .select()
        .from(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, data.organizationId))
        .limit(1);

      expect(billingProfile).toBeDefined();
      expect(billingProfile.legalName).toBe(payload.organization.legalName);
      expect(billingProfile.taxId).toBe(payload.organization.taxId);
      expect(billingProfile.street).toBe(payload.organization.street);
    }
  );
});

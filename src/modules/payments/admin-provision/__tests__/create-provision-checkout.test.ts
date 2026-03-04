import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { generateCnpj, generateMobile } from "@/test/helpers/faker";
import { createTestApp, type TestApp } from "@/test/support/app";
import { skipIntegration } from "@/test/support/skip-integration";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/admin/provisions/checkout`;

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

function buildPayload(
  basePlanId: string,
  overrides: Record<string, unknown> = {}
) {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    ownerName: `Owner ${id}`,
    ownerEmail: `owner-${id}@example.com`,
    organizationName: `Org ${id}`,
    organizationSlug: `org-${id}`,
    basePlanId,
    minEmployees: 0,
    maxEmployees: 25,
    billingCycle: "monthly",
    customPriceMonthly: 5000,
    successUrl: "https://app.example.com/success",
    billing: buildBillingData(),
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

  // ── Success (requires Pagarme) ──────────────────────────────

  test.skipIf(skipIntegration)(
    "should provision user + org with checkout successfully",
    async () => {
      const { headers } = await UserFactory.createAdmin();
      const payload = buildPayload(goldPlanId);

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
      expect(data.checkoutUrl).toBeString();
      expect(data.checkoutExpiresAt).toBeString();
    }
  );
});

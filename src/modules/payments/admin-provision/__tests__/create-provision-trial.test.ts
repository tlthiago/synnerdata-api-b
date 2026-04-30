import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { generateCnpj } from "@/test/support/faker";
import { waitForActivationEmail } from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/admin/provisions/trial`;

function buildPayload(overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    ownerName: `Owner ${id}`,
    ownerEmail: `owner-${id}@example.com`,
    organization: {
      name: `Org Real ${id}`,
      tradeName: `Org ${id}`,
      taxId: generateCnpj(),
      email: `org-${id}@example.com`,
      phone: "11999990000",
    },
    organizationSlug: `org-${id}`,
    ...overrides,
  };
}

describe("POST /v1/payments/admin/provisions/trial", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    // Ensure trial plan exists (needed by afterCreateOrganization hook)
    await PlanFactory.createTrial();
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

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
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
        body: JSON.stringify(buildPayload({ ownerEmail: "not-an-email" })),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 for empty owner name", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload({ ownerName: "" })),
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
          buildPayload({ organizationSlug: "Invalid Slug!" })
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
        body: JSON.stringify(buildPayload({ ownerEmail: user.email })),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("USER_ALREADY_EXISTS");
  });

  test("should return 409 for existing slug", async () => {
    const { headers } = await UserFactory.createAdmin();

    // Create an org first to get a slug
    const { organizationId } = await UserFactory.createWithOrganization();
    const [org] = await db
      .select({ slug: schema.organizations.slug })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId ?? ""))
      .limit(1);

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload({ organizationSlug: org.slug })),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("SLUG_ALREADY_EXISTS");
  });

  // ── Success ──────────────────────────────────────────────────

  test("should provision user + org with trial successfully", async () => {
    const { headers, user: adminUser } = await UserFactory.createAdmin();
    const payload = buildPayload({ notes: "Test provision" });

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

    // Verify provision data
    expect(data.type).toBe("trial");
    expect(data.status).toBe("pending_activation");
    expect(data.ownerName).toBe(payload.ownerName);
    expect(data.ownerEmail).toBe(payload.ownerEmail);
    expect(data.organizationName).toBe(payload.organization.name);
    expect(data.notes).toBe("Test provision");
    expect(data.createdBy).toEqual({ id: adminUser.id, name: adminUser.name });
    expect(data.updatedBy).toEqual({ id: adminUser.id, name: adminUser.name });
    expect(data.activationUrl).toBeString();

    // Verify user created with emailVerified=false (verified on password reset)
    const [createdUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, payload.ownerEmail))
      .limit(1);

    expect(createdUser).toBeDefined();
    expect(createdUser.emailVerified).toBe(false);
    expect(createdUser.name).toBe(payload.ownerName);

    // Verify organization created
    const [createdOrg] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, data.organizationId))
      .limit(1);

    expect(createdOrg).toBeDefined();
    expect(createdOrg.name).toBe(payload.organization.name);
    expect(createdOrg.slug).toBe(payload.organizationSlug);

    // Verify member with role=owner
    const [member] = await db
      .select()
      .from(schema.members)
      .where(
        and(
          eq(schema.members.organizationId, data.organizationId),
          eq(schema.members.userId, createdUser.id)
        )
      )
      .limit(1);

    expect(member).toBeDefined();
    expect(member.role).toBe("owner");

    // Verify trial subscription created
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, data.organizationId))
      .limit(1);

    expect(subscription).toBeDefined();
    expect(subscription.status).toBe("active");
    expect(subscription.trialUsed).toBe(true);

    // Verify provision record in DB
    const [provision] = await db
      .select()
      .from(schema.adminOrgProvisions)
      .where(eq(schema.adminOrgProvisions.id, data.id))
      .limit(1);

    expect(provision).toBeDefined();
    expect(provision.type).toBe("trial");
    expect(provision.status).toBe("pending_activation");
    expect(provision.createdBy).toBe(adminUser.id);
    expect(provision.activationUrl).toBeString();
    expect(provision.activationSentAt).toBeDefined();

    // Verify organization profile auto-created
    const [orgProfile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(
        eq(schema.organizationProfiles.organizationId, data.organizationId)
      )
      .limit(1);

    expect(orgProfile).toBeDefined();
    // Verify organization profile enriched with provided data
    expect(orgProfile.tradeName).toBe(payload.organization.tradeName);
    expect(orgProfile.taxId).toBe(payload.organization.taxId);
    expect(orgProfile.email).toBe(payload.organization.email);
    expect(orgProfile.phone).toBe(payload.organization.phone);
    // Optional fields not provided → null
    expect(orgProfile.street).toBeNull();
    expect(orgProfile.city).toBeNull();
  });

  test("should enrich org profile with optional address fields", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildPayload({
      organization: {
        name: "Org Real With Address",
        tradeName: "Org With Address",
        taxId: generateCnpj(),
        email: "address-test@example.com",
        phone: "11999990000",
        legalName: "Razao Social Ltda",
        street: "Rua Teste",
        number: "123",
        complement: "Sala 1",
        neighborhood: "Centro",
        city: "Sao Paulo",
        state: "SP",
        zipCode: "01001000",
      },
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const data = body.data;

    const [orgProfile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(
        eq(schema.organizationProfiles.organizationId, data.organizationId)
      )
      .limit(1);

    expect(orgProfile.legalName).toBe("Razao Social Ltda");
    expect(orgProfile.street).toBe("Rua Teste");
    expect(orgProfile.number).toBe("123");
    expect(orgProfile.complement).toBe("Sala 1");
    expect(orgProfile.neighborhood).toBe("Centro");
    expect(orgProfile.city).toBe("Sao Paulo");
    expect(orgProfile.state).toBe("SP");
    expect(orgProfile.zipCode).toBe("01001000");
    expect(orgProfile.mobile).toBe("11999990000");
  });

  test("e2e: full provisioning flow — create, activate, and login", async () => {
    const { headers } = await UserFactory.createAdmin();
    const NEW_PASSWORD = "SecurePassword123!";
    const payload = buildPayload({
      notes: "E2E test",
      trialDays: 30,
      maxEmployees: 50,
      organization: {
        name: "ACME Corporation",
        tradeName: "ACME Tech",
        taxId: generateCnpj(),
        email: "acme@example.com",
        phone: "1133334444",
        legalName: "ACME Corporation LTDA",
        street: "Rua Principal",
        number: "100",
        neighborhood: "Centro",
        city: "Sao Paulo",
        state: "SP",
        zipCode: "01001000",
      },
    });

    // ── Step 1: Admin creates trial provision ───────────────────
    const createResponse = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(createResponse.status).toBe(200);
    const { data } = await createResponse.json();
    expect(data.status).toBe("pending_activation");

    // ── Step 2: Verify user created with emailVerified=false ────
    const [userBefore] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, payload.ownerEmail))
      .limit(1);

    expect(userBefore.emailVerified).toBe(false);

    // ── Step 3: Get activation email from MailHog ───────────────
    const activationEmail = await waitForActivationEmail(payload.ownerEmail);
    expect(activationEmail.activationUrl).toBeTruthy();

    // ── Step 4: Validate activation URL points to frontend ──────
    const activationUrl = new URL(activationEmail.activationUrl);
    expect(activationUrl.origin).toBe(env.APP_URL);
    expect(activationUrl.pathname).toBe("/definir-senha");

    const token = activationUrl.searchParams.get("token");
    expect(token).toBeTruthy();

    const emailParam = activationUrl.searchParams.get("email");
    expect(emailParam).toBe(payload.ownerEmail);

    // ── Step 5: User defines password (frontend calls reset-password) ──
    const resetResponse = await app.handle(
      new Request(`${BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: NEW_PASSWORD, token }),
      })
    );

    expect(resetResponse.status).toBe(200);

    // ── Step 6: Verify account activation ───────────────────────
    const [userAfter] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, payload.ownerEmail))
      .limit(1);

    expect(userAfter.emailVerified).toBe(true);

    // ── Step 7: Verify provision transitioned to active ─────────
    const [provision] = await db
      .select()
      .from(schema.adminOrgProvisions)
      .where(eq(schema.adminOrgProvisions.id, data.id))
      .limit(1);

    expect(provision.status).toBe("active");
    expect(provision.activatedAt).toBeDefined();

    // ── Step 8: Verify organization table (name = nome real) ────
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, data.organizationId))
      .limit(1);

    expect(org.name).toBe("ACME Corporation");

    // ── Step 9: Verify org profile (tradeName, dados cadastrais) ─
    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(
        eq(schema.organizationProfiles.organizationId, data.organizationId)
      )
      .limit(1);

    expect(profile.tradeName).toBe("ACME Tech");
    expect(profile.legalName).toBe("ACME Corporation LTDA");
    expect(profile.taxId).toBe(payload.organization.taxId);
    expect(profile.email).toBe("acme@example.com");
    expect(profile.phone).toBe("1133334444");
    expect(profile.mobile).toBe("1133334444"); // synced from phone
    expect(profile.street).toBe("Rua Principal");
    expect(profile.number).toBe("100");
    expect(profile.neighborhood).toBe("Centro");
    expect(profile.city).toBe("Sao Paulo");
    expect(profile.state).toBe("SP");
    expect(profile.zipCode).toBe("01001000");

    // ── Step 10: Verify trial subscription (custom 30 days) ─────
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, data.organizationId))
      .limit(1);

    expect(subscription.status).toBe("active");
    expect(subscription.trialUsed).toBe(true);

    const trialStart = subscription.trialStart as Date;
    const trialEnd = subscription.trialEnd as Date;
    const diffDays = Math.round(
      (trialEnd.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diffDays).toBe(30);

    // ── Step 11: Verify private trial plan and custom tier ───
    const [privatePlan] = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, subscription.planId))
      .limit(1);

    expect(privatePlan.isTrial).toBe(true);
    expect(privatePlan.isPublic).toBe(false);
    expect(privatePlan.organizationId).toBe(data.organizationId);
    expect(privatePlan.basePlanId).toBeDefined();

    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, String(subscription.pricingTierId)))
      .limit(1);

    expect(tier.planId).toBe(privatePlan.id);
    expect(tier.maxEmployees).toBe(50);
    expect(tier.priceMonthly).toBe(0);
    expect(tier.priceYearly).toBe(0);

    // ── Step 12: Verify user can login with new password ────────
    const signInResponse = await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: payload.ownerEmail,
          password: NEW_PASSWORD,
        }),
      })
    );

    expect(signInResponse.status).toBe(200);
    const setCookie = signInResponse.headers.get("set-cookie");
    expect(setCookie).toContain("better-auth.session_token");
  }, 15_000);

  // ── Custom trial provisioning ──────────────────────────────────

  test("should provision with custom maxEmployees", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildPayload({ maxEmployees: 50 });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
    const { data } = await response.json();

    // Verify subscription uses custom tier
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, data.organizationId))
      .limit(1);

    expect(subscription).toBeDefined();
    expect(subscription.pricingTierId).toBeDefined();

    // Verify custom tier has maxEmployees=50
    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, String(subscription.pricingTierId)))
      .limit(1);

    expect(tier.maxEmployees).toBe(50);
    expect(tier.minEmployees).toBe(0);
    expect(tier.priceMonthly).toBe(0);
    expect(tier.priceYearly).toBe(0);
  });

  test("should provision with custom trialDays", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildPayload({ trialDays: 30 });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
    const { data } = await response.json();

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, data.organizationId))
      .limit(1);

    expect(subscription.trialStart).toBeDefined();
    expect(subscription.trialEnd).toBeDefined();

    const trialStart = subscription.trialStart as Date;
    const trialEnd = subscription.trialEnd as Date;
    const diffMs = trialEnd.getTime() - trialStart.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  test("should provision with both custom trialDays and maxEmployees", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildPayload({ trialDays: 60, maxEmployees: 100 });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
    const { data } = await response.json();

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, data.organizationId))
      .limit(1);

    // Verify custom tier
    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, String(subscription.pricingTierId)))
      .limit(1);

    expect(tier.maxEmployees).toBe(100);

    // Verify trial period is ~60 days
    const trialStart = subscription.trialStart as Date;
    const trialEnd = subscription.trialEnd as Date;
    const diffMs = trialEnd.getTime() - trialStart.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(60);
  });

  test("should use default trial values when custom params not provided", async () => {
    const { headers } = await UserFactory.createAdmin();
    const payload = buildPayload();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(response.status).toBe(200);
    const { data } = await response.json();

    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, data.organizationId))
      .limit(1);

    // Default tier: maxEmployees=10
    const [tier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, String(subscription.pricingTierId)))
      .limit(1);

    expect(tier.maxEmployees).toBe(10);

    // Default trial: 14 days
    const trialStart = subscription.trialStart as Date;
    const trialEnd = subscription.trialEnd as Date;
    const diffMs = trialEnd.getTime() - trialStart.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(14);
  });
});

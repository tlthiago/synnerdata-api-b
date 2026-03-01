import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { generateCnpj } from "@/test/support/faker";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/admin/provisions/trial`;

function buildPayload(overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID().slice(0, 8);
  return {
    ownerName: `Owner ${id}`,
    ownerEmail: `owner-${id}@example.com`,
    organization: {
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
    expect(data.organizationName).toBe(payload.organization.tradeName);
    expect(data.notes).toBe("Test provision");
    expect(data.createdBy).toBe(adminUser.id);
    expect(data.activationUrl).toBeString();

    // Verify user created with emailVerified=true
    const [createdUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, payload.ownerEmail))
      .limit(1);

    expect(createdUser).toBeDefined();
    expect(createdUser.emailVerified).toBe(true);
    expect(createdUser.name).toBe(payload.ownerName);

    // Verify organization created
    const [createdOrg] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, data.organizationId))
      .limit(1);

    expect(createdOrg).toBeDefined();
    expect(createdOrg.name).toBe(payload.organization.tradeName);
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
});

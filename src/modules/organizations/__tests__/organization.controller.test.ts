import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { generateCnpj } from "@/test/helpers/faker";
import {
  addMemberToOrganization,
  createTestOrganization,
} from "@/test/helpers/organization";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/organizations/profile", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return profile for owner", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.tradeName).toBeDefined();
  });

  test("should return profile for member with read permission", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.organizationId).toBe(organizationId);
  });
});

describe("PUT /v1/organizations/profile", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeName: "New Name" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ tradeName: "New Name" }),
      })
    );

    expect(response.status).toBe(403);
  });

  test("should update profile for owner", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeName: "Updated Company Name",
          industry: "Technology",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.tradeName).toBe("Updated Company Name");
    expect(body.data.industry).toBe("Technology");

    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    expect(profile.tradeName).toBe("Updated Company Name");
    expect(profile.industry).toBe("Technology");

    const [org] = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .limit(1);

    expect(org.name).toBe("Updated Company Name");
  });

  test("should allow manager to update profile", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tradeName: "Manager Update" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.tradeName).toBe("Manager Update");
  });

  test("should reject viewer from updating profile", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tradeName: "Attempted Update" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject supervisor from updating profile", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "supervisor",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tradeName: "Attempted Update" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should return 409 when taxId already exists", async () => {
    const existingTaxId = generateCnpj();
    await createTestOrganization({ taxId: existingTaxId });

    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ taxId: existingTaxId }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("TAX_ID_ALREADY_EXISTS");
  });

  test("should validate phone format", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "123" }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("should validate taxId format", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ taxId: "12345" }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("should validate state format", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ state: "São Paulo" }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("should clear nullable fields when null is sent", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: "Technology",
          businessArea: "Software",
          revenue: "10000.00",
        }),
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: null,
          businessArea: null,
          revenue: null,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.industry).toBeNull();
    expect(body.data.businessArea).toBeNull();
    expect(body.data.revenue).toBeNull();
    expect(body.data.organizationId).toBe(organizationId);
  });

  test("should not change fields that are not sent (undefined)", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: "Technology",
          businessArea: "Software",
        }),
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeName: "New Trade Name",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.tradeName).toBe("New Trade Name");
    expect(body.data.industry).toBe("Technology");
    expect(body.data.businessArea).toBe("Software");
  });

  test("should update phone and sync mobile", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "11988887777" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.phone).toBe("11988887777");
    expect(body.data.mobile).toBe("11988887777");

    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    expect(profile.phone).toBe("11988887777");
    expect(profile.mobile).toBe("11988887777");
  });
});

describe("GET /v1/organizations/billing-status", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/billing-status`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/billing-status`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
  });

  test("should return complete=true for valid profile", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/billing-status`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.complete).toBe(true);
    expect(body.data.missingFields).toEqual([]);
  });

  test("should return complete=false with missingFields for incomplete profile", async () => {
    const testId = crypto.randomUUID();
    const orgId = `test-org-${testId}`;

    await db.insert(schema.organizations).values({
      id: orgId,
      name: `Test Org ${testId.slice(0, 8)}`,
      slug: `test-org-${testId.slice(0, 8)}`,
      createdAt: new Date(),
    });

    const userResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(userResult, {
      organizationId: orgId,
      role: "owner",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/billing-status`, {
        method: "GET",
        headers: userResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.complete).toBe(false);
    expect(body.data.missingFields).toContain("profile");
  });

  test("should allow viewer to check billing status", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/organizations/billing-status`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

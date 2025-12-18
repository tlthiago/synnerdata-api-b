import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PUT /v1/payments/billing/info", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/info`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalName: "Test" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/info`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ legalName: "Test" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should update legalName only", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const newLegalName = `Updated Legal Name ${crypto.randomUUID().slice(0, 8)}`;

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/info`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ legalName: newLegalName }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(true);

    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    expect(profile.legalName).toBe(newLegalName);
  });

  test("should update billingEmail only", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const newEmail = `billing-${crypto.randomUUID().slice(0, 8)}@example.com`;

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/info`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ billingEmail: newEmail }),
      })
    );

    expect(response.status).toBe(200);

    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    expect(profile.email).toBe(newEmail);
  });

  test("should update address only", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const address = {
      street: "Rua Teste",
      number: "123",
      complement: "Sala 1",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01310100",
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/info`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })
    );

    expect(response.status).toBe(200);

    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    expect(profile.street).toBe(address.street);
    expect(profile.number).toBe(address.number);
    expect(profile.complement).toBe(address.complement);
    expect(profile.neighborhood).toBe(address.neighborhood);
    expect(profile.city).toBe(address.city);
    expect(profile.state).toBe(address.state);
    expect(profile.zipCode).toBe(address.zipCode);
  });

  test("should update multiple fields at once", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const updateData = {
      legalName: `Multi Update ${crypto.randomUUID().slice(0, 8)}`,
      phone: "11987654321",
      billingEmail: `multi-${crypto.randomUUID().slice(0, 8)}@example.com`,
    };

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/info`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })
    );

    expect(response.status).toBe(200);

    const [profile] = await db
      .select()
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.organizationId, organizationId))
      .limit(1);

    expect(profile.legalName).toBe(updateData.legalName);
    expect(profile.phone).toBe(updateData.phone);
    expect(profile.email).toBe(updateData.billingEmail);
  });

  test("should reject invalid email format", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/info`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ billingEmail: "invalid-email" }),
      })
    );

    expect([400, 422]).toContain(response.status);
  });

  test("should reject address with missing required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/info`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          address: {
            street: "Rua Teste",
          },
        }),
      })
    );

    expect([400, 422]).toContain(response.status);
  });

  test.each([
    "viewer",
    "manager",
    "supervisor",
  ] as const)("should reject %s member from updating billing info", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/billing/info`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ legalName: "Test" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

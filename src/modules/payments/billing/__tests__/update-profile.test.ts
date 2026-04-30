import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { faker, generateCnpj, generateMobile } from "@/test/support/faker";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/billing/profile`;

describe("PATCH /payments/billing/profile", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalName: "New Name" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject non-owner users (manager)", async () => {
    const org = await OrganizationFactory.create();
    await BillingProfileFactory.create({ organizationId: org.id });

    const manager = await UserFactory.create();
    await OrganizationFactory.addMember(manager, {
      organizationId: org.id,
      role: "manager",
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "PATCH",
        headers: { ...manager.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ legalName: "New Name" }),
      })
    );

    expect(response.status).toBe(403);
  });

  test("should return 404 when billing profile does not exist", async () => {
    const { headers } = await UserFactory.createWithOrganization();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ legalName: "New Name" }),
      })
    );

    expect(response.status).toBe(404);
  });

  test("should update billing profile legalName", async () => {
    const org = await OrganizationFactory.create();
    await BillingProfileFactory.create({ organizationId: org.id });

    const owner = await UserFactory.create();
    await OrganizationFactory.addMember(owner, {
      organizationId: org.id,
      role: "owner",
    });

    const newLegalName = faker.company.name();

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "PATCH",
        headers: { ...owner.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ legalName: newLegalName }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.legalName).toBe(newLegalName);
    expect(body.data.createdBy).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
    });
    expect(body.data.updatedBy).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
    });
  });

  test("should update multiple fields at once", async () => {
    const org = await OrganizationFactory.create();
    await BillingProfileFactory.create({ organizationId: org.id });

    const owner = await UserFactory.create();
    await OrganizationFactory.addMember(owner, {
      organizationId: org.id,
      role: "owner",
    });

    const updates = {
      legalName: faker.company.name(),
      taxId: generateCnpj(),
      email: faker.internet.email(),
      phone: generateMobile(),
    };

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "PATCH",
        headers: { ...owner.headers, "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data.legalName).toBe(updates.legalName);
    expect(body.data.taxId).toBe(updates.taxId);
    expect(body.data.email).toBe(updates.email);
    expect(body.data.phone).toBe(updates.phone);
  });

  test("should reject invalid email on update", async () => {
    const org = await OrganizationFactory.create();
    await BillingProfileFactory.create({ organizationId: org.id });

    const owner = await UserFactory.create();
    await OrganizationFactory.addMember(owner, {
      organizationId: org.id,
      role: "owner",
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "PATCH",
        headers: { ...owner.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid-email" }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject taxId too short on update", async () => {
    const org = await OrganizationFactory.create();
    await BillingProfileFactory.create({ organizationId: org.id });

    const owner = await UserFactory.create();
    await OrganizationFactory.addMember(owner, {
      organizationId: org.id,
      role: "owner",
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "PATCH",
        headers: { ...owner.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ taxId: "123" }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should preserve null pagarmeCustomerId on update", async () => {
    // Test that pagarmeCustomerId remains null when updating a profile
    // without triggering Pagarme sync (which would require a real customer)
    const org = await OrganizationFactory.create();
    await BillingProfileFactory.create({
      organizationId: org.id,
      // No pagarmeCustomerId - won't trigger Pagarme sync
    });

    const owner = await UserFactory.create();
    await OrganizationFactory.addMember(owner, {
      organizationId: org.id,
      role: "owner",
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "PATCH",
        headers: { ...owner.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ legalName: faker.company.name() }),
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    // Verify pagarmeCustomerId wasn't accidentally set
    expect(body.data.pagarmeCustomerId).toBeNull();
  });
});

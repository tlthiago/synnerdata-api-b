import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestBillingProfile } from "@/test/factories/billing-profile";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { faker, generateCnpj, generateMobile } from "@/test/helpers/faker";
import {
  addMemberToOrganization,
  createTestOrganization,
} from "@/test/helpers/organization";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

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
    const org = await createTestOrganization();
    await createTestBillingProfile({ organizationId: org.id });

    const manager = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(manager, {
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
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

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
    const org = await createTestOrganization();
    await createTestBillingProfile({ organizationId: org.id });

    const owner = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(owner, {
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
  });

  test("should update multiple fields at once", async () => {
    const org = await createTestOrganization();
    await createTestBillingProfile({ organizationId: org.id });

    const owner = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(owner, {
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
    const org = await createTestOrganization();
    await createTestBillingProfile({ organizationId: org.id });

    const owner = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(owner, {
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
    const org = await createTestOrganization();
    await createTestBillingProfile({ organizationId: org.id });

    const owner = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(owner, {
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
    const org = await createTestOrganization();
    await createTestBillingProfile({
      organizationId: org.id,
      // No pagarmeCustomerId - won't trigger Pagarme sync
    });

    const owner = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(owner, {
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

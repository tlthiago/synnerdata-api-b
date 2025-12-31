import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestBillingProfile } from "@/test/factories/billing-profile";
import { createTestApp, type TestApp } from "@/test/helpers/app";
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

describe("GET /payments/billing/profile", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(new Request(ENDPOINT, { method: "GET" }));

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
        method: "GET",
        headers: manager.headers,
      })
    );

    expect(response.status).toBe(403);
  });

  test("should reject non-owner users (viewer)", async () => {
    const org = await createTestOrganization();
    await createTestBillingProfile({ organizationId: org.id });

    const viewer = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewer, {
      organizationId: org.id,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "GET",
        headers: viewer.headers,
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
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
  });

  test("should return billing profile for owner", async () => {
    const org = await createTestOrganization();
    const billingProfile = await createTestBillingProfile({
      organizationId: org.id,
    });

    const owner = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(owner, {
      organizationId: org.id,
      role: "owner",
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "GET",
        headers: owner.headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(billingProfile.id);
    expect(body.data.organizationId).toBe(org.id);
    expect(body.data.legalName).toBe(billingProfile.legalName);
    expect(body.data.taxId).toBe(billingProfile.taxId);
    expect(body.data.email).toBe(billingProfile.email);
    expect(body.data.phone).toBe(billingProfile.phone);
  });

  test("should return billing profile with pagarmeCustomerId when set", async () => {
    const org = await createTestOrganization();
    const customerId = `cus_${crypto.randomUUID().slice(0, 8)}`;
    await createTestBillingProfile({
      organizationId: org.id,
      pagarmeCustomerId: customerId,
    });

    const owner = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(owner, {
      organizationId: org.id,
      role: "owner",
    });

    const response = await app.handle(
      new Request(ENDPOINT, {
        method: "GET",
        headers: owner.headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data.pagarmeCustomerId).toBe(customerId);
  });
});

import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestOrganization } from "@/test/helpers/organization";
import { createTestAdminUser } from "@/test/helpers/user";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/admin/organizations`;

describe("GET /v1/admin/organizations?subscriptionStatus", () => {
  let app: TestApp;
  let adminHeaders: Record<string, string>;

  let trialOrgId: string;
  let activeOrgId: string;
  let canceledOrgId: string;
  let expiredOrgId: string;
  let pastDueOrgId: string;

  beforeAll(async () => {
    app = createTestApp();
    const admin = await createTestAdminUser();
    adminHeaders = admin.headers;

    // Create plans
    const { plan: trialPlan } = await PlanFactory.createTrial();
    const { plan: paidPlan } = await PlanFactory.createPaid("gold");

    // Create orgs with different subscription statuses
    const trialOrg = await createTestOrganization({
      name: `FilterTrial-${Date.now()}`,
    });
    trialOrgId = trialOrg.id;
    await SubscriptionFactory.createTrial(trialOrgId, trialPlan.id);

    const activeOrg = await createTestOrganization({
      name: `FilterActive-${Date.now()}`,
    });
    activeOrgId = activeOrg.id;
    await SubscriptionFactory.createActive(activeOrgId, paidPlan.id);

    const canceledOrg = await createTestOrganization({
      name: `FilterCanceled-${Date.now()}`,
    });
    canceledOrgId = canceledOrg.id;
    await SubscriptionFactory.createCanceled(canceledOrgId, paidPlan.id);

    const expiredOrg = await createTestOrganization({
      name: `FilterExpired-${Date.now()}`,
    });
    expiredOrgId = expiredOrg.id;
    await SubscriptionFactory.createExpired(expiredOrgId, paidPlan.id);

    const pastDueOrg = await createTestOrganization({
      name: `FilterPastDue-${Date.now()}`,
    });
    pastDueOrgId = pastDueOrg.id;
    await SubscriptionFactory.createPastDue(pastDueOrgId, paidPlan.id);
  });

  test("should return all orgs when no subscriptionStatus filter", async () => {
    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers: adminHeaders })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.data.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(trialOrgId);
    expect(ids).toContain(activeOrgId);
    expect(ids).toContain(canceledOrgId);
  });

  test("should filter by trial status", async () => {
    const response = await app.handle(
      new Request(`${ENDPOINT}?subscriptionStatus=trial`, {
        method: "GET",
        headers: adminHeaders,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.data.items.map((i: { id: string }) => i.id);

    expect(ids).toContain(trialOrgId);
    expect(ids).not.toContain(activeOrgId);
    expect(ids).not.toContain(canceledOrgId);
    expect(ids).not.toContain(expiredOrgId);
    expect(ids).not.toContain(pastDueOrgId);

    // Verify subscriptionStatus field
    const trialItem = body.data.items.find(
      (i: { id: string }) => i.id === trialOrgId
    );
    expect(trialItem.subscriptionStatus).toBe("trial");
  });

  test("should filter by active (paid) status", async () => {
    const response = await app.handle(
      new Request(`${ENDPOINT}?subscriptionStatus=active`, {
        method: "GET",
        headers: adminHeaders,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.data.items.map((i: { id: string }) => i.id);

    expect(ids).toContain(activeOrgId);
    expect(ids).not.toContain(trialOrgId);
    expect(ids).not.toContain(canceledOrgId);
  });

  test("should filter by canceled status", async () => {
    const response = await app.handle(
      new Request(`${ENDPOINT}?subscriptionStatus=canceled`, {
        method: "GET",
        headers: adminHeaders,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.data.items.map((i: { id: string }) => i.id);

    expect(ids).toContain(canceledOrgId);
    expect(ids).not.toContain(activeOrgId);
    expect(ids).not.toContain(trialOrgId);

    const canceledItem = body.data.items.find(
      (i: { id: string }) => i.id === canceledOrgId
    );
    expect(canceledItem.subscriptionStatus).toBe("canceled");
  });

  test("should filter by expired status", async () => {
    const response = await app.handle(
      new Request(`${ENDPOINT}?subscriptionStatus=expired`, {
        method: "GET",
        headers: adminHeaders,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.data.items.map((i: { id: string }) => i.id);

    expect(ids).toContain(expiredOrgId);
    expect(ids).not.toContain(activeOrgId);
  });

  test("should filter by past_due status", async () => {
    const response = await app.handle(
      new Request(`${ENDPOINT}?subscriptionStatus=past_due`, {
        method: "GET",
        headers: adminHeaders,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.data.items.map((i: { id: string }) => i.id);

    expect(ids).toContain(pastDueOrgId);
    expect(ids).not.toContain(activeOrgId);
  });

  test("should filter by multiple statuses (comma-separated)", async () => {
    const response = await app.handle(
      new Request(`${ENDPOINT}?subscriptionStatus=trial,expired,canceled`, {
        method: "GET",
        headers: adminHeaders,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.data.items.map((i: { id: string }) => i.id);

    expect(ids).toContain(trialOrgId);
    expect(ids).toContain(expiredOrgId);
    expect(ids).toContain(canceledOrgId);
    expect(ids).not.toContain(activeOrgId);
    expect(ids).not.toContain(pastDueOrgId);
  });

  test("should combine subscriptionStatus with search filter", async () => {
    const response = await app.handle(
      new Request(`${ENDPOINT}?subscriptionStatus=trial&search=FilterTrial`, {
        method: "GET",
        headers: adminHeaders,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.data.items.map((i: { id: string }) => i.id);

    expect(ids).toContain(trialOrgId);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  test("should return subscriptionStatus field in response items", async () => {
    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers: adminHeaders })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    const activeItem = body.data.items.find(
      (i: { id: string }) => i.id === activeOrgId
    );
    expect(activeItem.subscriptionStatus).toBe("active");
    expect(activeItem.subscriptionId).toBeString();
    expect(activeItem.subscriptionId).toStartWith("sub-");

    const pastDueItem = body.data.items.find(
      (i: { id: string }) => i.id === pastDueOrgId
    );
    expect(pastDueItem.subscriptionStatus).toBe("past_due");
    expect(pastDueItem.subscriptionId).toBeString();
  });

  test("should return planName, billingCycle, and priceAtPurchase in list items", async () => {
    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers: adminHeaders })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    // Trial org: has plan name, no price
    const trialItem = body.data.items.find(
      (i: { id: string }) => i.id === trialOrgId
    );
    expect(trialItem.planName).toBeString();
    expect(trialItem.priceAtPurchase).toBeNull();

    // Active paid org: has plan name, billing cycle, no price (factory doesn't set priceAtPurchase)
    const activeItem = body.data.items.find(
      (i: { id: string }) => i.id === activeOrgId
    );
    expect(activeItem.planName).toBeString();
    expect(activeItem.billingCycle).toBe("monthly");
  });

  test("should ignore invalid status values in filter", async () => {
    const response = await app.handle(
      new Request(`${ENDPOINT}?subscriptionStatus=invalid,trial`, {
        method: "GET",
        headers: adminHeaders,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.data.items.map((i: { id: string }) => i.id);

    // Should still filter by the valid "trial" value
    expect(ids).toContain(trialOrgId);
    expect(ids).not.toContain(activeOrgId);
  });
});

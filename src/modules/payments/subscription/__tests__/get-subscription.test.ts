import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import {
  type CreatePlanResult,
  createPaidPlan,
  createTrialPlan,
} from "@/test/factories/plan";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createActiveSubscription,
  createCanceledSubscription,
  createTestSubscription,
} from "@/test/helpers/subscription";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

let diamondPlanResult: CreatePlanResult;
let trialPlanResult: CreatePlanResult;

describe("GET /v1/payments/subscription", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    [diamondPlanResult, trialPlanResult] = await Promise.all([
      createPaidPlan("diamond"),
      createTrialPlan(),
    ]);
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject for organization without subscription", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should return subscription with plan details for trial", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Use trial plan for proper trial behavior
    await createTestSubscription(organizationId, trialPlanResult.plan.id, {
      status: "trial",
      trialDays: 14,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.organizationId).toBe(organizationId);
    // Status in DB is "active" - trial is determined by isTrial
    expect(body.data.status).toBe("active");
    expect(body.data.isTrial).toBe(true);
    expect(body.data.plan).toBeDefined();
    expect(body.data.plan.id).toBe(trialPlanResult.plan.id);
    expect(body.data.plan.name).toBe(trialPlanResult.plan.name);
    expect(body.data.plan.displayName).toBe(trialPlanResult.plan.displayName);
    expect(body.data.plan.limits).toBeDefined();
  });

  test("should return subscription with plan details for active", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.status).toBe("active");
    expect(body.data.currentPeriodStart).toBeDefined();
    expect(body.data.currentPeriodEnd).toBeDefined();
  });

  test("should return correct trial dates and status", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Use trial plan for proper trial behavior
    await createTestSubscription(organizationId, trialPlanResult.plan.id, {
      status: "trial",
      trialDays: 14,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    // Status in DB is "active" - trial is determined by isTrial
    expect(body.data.status).toBe("active");
    expect(body.data.isTrial).toBe(true);
    expect(body.data.trialStart).toBeDefined();
    expect(body.data.trialEnd).toBeDefined();
    expect(body.data.trialUsed).toBe(false);
  });

  test("should return correct billing period for active subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(
      organizationId,
      diamondPlanResult.plan.id,
      "sub_test123"
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.currentPeriodStart).toBeString();
    expect(body.data.currentPeriodEnd).toBeString();
    expect(body.data.trialUsed).toBe(true);
  });

  test("should return cancelAtPeriodEnd and canceledAt when canceled", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createCanceledSubscription(organizationId, diamondPlanResult.plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.status).toBe("canceled");
  });

  test("should return seats count", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(
      organizationId,
      diamondPlanResult.plan.id,
      "trial"
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.seats).toBeDefined();
    expect(body.data.seats).toBeNumber();
  });

  test("should allow viewer member to read subscription", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Use trial plan for proper trial behavior
    await createTestSubscription(organizationId, trialPlanResult.plan.id, {
      status: "trial",
      trialDays: 14,
    });

    const memberResult = await createTestUser({ emailVerified: true });

    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // Status in DB is "active" - trial is determined by isTrial
    expect(body.data.status).toBe("active");
    expect(body.data.isTrial).toBe(true);
  });
});

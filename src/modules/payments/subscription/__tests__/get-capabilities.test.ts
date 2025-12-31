import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { PLAN_FEATURES } from "@/modules/payments/plans/plans.constants";
import {
  type CreatePlanResult,
  createPaidPlan,
  createTrialPlan,
} from "@/test/factories/plan";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { addMemberToOrganization } from "@/test/helpers/organization";
import {
  createActiveSubscription,
  createCanceledSubscription,
  createExpiredSubscription,
  createTestSubscription,
} from "@/test/helpers/subscription";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/subscription/capabilities`;

let diamondPlanResult: CreatePlanResult;
let trialPlanResult: CreatePlanResult;

describe("GET /v1/payments/subscription/capabilities", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    [diamondPlanResult, trialPlanResult] = await Promise.all([
      createPaidPlan("diamond"),
      createTrialPlan(),
    ]);
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(new Request(ENDPOINT, { method: "GET" }));

    expect(response.status).toBe(401);
  });

  test("should return no_subscription for organization without subscription", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.subscription.status).toBe("no_subscription");
    expect(body.data.subscription.hasAccess).toBe(false);
    expect(body.data.subscription.requiresPayment).toBe(true);
    expect(body.data.plan).toBeNull();
    expect(body.data.features).toBeArray();
    expect(body.data.availableFeatures).toEqual([]);
  });

  test("should return trial status with features for trial subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Use trial plan (isTrial=true) for proper trial behavior
    await createTestSubscription(organizationId, trialPlanResult.plan.id, {
      status: "trial",
      trialDays: 14,
    });

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data.subscription.status).toBe("trial");
    expect(body.data.subscription.hasAccess).toBe(true);
    expect(body.data.subscription.daysRemaining).toBeGreaterThan(0);
    expect(body.data.subscription.requiresPayment).toBe(false);
    expect(body.data.plan).not.toBeNull();
    expect(body.data.plan.name).toBe(trialPlanResult.plan.name);
    expect(body.data.plan.displayName).toBe(trialPlanResult.plan.displayName);
    expect(body.data.features).toBeArray();
    expect(body.data.features.length).toBeGreaterThan(0);
    expect(body.data.availableFeatures).toBeArray();
    expect(body.data.availableFeatures.length).toBeGreaterThan(0);
  });

  test("should return active status with features for active subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data.subscription.status).toBe("active");
    expect(body.data.subscription.hasAccess).toBe(true);
    expect(body.data.subscription.requiresPayment).toBe(false);
    expect(body.data.plan).not.toBeNull();
    expect(body.data.availableFeatures.length).toBeGreaterThan(0);
  });

  test("should return expired status without features for expired subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createExpiredSubscription(organizationId, diamondPlanResult.plan.id);

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data.subscription.status).toBe("expired");
    expect(body.data.subscription.hasAccess).toBe(false);
    expect(body.data.subscription.requiresPayment).toBe(true);
    expect(body.data.plan).toBeNull();
    expect(body.data.availableFeatures).toEqual([]);
  });

  test("should return canceled status without features for canceled subscription", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createCanceledSubscription(organizationId, diamondPlanResult.plan.id);

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data.subscription.status).toBe("canceled");
    expect(body.data.subscription.hasAccess).toBe(false);
    expect(body.data.subscription.requiresPayment).toBe(true);
    expect(body.data.plan).toBeNull();
    expect(body.data.availableFeatures).toEqual([]);
  });

  test("should return past_due status with access during grace period", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createTestSubscription(organizationId, diamondPlanResult.plan.id, {
      status: "past_due",
    });

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data.subscription.status).toBe("past_due");
    expect(body.data.subscription.hasAccess).toBe(true);
    expect(body.data.subscription.requiresPayment).toBe(true);
  });

  test("should return all features with hasAccess and requiredPlan", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    // Should have all features listed
    expect(body.data.features.length).toBe(10);

    // Each feature should have the correct structure
    for (const feature of body.data.features) {
      expect(feature.featureName).toBeString();
      expect(typeof feature.hasAccess).toBe("boolean");
      expect(
        feature.requiredPlan === null ||
          typeof feature.requiredPlan === "string"
      ).toBe(true);
    }

    // Diamond plan should have access to diamond features
    const diamondFeatures = PLAN_FEATURES.diamond;
    for (const featureName of diamondFeatures) {
      const feature = body.data.features.find(
        (f: { featureName: string }) => f.featureName === featureName
      );
      expect(feature?.hasAccess).toBe(true);
    }
  });

  test("should allow viewer member to access capabilities", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Use trial plan for proper trial status
    await createTestSubscription(organizationId, trialPlanResult.plan.id, {
      status: "trial",
      trialDays: 14,
    });

    const viewer = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewer, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers: viewer.headers })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data.subscription.status).toBe("trial");
  });

  test("should allow manager member to access capabilities", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    await createActiveSubscription(organizationId, diamondPlanResult.plan.id);

    const manager = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(manager, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(ENDPOINT, { method: "GET", headers: manager.headers })
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.data.subscription.status).toBe("active");
  });
});

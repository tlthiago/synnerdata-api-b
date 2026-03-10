import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { EmployeeFactory } from "@/test/factories/employee.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

function buildEndpoint(organizationId: string) {
  return `${BASE_URL}/v1/payments/admin/subscriptions/${organizationId}/trial-limits`;
}

async function createOrgWithTrialSubscription(
  trialPlanId: string,
  tierId: string
) {
  const { user, organizationId } = await UserFactory.createWithOrganization();
  const orgId = organizationId as string;

  await SubscriptionFactory.createTrial(orgId, trialPlanId);

  await db
    .update(schema.orgSubscriptions)
    .set({ pricingTierId: tierId })
    .where(eq(schema.orgSubscriptions.organizationId, orgId));

  return { user, orgId };
}

describe("PATCH /admin/subscriptions/:organizationId/trial-limits", () => {
  let app: TestApp;
  let trialPlanResult: Awaited<ReturnType<typeof PlanFactory.createTrial>>;

  beforeAll(async () => {
    app = createTestApp();
    trialPlanResult = await PlanFactory.createTrial();
  });

  // ── Authentication / Authorization ──────────────────────────────

  test("should return 401 without session", async () => {
    const response = await app.handle(
      new Request(buildEndpoint("org-fake"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxEmployees: 50 }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should return 403 for non-admin user", async () => {
    const { headers } = await UserFactory.create();

    const response = await app.handle(
      new Request(buildEndpoint("org-fake"), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ maxEmployees: 50 }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  // ── Validation ──────────────────────────────────────────────────

  test("should return 422 for empty body", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(buildEndpoint("org-fake"), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return 422 for out-of-range values", async () => {
    const { headers } = await UserFactory.createAdmin();

    const response = await app.handle(
      new Request(buildEndpoint("org-fake"), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ maxEmployees: 0, trialDays: 0 }),
      })
    );

    expect(response.status).toBe(422);
  });

  // ── Business Rules ──────────────────────────────────────────────

  test("should return 404 when subscription does not exist", async () => {
    const { headers } = await UserFactory.createAdmin();
    const randomOrgId = `org-${crypto.randomUUID()}`;

    const response = await app.handle(
      new Request(buildEndpoint(randomOrgId), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ maxEmployees: 50 }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should return 400 when subscription is not trial", async () => {
    const { headers } = await UserFactory.createAdmin();
    const { organizationId } = await UserFactory.createWithOrganization();
    const orgId = organizationId as string;

    const paidPlan = await PlanFactory.createPaid("gold");
    const tier = PlanFactory.getFirstTier(paidPlan);
    await SubscriptionFactory.createActive(orgId, paidPlan.plan.id, {
      pricingTierId: tier.id,
    });

    const response = await app.handle(
      new Request(buildEndpoint(orgId), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ maxEmployees: 50 }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_TRIAL");
  });

  test("should return 400 when trialDays results in past date", async () => {
    const { headers } = await UserFactory.createAdmin();
    const { organizationId } = await UserFactory.createWithOrganization();
    const orgId = organizationId as string;

    const subId = await SubscriptionFactory.createTrial(
      orgId,
      trialPlanResult.plan.id
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await db
      .update(schema.orgSubscriptions)
      .set({ trialStart: thirtyDaysAgo })
      .where(eq(schema.orgSubscriptions.id, subId));

    const response = await app.handle(
      new Request(buildEndpoint(orgId), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ trialDays: 5 }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("TRIAL_END_IN_PAST");
  });

  test("should return 400 when maxEmployees is less than current count", async () => {
    const { headers } = await UserFactory.createAdmin();
    const tier = PlanFactory.getFirstTier(trialPlanResult);
    const { user, orgId } = await createOrgWithTrialSubscription(
      trialPlanResult.plan.id,
      tier.id
    );

    // Create 5 employees
    for (let i = 0; i < 5; i++) {
      await EmployeeFactory.create({
        organizationId: orgId,
        userId: user.id,
      });
    }

    const response = await app.handle(
      new Request(buildEndpoint(orgId), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ maxEmployees: 3 }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("TRIAL_MAX_EMPLOYEES_TOO_LOW");
  });

  // ── Success Cases ───────────────────────────────────────────────

  test("should update maxEmployees only", async () => {
    const { headers } = await UserFactory.createAdmin();
    const tier = PlanFactory.getFirstTier(trialPlanResult);
    const { orgId } = await createOrgWithTrialSubscription(
      trialPlanResult.plan.id,
      tier.id
    );

    const response = await app.handle(
      new Request(buildEndpoint(orgId), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ maxEmployees: 50 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.maxEmployees).toBe(50);
    expect(body.data.reactivated).toBe(false);

    // Verify DB: subscription points to new tier
    const sub = await SubscriptionFactory.getByOrganizationId(orgId);
    expect(sub?.pricingTierId).not.toBe(tier.id);

    // Verify new tier has correct maxEmployees
    const newTierId = sub?.pricingTierId ?? "";
    const [newTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, newTierId))
      .limit(1);
    expect(newTier.maxEmployees).toBe(50);
    expect(newTier.priceMonthly).toBe(0);

    // Verify old tier was not modified
    const [oldTier] = await db
      .select()
      .from(schema.planPricingTiers)
      .where(eq(schema.planPricingTiers.id, tier.id))
      .limit(1);
    expect(oldTier.maxEmployees).toBe(tier.maxEmployees);
  });

  test("should update trialDays only", async () => {
    const { headers } = await UserFactory.createAdmin();
    const tier = PlanFactory.getFirstTier(trialPlanResult);
    const { orgId } = await createOrgWithTrialSubscription(
      trialPlanResult.plan.id,
      tier.id
    );

    const response = await app.handle(
      new Request(buildEndpoint(orgId), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ trialDays: 30 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.trialDays).toBe(30);
    expect(body.data.reactivated).toBe(false);

    // Verify trialEnd was recalculated
    const sub = await SubscriptionFactory.getByOrganizationId(orgId);
    expect(sub).toBeDefined();
    const trialStart = sub?.trialStart as Date;
    const trialEnd = sub?.trialEnd as Date;
    const expectedEnd = new Date(trialStart);
    expectedEnd.setDate(expectedEnd.getDate() + 30);

    // Allow 1 second tolerance for test execution time
    expect(Math.abs(trialEnd.getTime() - expectedEnd.getTime())).toBeLessThan(
      1000
    );
  });

  test("should update both maxEmployees and trialDays", async () => {
    const { headers } = await UserFactory.createAdmin();
    const tier = PlanFactory.getFirstTier(trialPlanResult);
    const { orgId } = await createOrgWithTrialSubscription(
      trialPlanResult.plan.id,
      tier.id
    );

    const response = await app.handle(
      new Request(buildEndpoint(orgId), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ maxEmployees: 100, trialDays: 60 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.maxEmployees).toBe(100);
    expect(body.data.trialDays).toBe(60);
    expect(body.data.reactivated).toBe(false);
  });

  test("should reactivate expired trial", async () => {
    const { headers } = await UserFactory.createAdmin();
    const { organizationId } = await UserFactory.createWithOrganization();
    const orgId = organizationId as string;

    const tier = PlanFactory.getFirstTier(trialPlanResult);

    // Create expired trial
    await SubscriptionFactory.createExpired(orgId, trialPlanResult.plan.id);

    // Set trialStart to 20 days ago
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
    await db
      .update(schema.orgSubscriptions)
      .set({
        trialStart: twentyDaysAgo,
        pricingTierId: tier.id,
      })
      .where(eq(schema.orgSubscriptions.organizationId, orgId));

    // Send trialDays: 30 → trialEnd = 20 days ago + 30 = 10 days from now
    const response = await app.handle(
      new Request(buildEndpoint(orgId), {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ trialDays: 30 }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("active");
    expect(body.data.reactivated).toBe(true);
    expect(body.data.trialDays).toBe(30);

    // Verify DB status is active
    const sub = await SubscriptionFactory.getByOrganizationId(orgId);
    expect(sub?.status).toBe("active");
  });
});

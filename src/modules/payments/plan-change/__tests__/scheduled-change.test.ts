import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("GET /v1/payments/subscription/scheduled-change", () => {
  let app: TestApp;
  let diamondPlanResult: CreatePlanResult;
  let goldPlanResult: CreatePlanResult;

  beforeAll(async () => {
    app = createTestApp();
    [diamondPlanResult, goldPlanResult] = await Promise.all([
      PlanFactory.createPaid("diamond"),
      PlanFactory.createPaid("gold"),
    ]);
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  // Note: viewer role has subscription:read permission by design
  // so we don't test 403 for GET endpoint

  test("should return SUBSCRIPTION_NOT_FOUND when org has no subscription", async () => {
    const result = await UserFactory.create({ emailVerified: true });

    // Create org without subscription
    const org = await OrganizationFactory.create({
      name: "No Subscription Org",
      tradeName: "No Sub",
      phone: "11999999999",
    });

    // Add user as owner of the organization
    await OrganizationFactory.addMember(result, {
      organizationId: org.id,
      role: "owner",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "GET",
        headers: result.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should return hasScheduledChange false when no change is scheduled", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.hasScheduledChange).toBe(false);
    expect(body.data.change).toBeUndefined();
  });

  test("should return scheduled change details when change is pending", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: goldPlanResult.plan.id,
        pendingBillingCycle: "monthly",
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.hasScheduledChange).toBe(true);
    expect(body.data.change).toBeDefined();
    expect(body.data.change.pendingPlanId).toBe(goldPlanResult.plan.id);
    expect(body.data.change.pendingBillingCycle).toBe("monthly");
    expect(body.data.change.scheduledAt).toBeDefined();
  });
});

describe("DELETE /v1/payments/subscription/scheduled-change", () => {
  let app: TestApp;
  let diamondPlanResult: CreatePlanResult;
  let goldPlanResult: CreatePlanResult;

  beforeAll(async () => {
    app = createTestApp();
    [diamondPlanResult, goldPlanResult] = await Promise.all([
      PlanFactory.createPaid("diamond"),
      PlanFactory.createPaid("gold"),
    ]);
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without subscription:update permission", async () => {
    // Create owner user with org
    const ownerResult = await UserFactory.createWithOrganization({
      emailVerified: true,
    });

    // Create viewer user and add to same org with limited permissions
    const viewerResult = await UserFactory.create({ emailVerified: true });

    await db.insert(schema.members).values({
      id: `member-${crypto.randomUUID()}`,
      organizationId: ownerResult.organizationId,
      userId: viewerResult.user.id,
      role: "viewer",
      createdAt: new Date(),
    });

    // Set viewer's active organization
    await db
      .update(schema.sessions)
      .set({ activeOrganizationId: ownerResult.organizationId })
      .where(eq(schema.sessions.userId, viewerResult.user.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "DELETE",
        headers: viewerResult.headers,
      })
    );

    expect(response.status).toBe(403);
  });

  test("should return SUBSCRIPTION_NOT_FOUND when org has no subscription", async () => {
    const result = await UserFactory.create({ emailVerified: true });

    // Create org without subscription
    const org = await OrganizationFactory.create({
      name: "No Subscription Org Delete",
      tradeName: "No Sub Delete",
      phone: "11999999999",
    });

    // Add user as owner of the organization
    await OrganizationFactory.addMember(result, {
      organizationId: org.id,
      role: "owner",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "DELETE",
        headers: result.headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("should cancel scheduled plan change", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30);

    await db
      .update(schema.orgSubscriptions)
      .set({
        pendingPlanId: goldPlanResult.plan.id,
        pendingBillingCycle: "monthly",
        planChangeAt: scheduledAt,
      })
      .where(eq(schema.orgSubscriptions.organizationId, organizationId));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.canceled).toBe(true);

    // Verify DB was cleared
    const [subscription] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, organizationId))
      .limit(1);

    expect(subscription.pendingPlanId).toBeNull();
    expect(subscription.pendingBillingCycle).toBeNull();
    expect(subscription.planChangeAt).toBeNull();
  });

  test("should reject when no change is scheduled", async () => {
    const { headers, organizationId } =
      await UserFactory.createWithOrganization({
        emailVerified: true,
      });

    await SubscriptionFactory.createActive(
      organizationId,
      diamondPlanResult.plan.id
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/scheduled-change`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("NO_SCHEDULED_CHANGE");
  });
});

import { beforeAll, describe, expect, test } from "bun:test";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import {
  type CreatePlanResult,
  PlanFactory,
} from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";

let planResult: CreatePlanResult;

describe("org_subscriptions unique constraint", () => {
  beforeAll(async () => {
    planResult = await PlanFactory.createPaid("gold");
  });

  test("should reject a second active subscription for the same organization", async () => {
    const org = await OrganizationFactory.create();
    await SubscriptionFactory.createActive(org.id, planResult.plan.id);

    await expect(
      SubscriptionFactory.createActive(org.id, planResult.plan.id)
    ).rejects.toThrow();
  });

  test("should reject a second past_due subscription for the same organization", async () => {
    const org = await OrganizationFactory.create();
    await SubscriptionFactory.createPastDue(org.id, planResult.plan.id);

    await expect(
      SubscriptionFactory.createActive(org.id, planResult.plan.id)
    ).rejects.toThrow();
  });

  test("should allow a new active subscription after the previous one is canceled", async () => {
    const org = await OrganizationFactory.create();
    await SubscriptionFactory.createCanceled(org.id, planResult.plan.id);

    const newSubId = await SubscriptionFactory.createActive(
      org.id,
      planResult.plan.id
    );

    expect(newSubId).toBeDefined();
  });

  test("should allow a new active subscription after the previous one is expired", async () => {
    const org = await OrganizationFactory.create();
    await SubscriptionFactory.createExpired(org.id, planResult.plan.id);

    const newSubId = await SubscriptionFactory.createActive(
      org.id,
      planResult.plan.id
    );

    expect(newSubId).toBeDefined();
  });

  test("should allow multiple canceled subscriptions for the same organization", async () => {
    const org = await OrganizationFactory.create();
    await SubscriptionFactory.createCanceled(org.id, planResult.plan.id);

    const secondSubId = await SubscriptionFactory.createCanceled(
      org.id,
      planResult.plan.id
    );

    expect(secondSubId).toBeDefined();
  });

  test("should allow multiple expired subscriptions for the same organization", async () => {
    const org = await OrganizationFactory.create();
    await SubscriptionFactory.createExpired(org.id, planResult.plan.id);

    const secondSubId = await SubscriptionFactory.createExpired(
      org.id,
      planResult.plan.id
    );

    expect(secondSubId).toBeDefined();
  });
});

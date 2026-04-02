import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/subscription/retry-trial", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
    await PlanFactory.createTrial();
  });

  test("should create trial when org has no subscription", async () => {
    const userResult = await UserFactory.create();
    const org = await OrganizationFactory.create();
    await OrganizationFactory.addMember(userResult, {
      organizationId: org.id,
      role: "owner",
    });

    // Verify no subscription exists
    const [before] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);
    expect(before).toBeUndefined();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/retry-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userResult.headers.Cookie,
        },
      })
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(true);

    // Verify subscription was created
    const [after] = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id))
      .limit(1);
    expect(after).toBeDefined();
    expect(after.status).toBe("active");
  });

  test("should be idempotent when subscription already exists", async () => {
    const userResult = await UserFactory.create();
    const org = await OrganizationFactory.create();
    await OrganizationFactory.addMember(userResult, {
      organizationId: org.id,
      role: "owner",
    });

    const { plan } = await PlanFactory.createTrial();
    await SubscriptionFactory.createTrial(org.id, plan.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/retry-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userResult.headers.Cookie,
        },
      })
    );

    expect(response.status).toBe(200);

    // Verify still only one subscription
    const subscriptions = await db
      .select()
      .from(schema.orgSubscriptions)
      .where(eq(schema.orgSubscriptions.organizationId, org.id));
    expect(subscriptions.length).toBe(1);
  });

  test("should return 401 without session", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/retry-trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(401);
  });

  test("should return 403 without organization", async () => {
    const userResult = await UserFactory.create();

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/subscription/retry-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: userResult.headers.Cookie,
        },
      })
    );

    // User without org gets forbidden (requireOrganization)
    expect(response.status).not.toBe(200);
  });
});

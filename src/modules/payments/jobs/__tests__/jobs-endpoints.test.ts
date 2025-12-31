import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { type CreatePlanResult, createPaidPlan } from "@/test/factories/plan";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  addMemberToOrganization,
  createTestOrganization,
  type TestOrganization,
} from "@/test/helpers/organization";
import { createTestSubscription } from "@/test/helpers/subscription";
import { createTestUser, type TestUserResult } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/payments/jobs/expire-trials", () => {
  let app: TestApp;
  let diamondPlan: CreatePlanResult;
  const createdOrganizations: TestOrganization[] = [];

  beforeAll(async () => {
    app = createTestApp();
    diamondPlan = await createPaidPlan("diamond");
  });

  afterAll(async () => {
    for (const org of createdOrganizations) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id));
      await db
        .delete(schema.members)
        .where(eq(schema.members.organizationId, org.id));
      await db
        .delete(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id));
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.id, org.id));
    }

    if (diamondPlan) {
      await db
        .delete(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.planId, diamondPlan.plan.id));
      await db
        .delete(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, diamondPlan.plan.id));
    }
  });

  test("should reject requests without x-api-key header", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/expire-trials`, {
        method: "POST",
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject requests with invalid x-api-key", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/expire-trials`, {
        method: "POST",
        headers: {
          "x-api-key": "invalid-key",
        },
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("should expire trials with valid x-api-key", async () => {
    const org = await createTestOrganization();
    createdOrganizations.push(org);

    await createTestSubscription(org.id, diamondPlan.plan.id, {
      status: "trial",
      trialDays: -1,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/expire-trials`, {
        method: "POST",
        headers: {
          "x-api-key": env.INTERNAL_API_KEY,
        },
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("processed");
    expect(body.data).toHaveProperty("expired");
    expect(typeof body.data.processed).toBe("number");
    expect(Array.isArray(body.data.expired)).toBe(true);
  });

  test("should return processed and expired counts", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/expire-trials`, {
        method: "POST",
        headers: {
          "x-api-key": env.INTERNAL_API_KEY,
        },
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.processed).toBeGreaterThanOrEqual(0);
    expect(body.data.expired.length).toBeLessThanOrEqual(body.data.processed);
  });
});

describe("POST /v1/payments/jobs/notify-expiring-trials", () => {
  let app: TestApp;
  let diamondPlan: CreatePlanResult;
  const createdOrganizations: TestOrganization[] = [];
  const createdUsers: TestUserResult[] = [];

  beforeAll(async () => {
    app = createTestApp();
    diamondPlan = await createPaidPlan("diamond");
  });

  afterAll(async () => {
    for (const org of createdOrganizations) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id));
      await db
        .delete(schema.members)
        .where(eq(schema.members.organizationId, org.id));
      await db
        .delete(schema.organizationProfiles)
        .where(eq(schema.organizationProfiles.organizationId, org.id));
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.id, org.id));
    }

    for (const userResult of createdUsers) {
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, userResult.user.id));
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, userResult.user.id));
    }

    if (diamondPlan) {
      await db
        .delete(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.planId, diamondPlan.plan.id));
      await db
        .delete(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, diamondPlan.plan.id));
    }
  });

  test("should reject requests without x-api-key header", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/notify-expiring-trials`, {
        method: "POST",
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject requests with invalid x-api-key", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/notify-expiring-trials`, {
        method: "POST",
        headers: {
          "x-api-key": "invalid-key",
        },
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("should notify expiring trials with valid x-api-key", async () => {
    const org = await createTestOrganization();
    createdOrganizations.push(org);

    const owner = await createTestUser({ emailVerified: true });
    createdUsers.push(owner);

    await addMemberToOrganization(owner, {
      organizationId: org.id,
      role: "owner",
    });

    await createTestSubscription(org.id, diamondPlan.plan.id, {
      status: "trial",
      trialDays: 3,
    });

    const now = new Date();
    const trialEnd = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000);

    await db
      .update(schema.orgSubscriptions)
      .set({ trialEnd })
      .where(eq(schema.orgSubscriptions.organizationId, org.id));

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/notify-expiring-trials`, {
        method: "POST",
        headers: {
          "x-api-key": env.INTERNAL_API_KEY,
        },
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("processed");
    expect(body.data).toHaveProperty("notified");
    expect(typeof body.data.processed).toBe("number");
    expect(Array.isArray(body.data.notified)).toBe(true);
  });

  test("should return processed and notified counts", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/notify-expiring-trials`, {
        method: "POST",
        headers: {
          "x-api-key": env.INTERNAL_API_KEY,
        },
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.processed).toBeGreaterThanOrEqual(0);
    expect(body.data.notified.length).toBeLessThanOrEqual(body.data.processed);
  });
});

describe("POST /v1/payments/jobs/process-cancellations", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
  });

  test("should reject requests without x-api-key header", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/process-cancellations`, {
        method: "POST",
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject requests with invalid x-api-key", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/process-cancellations`, {
        method: "POST",
        headers: {
          "x-api-key": "invalid-key",
        },
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("should process cancellations with valid x-api-key", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/payments/jobs/process-cancellations`, {
        method: "POST",
        headers: {
          "x-api-key": env.INTERNAL_API_KEY,
        },
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("processed");
    expect(body.data).toHaveProperty("canceled");
    expect(typeof body.data.processed).toBe("number");
    expect(Array.isArray(body.data.canceled)).toBe(true);
  });
});

describe("POST /v1/payments/jobs/suspend-expired-grace-periods", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
  });

  test("should reject requests without x-api-key header", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/jobs/suspend-expired-grace-periods`,
        {
          method: "POST",
        }
      )
    );

    expect(response.status).toBe(422);
  });

  test("should reject requests with invalid x-api-key", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/jobs/suspend-expired-grace-periods`,
        {
          method: "POST",
          headers: {
            "x-api-key": "invalid-key",
          },
        }
      )
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("should suspend expired grace periods with valid x-api-key", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/jobs/suspend-expired-grace-periods`,
        {
          method: "POST",
          headers: {
            "x-api-key": env.INTERNAL_API_KEY,
          },
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("processed");
    expect(body.data).toHaveProperty("suspended");
    expect(typeof body.data.processed).toBe("number");
    expect(Array.isArray(body.data.suspended)).toBe(true);
  });
});

describe("POST /v1/payments/jobs/process-scheduled-plan-changes", () => {
  let app: TestApp;

  beforeAll(async () => {
    app = createTestApp();
  });

  test("should reject requests without x-api-key header", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/jobs/process-scheduled-plan-changes`,
        {
          method: "POST",
        }
      )
    );

    expect(response.status).toBe(422);
  });

  test("should reject requests with invalid x-api-key", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/jobs/process-scheduled-plan-changes`,
        {
          method: "POST",
          headers: {
            "x-api-key": "invalid-key",
          },
        }
      )
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("should process scheduled plan changes with valid x-api-key", async () => {
    const response = await app.handle(
      new Request(
        `${BASE_URL}/v1/payments/jobs/process-scheduled-plan-changes`,
        {
          method: "POST",
          headers: {
            "x-api-key": env.INTERNAL_API_KEY,
          },
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("processed");
    expect(body.data).toHaveProperty("executed");
    expect(body.data).toHaveProperty("failed");
    expect(typeof body.data.processed).toBe("number");
    expect(Array.isArray(body.data.executed)).toBe(true);
    expect(Array.isArray(body.data.failed)).toBe(true);
  });
});

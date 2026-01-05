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

describe("POST /v1/payments/jobs/expire-trials", () => {
  let app: TestApp;
  let diamondPlan: CreatePlanResult;

  beforeAll(async () => {
    app = createTestApp();
    diamondPlan = await PlanFactory.createPaid("diamond");
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
    const org = await OrganizationFactory.create();

    await SubscriptionFactory.createTrial(org.id, diamondPlan.plan.id, -1);

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

  beforeAll(async () => {
    app = createTestApp();
    diamondPlan = await PlanFactory.createPaid("diamond");
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
    const org = await OrganizationFactory.create();
    const owner = await UserFactory.create({ emailVerified: true });

    await OrganizationFactory.addMember(owner, {
      organizationId: org.id,
      role: "owner",
    });

    await SubscriptionFactory.createTrial(org.id, diamondPlan.plan.id, 3);

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

  beforeAll(() => {
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

  beforeAll(() => {
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

  beforeAll(() => {
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

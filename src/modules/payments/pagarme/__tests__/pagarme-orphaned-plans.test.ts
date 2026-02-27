import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";

const BASE_URL = env.API_URL;
const LIST_URL = `${BASE_URL}/v1/payments/admin/pagarme/orphaned-plans`;
const CLEANUP_URL = `${BASE_URL}/v1/payments/admin/pagarme/orphaned-plans/cleanup`;

describe("Orphaned Pagarme Plans", () => {
  let app: TestApp;
  let adminHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    adminHeaders = headers;
  });

  describe("GET /payments/admin/pagarme/orphaned-plans", () => {
    test("should reject unauthenticated requests", async () => {
      const response = await app.handle(new Request(LIST_URL));
      expect(response.status).toBe(401);
    });

    test("should reject non-admin users", async () => {
      const { headers: nonAdminHeaders } = await UserFactory.create({
        emailVerified: true,
      });

      const response = await app.handle(
        new Request(LIST_URL, { headers: nonAdminHeaders })
      );
      expect(response.status).toBe(403);
    });

    test("should return empty list when no orphaned plans", async () => {
      const response = await app.handle(
        new Request(LIST_URL, { headers: adminHeaders })
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.orphanedPlans).toBeArray();
      expect(body.data.total).toBeNumber();
    });

    test("should return orphaned plans from history", async () => {
      const [plan] = await db
        .insert(schema.subscriptionPlans)
        .values({
          id: `plan-${crypto.randomUUID()}`,
          name: `test-orphan-${crypto.randomUUID().slice(0, 8)}`,
          displayName: "Test Orphan Plan",
        })
        .returning();

      const pagarmePlanId = `plan_test_${crypto.randomUUID().slice(0, 8)}`;

      await db.insert(schema.pagarmePlanHistory).values({
        id: `pagarme-hist-${crypto.randomUUID()}`,
        localPlanId: plan.id,
        localTierId: `tier-${crypto.randomUUID()}`,
        pagarmePlanId,
        billingCycle: "monthly",
        priceAtCreation: 9990,
        isActive: false,
      });

      const response = await app.handle(
        new Request(LIST_URL, { headers: adminHeaders })
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.orphanedPlans).toBeArray();
      expect(body.data.total).toBeGreaterThanOrEqual(1);

      const found = body.data.orphanedPlans.find(
        (p: { pagarmePlanId: string }) => p.pagarmePlanId === pagarmePlanId
      );
      expect(found).toBeDefined();
      expect(found.localPlanId).toBe(plan.id);
      expect(found.billingCycle).toBe("monthly");
      expect(found.priceAtCreation).toBe(9990);
      expect(found.isActive).toBe(false);
    });
  });

  describe("POST /payments/admin/pagarme/orphaned-plans/cleanup", () => {
    test("should reject unauthenticated requests", async () => {
      const response = await app.handle(
        new Request(CLEANUP_URL, { method: "POST" })
      );
      expect(response.status).toBe(401);
    });

    test("should reject non-admin users", async () => {
      const { headers: nonAdminHeaders } = await UserFactory.create({
        emailVerified: true,
      });

      const response = await app.handle(
        new Request(CLEANUP_URL, {
          method: "POST",
          headers: nonAdminHeaders,
        })
      );
      expect(response.status).toBe(403);
    });

    test("should return cleanup summary", async () => {
      const response = await app.handle(
        new Request(CLEANUP_URL, {
          method: "POST",
          headers: adminHeaders,
        })
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.result).toBeDefined();
      expect(body.data.result.deactivated).toBeArray();
      expect(body.data.result.kept).toBeArray();
      expect(body.data.result.errors).toBeArray();
      expect(body.data.summary).toBeDefined();
      expect(body.data.summary.totalOrphaned).toBeNumber();
      expect(body.data.summary.deactivated).toBeNumber();
      expect(body.data.summary.kept).toBeNumber();
      expect(body.data.summary.errors).toBeNumber();
    });
  });
});

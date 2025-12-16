import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { proPlan } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { seedPlans } from "@/test/helpers/seed";
import { createActiveSubscription } from "@/test/helpers/subscription";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { JobsService } from "../jobs/jobs.service";
import { SubscriptionService } from "../subscription/subscription.service";

const BASE_URL = env.API_URL;

describe("Soft Cancel Use Case: Cancel → Restore → Cancel → Job Processes", () => {
  let app: TestApp;
  let sessionHeaders: Record<string, string>;
  let organizationId: string;

  beforeAll(async () => {
    app = createTestApp();
    await seedPlans();
  });

  afterAll(async () => {
    // Restore real time
    setSystemTime();

    // Cleanup subscription
    if (organizationId) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));
    }
  });

  describe("Fase 1: Setup - Subscription Ativa", () => {
    test("should create authenticated user with organization", async () => {
      const result = await createTestUserWithOrganization({
        emailVerified: true,
      });

      expect(result.user.id).toBeDefined();
      expect(result.organizationId).toBeDefined();

      organizationId = result.organizationId;
      sessionHeaders = result.headers;
    });

    test("should create active subscription with currentPeriodEnd in 30 days", async () => {
      if (!proPlan) {
        throw new Error("Pro plan not found in fixtures");
      }

      // Delete any existing subscriptions
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      // Create without pagarmeSubscriptionId - simulates local subscription
      // Job will skip Pagar.me call when pagarmeSubscriptionId is null
      await createActiveSubscription(organizationId, proPlan.id);

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.cancelAtPeriodEnd).toBe(false);
      expect(subscription.canceledAt).toBeNull();
      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);
      expect(subscription.pagarmeSubscriptionId).toBeNull();
    });

    test("should have full access", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("active");
    });
  });

  describe("Fase 2: Cancel (Soft) - Flags Setadas, Acesso Mantido", () => {
    test("should cancel subscription via API", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
          method: "POST",
          headers: sessionHeaders,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.cancelAtPeriodEnd).toBe(true);
      expect(body.data.currentPeriodEnd).toBeDefined();
    });

    test("should set cancelAtPeriodEnd and canceledAt", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.cancelAtPeriodEnd).toBe(true);
      expect(subscription.canceledAt).toBeInstanceOf(Date);
      // Status should remain active (soft cancel)
      expect(subscription.status).toBe("active");
    });

    test("should still have access after soft cancel", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("active");
    });

    test("should not have called Pagarme (no pagarmeSubscriptionId)", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      // pagarmeSubscriptionId is null - no Pagar.me call was made
      expect(subscription.pagarmeSubscriptionId).toBeNull();
    });
  });

  describe("Fase 3: Restore - Flags Limpas, Assinatura Continua", () => {
    test("should restore subscription via API", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
          method: "POST",
          headers: sessionHeaders,
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.restored).toBe(true);
    });

    test("should clear cancelAtPeriodEnd and canceledAt", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.cancelAtPeriodEnd).toBe(false);
      expect(subscription.canceledAt).toBeNull();
      expect(subscription.status).toBe("active");
    });

    test("should have full access after restore", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("active");
    });
  });

  describe("Fase 4: Cancel Novamente - Preparação para Job", () => {
    test("should cancel subscription again via API", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/subscription/cancel`, {
          method: "POST",
          headers: sessionHeaders,
        })
      );

      expect(response.status).toBe(200);
    });

    test("should have cancelAtPeriodEnd set again", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.cancelAtPeriodEnd).toBe(true);
      expect(subscription.canceledAt).toBeInstanceOf(Date);
      expect(subscription.status).toBe("active");
    });
  });

  describe("Fase 5: Job Processa - Avança Tempo e Executa", () => {
    test("should set currentPeriodEnd to past (simulate period ended)", async () => {
      // Set currentPeriodEnd to yesterday to simulate period ended
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await db
        .update(schema.orgSubscriptions)
        .set({ currentPeriodEnd: pastDate })
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);
      expect(subscription.currentPeriodEnd?.getTime()).toBeLessThan(Date.now());
    });

    test("should process scheduled cancellations via job", async () => {
      // No mock needed - pagarmeSubscriptionId is null, so job skips Pagar.me call
      const result = await JobsService.processScheduledCancellations();

      expect(result.processed).toBeGreaterThanOrEqual(1);
    });

    test("should change status to canceled after job runs", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("canceled");
    });
  });

  describe("Fase 6: Validação Final - Acesso Negado, Restore Bloqueado", () => {
    test("should deny access after final cancellation", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(false);
      expect(access.status).toBe("canceled");
    });

    test("should not allow restore after final cancellation", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/subscription/restore`, {
          method: "POST",
          headers: sessionHeaders,
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.code).toBe("SUBSCRIPTION_NOT_RESTORABLE");
    });

    test("should have final subscription state", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("canceled");
      expect(subscription.cancelAtPeriodEnd).toBe(true);
      expect(subscription.canceledAt).toBeInstanceOf(Date);
    });
  });
});

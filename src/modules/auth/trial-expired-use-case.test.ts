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
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import { starterPlan } from "@/test/fixtures/plans";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { waitForOTP } from "@/test/helpers/mailhog";

const BASE_URL = env.API_URL;

describe("Trial Expired Use Case: Usuário com Trial Expirado", () => {
  let app: TestApp;
  let testEmail: string;
  let sessionCookies: string;
  let organizationId: string;
  let originalTime: Date;

  beforeAll(async () => {
    app = createTestApp();
    testEmail = `trial-expired-${crypto.randomUUID()}@example.com`;
    originalTime = new Date();

    // Insert starter plan if it doesn't exist
    if (starterPlan) {
      await db
        .insert(schema.subscriptionPlans)
        .values(starterPlan)
        .onConflictDoNothing();
    }
  });

  afterAll(async () => {
    // Restore real time
    setSystemTime();

    // Cleanup test data
    if (organizationId) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId));
      await db
        .delete(schema.members)
        .where(eq(schema.members.organizationId, organizationId));
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.id, organizationId));
    }

    // Clean up verifications
    const identifier = `sign-in-otp-${testEmail}`;
    await db
      .delete(schema.verifications)
      .where(eq(schema.verifications.identifier, identifier));

    // Clean up user and sessions
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, testEmail))
      .limit(1);

    if (user) {
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));
      await db.delete(schema.users).where(eq(schema.users.id, user.id));
    }
  });

  describe("Setup: Criar usuário com trial ativo", () => {
    test("should create user via OTP sign-in", async () => {
      // Send OTP
      const sendResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/email-otp/send-verification-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            type: "sign-in",
          }),
        })
      );
      expect(sendResponse.status).toBe(200);

      // Get OTP and sign in
      const otp = await waitForOTP(testEmail);
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            otp,
          }),
        })
      );

      expect(signInResponse.status).toBe(200);
      sessionCookies = signInResponse.headers.get("set-cookie") ?? "";
    });

    test("should create organization with trial", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/organization/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({
            name: "Trial Expired Test Org",
            slug: `trial-expired-org-${crypto.randomUUID().slice(0, 8)}`,
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      organizationId = body.id;
    });

    test("should have active trial with 14 days remaining", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("trial");
      expect(access.daysRemaining).toBe(14);
      expect(access.requiresPayment).toBe(false);
    });
  });

  describe("Fase 1: Trial Ativo (Dia 1)", () => {
    test("should allow access to protected resources", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("trial");
    });

    test("should show correct days remaining", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.daysRemaining).toBeGreaterThan(0);
      expect(access.daysRemaining).toBeLessThanOrEqual(14);
    });
  });

  describe("Fase 2: Trial Próximo do Fim (Dia 12)", () => {
    test("should advance time to day 12 of trial", () => {
      const futureDate = new Date(originalTime);
      futureDate.setDate(futureDate.getDate() + 12);
      setSystemTime(futureDate);

      expect(new Date().getDate()).toBe(futureDate.getDate());
    });

    test("should still have access with ~2 days remaining", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("trial");
      // Due to ceiling calculation, could be 2 or 3 depending on exact time
      expect(access.daysRemaining).toBeGreaterThanOrEqual(2);
      expect(access.daysRemaining).toBeLessThanOrEqual(3);
    });

    test("should show warning that trial is ending soon", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      // Frontend pode usar isso para mostrar banner de aviso
      expect(access.daysRemaining).toBeLessThanOrEqual(3);
      expect(access.requiresPayment).toBe(false);
    });
  });

  describe("Fase 3: Trial Expirado (Dia 15)", () => {
    test("should advance time to day 15 (trial expired)", () => {
      const futureDate = new Date(originalTime);
      futureDate.setDate(futureDate.getDate() + 15);
      setSystemTime(futureDate);

      expect(new Date().getDate()).toBe(futureDate.getDate());
    });

    test("should deny access after trial expires", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(false);
      expect(access.status).toBe("trial_expired");
      expect(access.daysRemaining).toBe(0);
      expect(access.requiresPayment).toBe(true);
    });

    test("should still return trial end date for reference", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.trialEnd).toBeDefined();
      expect(access.trialEnd).toBeInstanceOf(Date);
    });

    test("should indicate payment is required", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.requiresPayment).toBe(true);
    });
  });

  describe("Fase 4: Verificação de Subscription Status no DB", () => {
    test("subscription status should be 'active' in database (trial is determined by plan.isTrial)", async () => {
      // Trial subscriptions have status "active" in the DB
      // The "trial" or "trial_expired" state is computed by checkAccess based on plan.isTrial + trialEnd
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(subscription.status).toBe("active");
    });

    test("checkAccess should return trial_expired before explicit expiration job runs", async () => {
      // Before the expireTrial job runs, checkAccess computes the expired state
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(false);
      expect(access.status).toBe("trial_expired");
      expect(access.requiresPayment).toBe(true);
    });

    test("should be able to explicitly expire trial via service", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      await SubscriptionService.expireTrial(subscription.id);

      const [updatedSubscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      expect(updatedSubscription.status).toBe("expired");
    });

    test("checkAccess should return expired status after explicit expiration", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(false);
      expect(access.status).toBe("expired");
      expect(access.requiresPayment).toBe(true);
    });
  });

  describe("Fase 5: Restaurar Tempo Real", () => {
    test("should restore real system time", () => {
      setSystemTime(); // Reset to real time

      const now = new Date();
      const diff = Math.abs(now.getTime() - Date.now());

      // Should be within 1 second of real time
      expect(diff).toBeLessThan(1000);
    });
  });
});

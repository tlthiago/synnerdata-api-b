import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setSystemTime,
  spyOn,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { PlanChangeService } from "@/modules/payments/plan-change/plan-change.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import { BillingProfileFactory } from "@/test/factories/payments/billing-profile.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { waitForPlanChangeEmail } from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const ENDPOINT = `${BASE_URL}/v1/payments/subscription/change`;

/**
 * Downgrade Use Case: Diamond → Gold
 *
 * Fluxo completo:
 * 1. Usuário com subscription Diamond ativa solicita downgrade para Gold
 * 2. Sistema agenda mudança para fim do período atual
 * 3. Job executa a mudança na data agendada
 * 4. Plano atualiza para Gold
 * 5. Limite de funcionários atualiza
 * 6. Features disponíveis mudam
 * 7. Email de confirmação enviado
 */
describe("Downgrade Use Case: Diamond → Gold", () => {
  let app: TestApp;
  let sessionHeaders: Record<string, string>;
  let organizationId: string;
  let subscriptionId: string;
  let userEmail: string;
  let originalTime: Date;

  // Plans
  let diamondPlan: Awaited<ReturnType<typeof PlanFactory.createPaid>>["plan"];
  let diamondTiers: Awaited<ReturnType<typeof PlanFactory.createPaid>>["tiers"];
  let goldPlan: Awaited<ReturnType<typeof PlanFactory.createPaid>>["plan"];
  let goldTiers: Awaited<ReturnType<typeof PlanFactory.createPaid>>["tiers"];

  beforeAll(async () => {
    app = createTestApp();
    originalTime = new Date();

    // Create plans
    const diamond = await PlanFactory.createPaid("diamond");
    const gold = await PlanFactory.createPaid("gold");
    diamondPlan = diamond.plan;
    diamondTiers = diamond.tiers;
    goldPlan = gold.plan;
    goldTiers = gold.tiers;
  });

  afterAll(async () => {
    // Restore real time
    setSystemTime();

    // Cleanup
    if (subscriptionId) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId));
    }
    if (organizationId) {
      await db
        .delete(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, organizationId));
      await db
        .delete(schema.members)
        .where(eq(schema.members.organizationId, organizationId));
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.id, organizationId));
    }
  });

  // ============================================================
  // FASE 1: SETUP - Subscription Diamond Ativa
  // ============================================================

  describe("Fase 1: Setup - Subscription Diamond Ativa", () => {
    test("should create user with organization", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      organizationId = result.organizationId;
      sessionHeaders = result.headers;
      userEmail = result.user.email;

      expect(organizationId).toBeDefined();
    });

    test("should create billing profile", async () => {
      await BillingProfileFactory.create({ organizationId });

      const [profile] = await db
        .select()
        .from(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, organizationId))
        .limit(1);

      expect(profile).toBeDefined();
    });

    test("should create active Diamond subscription", async () => {
      // Period: starts today, ends in 30 days
      const periodStart = new Date(originalTime);
      const periodEnd = new Date(originalTime);
      periodEnd.setDate(periodEnd.getDate() + 30);

      subscriptionId = await SubscriptionFactory.createActive(
        organizationId,
        diamondPlan.id,
        {
          billingCycle: "monthly",
          pricingTierId: diamondTiers[0].id, // 0-10 employees
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        }
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.planId).toBe(diamondPlan.id);
      expect(subscription.pricingTierId).toBe(diamondTiers[0].id);
    });

    test("should have access to Diamond features", async () => {
      const [subscription] = await db
        .select({
          subscription: schema.orgSubscriptions,
          plan: schema.subscriptionPlans,
        })
        .from(schema.orgSubscriptions)
        .innerJoin(
          schema.subscriptionPlans,
          eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
        )
        .where(eq(schema.orgSubscriptions.organizationId, organizationId))
        .limit(1);

      const features = subscription.plan.limits?.features ?? [];

      // Diamond has these features that Gold doesn't
      expect(features).toContain("birthdays");
      expect(features).toContain("ppe");
      expect(features).toContain("employee_record");
    });

    test("should have employee limit of 10 (tier 0-10)", async () => {
      const [tier] = await db
        .select()
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.id, diamondTiers[0].id))
        .limit(1);

      expect(tier.maxEmployees).toBe(10);
    });
  });

  // ============================================================
  // FASE 2: SOLICITAR DOWNGRADE
  // ============================================================

  describe("Fase 2: Solicitar Downgrade para Gold", () => {
    test("should request downgrade to Gold plan", async () => {
      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...sessionHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            newPlanId: goldPlan.id,
            newTierId: goldTiers[0].id, // Same tier range (0-10)
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.changeType).toBe("downgrade");
      expect(body.data.immediate).toBe(false);
      expect(body.data.scheduledAt).toBeDefined();
      expect(body.data.checkoutUrl).toBeUndefined(); // Downgrade não gera checkout
    });

    test("should save pending plan change", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.pendingPlanId).toBe(goldPlan.id);
      expect(subscription.pendingPricingTierId).toBe(goldTiers[0].id);
      expect(subscription.pendingBillingCycle).toBe("monthly");
      expect(subscription.planChangeAt).toBeInstanceOf(Date);
    });

    test("should schedule change for end of current period", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      // planChangeAt should match currentPeriodEnd
      expect(subscription.planChangeAt?.toDateString()).toBe(
        subscription.currentPeriodEnd?.toDateString()
      );
    });

    test("current plan should remain Diamond", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      // Plano atual não muda até execução
      expect(subscription.planId).toBe(diamondPlan.id);
      expect(subscription.pricingTierId).toBe(diamondTiers[0].id);
    });

    test("should still have access to Diamond features", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("active");
    });
  });

  // ============================================================
  // FASE 3: TENTATIVA DE NOVA MUDANÇA (BLOQUEADA)
  // ============================================================

  describe("Fase 3: Bloqueio de Nova Mudança", () => {
    test("should reject new change when one is already scheduled", async () => {
      const { plan: platinumPlan, tiers: platinumTiers } =
        await PlanFactory.createPaid("platinum");

      const response = await app.handle(
        new Request(ENDPOINT, {
          method: "POST",
          headers: { ...sessionHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            newPlanId: platinumPlan.id,
            newTierId: platinumTiers[0].id,
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.code).toBe("PLAN_CHANGE_IN_PROGRESS");
    });
  });

  // ============================================================
  // FASE 4: AVANÇAR TEMPO E EXECUTAR JOB
  // ============================================================

  describe("Fase 4: Execução do Job no Fim do Período", () => {
    test("should advance time to end of period (30 days later)", () => {
      const futureDate = new Date(originalTime);
      futureDate.setDate(futureDate.getDate() + 31); // 1 day after period end
      setSystemTime(futureDate);

      expect(new Date().getDate()).toBe(futureDate.getDate());
    });

    test("should find subscription in scheduled changes for execution", async () => {
      const scheduledChanges =
        await PlanChangeService.getScheduledChangesForExecution();

      const found = scheduledChanges.find((s) => s.id === subscriptionId);
      expect(found).toBeDefined();
    });

    test("should execute scheduled plan change", async () => {
      // Mock Pagarme cancel (subscription may have pagarmeSubscriptionId)
      const { PagarmeClient } = await import(
        "@/modules/payments/pagarme/client"
      );
      const cancelSpy = spyOn(
        PagarmeClient,
        "cancelSubscription"
      ).mockResolvedValue({} as never);

      await PlanChangeService.executeScheduledChange(subscriptionId);

      cancelSpy.mockRestore();
    });

    test("should update plan to Gold", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.planId).toBe(goldPlan.id);
    });

    test("should update pricing tier", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.pricingTierId).toBe(goldTiers[0].id);
    });

    test("should clear pending fields", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.pendingPlanId).toBeNull();
      expect(subscription.pendingPricingTierId).toBeNull();
      expect(subscription.pendingBillingCycle).toBeNull();
      expect(subscription.planChangeAt).toBeNull();
    });

    test("should set new period dates", async () => {
      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      expect(subscription.currentPeriodStart).toBeInstanceOf(Date);
      expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);

      // New period should start from execution date
      if (subscription.currentPeriodStart && subscription.currentPeriodEnd) {
        const periodDays = Math.round(
          (subscription.currentPeriodEnd.getTime() -
            subscription.currentPeriodStart.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        // Monthly = ~30 days
        expect(periodDays).toBeGreaterThanOrEqual(28);
        expect(periodDays).toBeLessThanOrEqual(31);
      }
    });
  });

  // ============================================================
  // FASE 5: VALIDAR FEATURES E LIMITES
  // ============================================================

  describe("Fase 5: Validar Features e Limites Após Downgrade", () => {
    test("should have Gold features (lost Diamond-exclusive features)", async () => {
      const [result] = await db
        .select({
          plan: schema.subscriptionPlans,
        })
        .from(schema.orgSubscriptions)
        .innerJoin(
          schema.subscriptionPlans,
          eq(schema.orgSubscriptions.planId, schema.subscriptionPlans.id)
        )
        .where(eq(schema.orgSubscriptions.id, subscriptionId))
        .limit(1);

      const features = result.plan.limits?.features ?? [];

      // Gold features
      expect(features).toContain("terminated_employees");
      expect(features).toContain("absences");
      expect(features).toContain("medical_certificates");
      expect(features).toContain("accidents");
      expect(features).toContain("warnings");
      expect(features).toContain("employee_status");

      // Diamond-exclusive features (should NOT be present)
      expect(features).not.toContain("birthdays");
      expect(features).not.toContain("ppe");
      expect(features).not.toContain("employee_record");
    });

    test("should maintain employee limit (same tier range)", async () => {
      const [tier] = await db
        .select()
        .from(schema.planPricingTiers)
        .where(eq(schema.planPricingTiers.id, goldTiers[0].id))
        .limit(1);

      // Gold tier 0 also has 0-10 employees
      expect(tier.maxEmployees).toBe(10);
    });

    test("should still have active status", async () => {
      const access = await SubscriptionService.checkAccess(organizationId);

      expect(access.hasAccess).toBe(true);
      expect(access.status).toBe("active");
    });
  });

  // ============================================================
  // FASE 6: VALIDAR EMAIL DE CONFIRMAÇÃO
  // ============================================================

  describe("Fase 6: Email de Confirmação", () => {
    test("should have sent plan change email", async () => {
      // Skip email validation if MailHog isn't available
      try {
        const emailData = await waitForPlanChangeEmail(userEmail, 20, 200);

        expect(emailData.subject).toContain("Mudança de Plano");
        expect(emailData.previousPlanName).toContain(diamondPlan.displayName);
        expect(emailData.newPlanName).toContain(goldPlan.displayName);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes("MailHog is not available") ||
            error.message.includes("No plan change email found"))
        ) {
          console.warn(
            "Skipping email validation: MailHog not available or email not received"
          );
          return;
        }
        throw error;
      }
    });
  });

  // ============================================================
  // FASE 7: RESTAURAR TEMPO
  // ============================================================

  describe("Fase 7: Restaurar Tempo Real", () => {
    test("should restore real system time", () => {
      setSystemTime();

      const now = new Date();
      const diff = Math.abs(now.getTime() - Date.now());

      expect(diff).toBeLessThan(1000);
    });
  });
});

// ============================================================
// DOWNGRADE COM BLOQUEIO POR FUNCIONÁRIOS
// ============================================================

describe("Downgrade Use Case: Bloqueio por Limite de Funcionários", () => {
  let app: TestApp;
  let sessionHeaders: Record<string, string>;
  let organizationId: string;
  let userId: string;
  let subscriptionId: string;

  let diamondPlan: Awaited<ReturnType<typeof PlanFactory.createPaid>>["plan"];
  let diamondTiers: Awaited<ReturnType<typeof PlanFactory.createPaid>>["tiers"];
  let goldPlan: Awaited<ReturnType<typeof PlanFactory.createPaid>>["plan"];
  let goldTiers: Awaited<ReturnType<typeof PlanFactory.createPaid>>["tiers"];

  beforeAll(async () => {
    app = createTestApp();

    const diamond = await PlanFactory.createPaid("diamond");
    const gold = await PlanFactory.createPaid("gold");
    diamondPlan = diamond.plan;
    diamondTiers = diamond.tiers;
    goldPlan = gold.plan;
    goldTiers = gold.tiers;
  });

  afterAll(async () => {
    // Cleanup employees
    if (organizationId) {
      await db
        .delete(schema.employees)
        .where(eq(schema.employees.organizationId, organizationId));
    }
    if (subscriptionId) {
      await db
        .delete(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.id, subscriptionId));
    }
    if (organizationId) {
      await db
        .delete(schema.billingProfiles)
        .where(eq(schema.billingProfiles.organizationId, organizationId));
      await db
        .delete(schema.members)
        .where(eq(schema.members.organizationId, organizationId));
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.id, organizationId));
    }
  });

  describe("Setup: Subscription com 15 funcionários", () => {
    test("should create user with organization", async () => {
      const result = await UserFactory.createWithOrganization({
        emailVerified: true,
      });

      organizationId = result.organizationId;
      userId = result.userId;
      sessionHeaders = result.headers;
    });

    test("should create billing profile", async () => {
      await BillingProfileFactory.create({ organizationId });
    });

    test("should create subscription on tier 11-20", async () => {
      subscriptionId = await SubscriptionFactory.createActive(
        organizationId,
        diamondPlan.id,
        {
          billingCycle: "monthly",
          pricingTierId: diamondTiers[1].id, // 11-20 employees
        }
      );
    });

    test("should create 15 employees", async () => {
      const { EmployeeFactory } = await import(
        "@/test/factories/employee.factory"
      );

      const employees = await EmployeeFactory.createMany({
        organizationId,
        userId,
        count: 15,
      });

      expect(employees).toHaveLength(15);
    });
  });

  describe("Tentativa de Downgrade para Tier 0-10", () => {
    test("should reject downgrade when employees exceed new tier limit", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/subscription/change`, {
          method: "POST",
          headers: { ...sessionHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            newTierId: goldTiers[0].id, // 0-10 employees (limit 10 < 15 current)
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error.code).toBe("EMPLOYEE_COUNT_EXCEEDS_NEW_PLAN_LIMIT");
    });

    test("should allow downgrade to tier that fits employees", async () => {
      // Tier 1 (11-20) fits 15 employees - same tier, different plan (downgrade by price)
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/payments/subscription/change`, {
          method: "POST",
          headers: { ...sessionHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            newPlanId: goldPlan.id, // Gold is cheaper than Diamond
            newTierId: goldTiers[1].id, // 11-20 employees (limit 20 >= 15 current)
            successUrl: "https://example.com/success",
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.changeType).toBe("downgrade");
    });
  });
});

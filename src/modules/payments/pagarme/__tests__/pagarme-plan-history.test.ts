import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { UserFactory } from "@/test/factories/user.factory";
import { createTestApp, type TestApp } from "@/test/support/app";
import { EMPLOYEE_TIERS, PLAN_FEATURES } from "../../plans/plans.constants";
import { PagarmePlanHistoryService } from "../pagarme-plan-history.service";

const BASE_URL = env.API_URL;
const GOLD_FEATURES = [...PLAN_FEATURES.gold];

function generateTierPrices(basePrice: number) {
  return EMPLOYEE_TIERS.map((tier, index) => ({
    minEmployees: tier.min,
    maxEmployees: tier.max,
    priceMonthly: basePrice + index * 1000,
  }));
}

function generateUniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

describe("PagarmePlanHistoryService", () => {
  let testPlanId: string;

  beforeAll(async () => {
    const [plan] = await db
      .insert(schema.subscriptionPlans)
      .values({
        id: `plan-${crypto.randomUUID()}`,
        name: generateUniqueName("hist-test"),
        displayName: "History Test Plan",
      })
      .returning();
    testPlanId = plan.id;
  });

  test("record() should insert a history entry with isActive=true", async () => {
    const tierId = `tier-${crypto.randomUUID()}`;
    const pagarmePlanId = `plan_pagarme_${crypto.randomUUID().slice(0, 8)}`;

    await PagarmePlanHistoryService.record({
      localPlanId: testPlanId,
      localTierId: tierId,
      pagarmePlanId,
      billingCycle: "monthly",
      priceAtCreation: 4900,
    });

    const [record] = await db
      .select()
      .from(schema.pagarmePlanHistory)
      .where(eq(schema.pagarmePlanHistory.pagarmePlanId, pagarmePlanId))
      .limit(1);

    expect(record).toBeDefined();
    expect(record.id).toStartWith("pagarme-hist-");
    expect(record.localPlanId).toBe(testPlanId);
    expect(record.localTierId).toBe(tierId);
    expect(record.pagarmePlanId).toBe(pagarmePlanId);
    expect(record.billingCycle).toBe("monthly");
    expect(record.priceAtCreation).toBe(4900);
    expect(record.isActive).toBe(true);
  });

  test("deactivateByTierId() should mark matching records as inactive", async () => {
    const tierId = `tier-${crypto.randomUUID()}`;
    const pagarmePlanId1 = `plan_pagarme_${crypto.randomUUID().slice(0, 8)}`;
    const pagarmePlanId2 = `plan_pagarme_${crypto.randomUUID().slice(0, 8)}`;

    await PagarmePlanHistoryService.record({
      localPlanId: testPlanId,
      localTierId: tierId,
      pagarmePlanId: pagarmePlanId1,
      billingCycle: "monthly",
      priceAtCreation: 4900,
    });

    await PagarmePlanHistoryService.record({
      localPlanId: testPlanId,
      localTierId: tierId,
      pagarmePlanId: pagarmePlanId2,
      billingCycle: "yearly",
      priceAtCreation: 47_040,
    });

    await PagarmePlanHistoryService.deactivateByTierId(tierId);

    const records = await db
      .select()
      .from(schema.pagarmePlanHistory)
      .where(eq(schema.pagarmePlanHistory.localTierId, tierId));

    expect(records.length).toBe(2);
    expect(records[0].isActive).toBe(false);
    expect(records[1].isActive).toBe(false);
  });

  test("deactivateByTierId() should not affect records from other tiers", async () => {
    const tierIdA = `tier-${crypto.randomUUID()}`;
    const tierIdB = `tier-${crypto.randomUUID()}`;
    const pagarmePlanIdA = `plan_pagarme_${crypto.randomUUID().slice(0, 8)}`;
    const pagarmePlanIdB = `plan_pagarme_${crypto.randomUUID().slice(0, 8)}`;

    await PagarmePlanHistoryService.record({
      localPlanId: testPlanId,
      localTierId: tierIdA,
      pagarmePlanId: pagarmePlanIdA,
      billingCycle: "monthly",
      priceAtCreation: 4900,
    });

    await PagarmePlanHistoryService.record({
      localPlanId: testPlanId,
      localTierId: tierIdB,
      pagarmePlanId: pagarmePlanIdB,
      billingCycle: "monthly",
      priceAtCreation: 5900,
    });

    await PagarmePlanHistoryService.deactivateByTierId(tierIdA);

    const [recordA] = await db
      .select()
      .from(schema.pagarmePlanHistory)
      .where(eq(schema.pagarmePlanHistory.localTierId, tierIdA));
    const [recordB] = await db
      .select()
      .from(schema.pagarmePlanHistory)
      .where(eq(schema.pagarmePlanHistory.localTierId, tierIdB));

    expect(recordA.isActive).toBe(false);
    expect(recordB.isActive).toBe(true);
  });

  test("listOrphaned() should return only inactive records", async () => {
    const activeTierId = `tier-${crypto.randomUUID()}`;
    const inactiveTierId = `tier-${crypto.randomUUID()}`;
    const activeId = `plan_pagarme_${crypto.randomUUID().slice(0, 8)}`;
    const inactiveId = `plan_pagarme_${crypto.randomUUID().slice(0, 8)}`;

    await PagarmePlanHistoryService.record({
      localPlanId: testPlanId,
      localTierId: activeTierId,
      pagarmePlanId: activeId,
      billingCycle: "monthly",
      priceAtCreation: 4900,
    });

    await PagarmePlanHistoryService.record({
      localPlanId: testPlanId,
      localTierId: inactiveTierId,
      pagarmePlanId: inactiveId,
      billingCycle: "monthly",
      priceAtCreation: 4900,
    });
    await PagarmePlanHistoryService.deactivateByTierId(inactiveTierId);

    const orphaned = await PagarmePlanHistoryService.listOrphaned();
    const orphanedIds = orphaned.map((r) => r.pagarmePlanId);

    expect(orphanedIds).toContain(inactiveId);
    expect(orphanedIds).not.toContain(activeId);
  });
});

describe("PlansService.replaceTiers deactivates history", () => {
  let app: TestApp;
  let adminHeaders: Record<string, string>;

  beforeAll(async () => {
    app = createTestApp();
    const { headers } = await UserFactory.createAdmin({ emailVerified: true });
    adminHeaders = headers;
  });

  test("updating plan tiers should deactivate history records for old tiers", async () => {
    // 1. Create a plan with tiers
    const createResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans`, {
        method: "POST",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: generateUniqueName("hist-replace"),
          displayName: "History Replace Test",
          limits: { features: GOLD_FEATURES },
          pricingTiers: generateTierPrices(5000),
        }),
      })
    );
    expect(createResponse.status).toBe(200);

    const createBody = await createResponse.json();
    const planId = createBody.data.id;
    const oldTierIds = createBody.data.pricingTiers.map(
      (t: { id: string }) => t.id
    );

    // 2. Simulate that some tiers had Pagar.me plans by inserting history records
    for (const tierId of oldTierIds.slice(0, 3)) {
      await PagarmePlanHistoryService.record({
        localPlanId: planId,
        localTierId: tierId,
        pagarmePlanId: `plan_pagarme_${crypto.randomUUID().slice(0, 8)}`,
        billingCycle: "monthly",
        priceAtCreation: 5000,
      });
    }

    // Verify they are active
    for (const tierId of oldTierIds.slice(0, 3)) {
      const [record] = await db
        .select()
        .from(schema.pagarmePlanHistory)
        .where(eq(schema.pagarmePlanHistory.localTierId, tierId));
      expect(record.isActive).toBe(true);
    }

    // 3. Update the plan with new tier prices (triggers replaceTiers)
    const updateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/payments/plans/${planId}`, {
        method: "PUT",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          pricingTiers: generateTierPrices(6000),
        }),
      })
    );
    expect(updateResponse.status).toBe(200);

    // 4. Verify old tier history records are now inactive
    for (const tierId of oldTierIds.slice(0, 3)) {
      const [record] = await db
        .select()
        .from(schema.pagarmePlanHistory)
        .where(eq(schema.pagarmePlanHistory.localTierId, tierId));
      expect(record.isActive).toBe(false);
    }

    // 5. Verify new tiers have different IDs
    const updateBody = await updateResponse.json();
    const newTierIds = updateBody.data.pricingTiers.map(
      (t: { id: string }) => t.id
    );
    for (const newId of newTierIds) {
      expect(oldTierIds).not.toContain(newId);
    }
  });
});

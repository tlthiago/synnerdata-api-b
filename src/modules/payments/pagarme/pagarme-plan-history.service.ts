import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

type BillingCycle = "monthly" | "yearly";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export abstract class PagarmePlanHistoryService {
  static async record(
    input: {
      localPlanId: string;
      localTierId: string;
      pagarmePlanId: string;
      billingCycle: BillingCycle;
      priceAtCreation: number;
    },
    tx?: Transaction
  ): Promise<void> {
    const conn = tx ?? db;
    await conn.insert(schema.pagarmePlanHistory).values({
      id: `pagarme-hist-${crypto.randomUUID()}`,
      localPlanId: input.localPlanId,
      localTierId: input.localTierId,
      pagarmePlanId: input.pagarmePlanId,
      billingCycle: input.billingCycle,
      priceAtCreation: input.priceAtCreation,
      isActive: true,
    });
  }

  static async deactivateByTierId(
    tierId: string,
    tx?: Transaction
  ): Promise<void> {
    const conn = tx ?? db;
    await conn
      .update(schema.pagarmePlanHistory)
      .set({ isActive: false })
      .where(eq(schema.pagarmePlanHistory.localTierId, tierId));
  }

  static async listOrphaned() {
    return await db
      .select()
      .from(schema.pagarmePlanHistory)
      .where(eq(schema.pagarmePlanHistory.isActive, false))
      .orderBy(schema.pagarmePlanHistory.createdAt);
  }
}

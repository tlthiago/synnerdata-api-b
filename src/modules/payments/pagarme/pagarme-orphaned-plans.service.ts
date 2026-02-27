import { Retry } from "@/lib/utils/retry";
import { PAGARME_RETRY_CONFIG, PagarmeClient } from "./client";
import { PagarmePlanHistoryService } from "./pagarme-plan-history.service";

export abstract class OrphanedPlansService {
  static async listOrphaned() {
    const orphanedPlans = await PagarmePlanHistoryService.listOrphaned();

    return {
      orphanedPlans: orphanedPlans.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
      total: orphanedPlans.length,
    };
  }

  static async cleanup() {
    const orphanedPlans = await PagarmePlanHistoryService.listOrphaned();

    const deactivated: { pagarmePlanId: string; name: string }[] = [];
    const kept: { pagarmePlanId: string; name: string; reason: string }[] = [];
    const errors: { pagarmePlanId: string; error: string }[] = [];

    for (const orphan of orphanedPlans) {
      try {
        const hasActive = await OrphanedPlansService.hasActiveSubscriptions(
          orphan.pagarmePlanId
        );

        if (hasActive) {
          const plan = await Retry.withRetry(
            () => PagarmeClient.getPlan(orphan.pagarmePlanId),
            PAGARME_RETRY_CONFIG.READ
          );
          kept.push({
            pagarmePlanId: orphan.pagarmePlanId,
            name: plan.name,
            reason: "Has active subscriptions",
          });
          continue;
        }

        const plan = await Retry.withRetry(
          () =>
            PagarmeClient.updatePlan(orphan.pagarmePlanId, {
              status: "inactive",
            } as never),
          PAGARME_RETRY_CONFIG.WRITE
        );

        deactivated.push({
          pagarmePlanId: orphan.pagarmePlanId,
          name: plan.name,
        });
      } catch (error) {
        errors.push({
          pagarmePlanId: orphan.pagarmePlanId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      result: { deactivated, kept, errors },
      summary: {
        totalOrphaned: orphanedPlans.length,
        deactivated: deactivated.length,
        kept: kept.length,
        errors: errors.length,
      },
    };
  }

  private static async hasActiveSubscriptions(
    pagarmePlanId: string
  ): Promise<boolean> {
    const response = await Retry.withRetry(
      () =>
        PagarmeClient.getSubscriptions({
          planId: pagarmePlanId,
          status: "active",
          size: 1,
        }),
      PAGARME_RETRY_CONFIG.READ
    );

    return response.data.length > 0;
  }
}
